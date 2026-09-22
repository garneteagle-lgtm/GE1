"""In-process paper broker for dry runs and tests. Fills instantly at the
last marked price; bracket exits are checked when new prices are marked."""
from __future__ import annotations

import itertools
from dataclasses import dataclass

from .base import Account, Broker, BrokerPosition


@dataclass
class _Bracket:
    symbol: str
    qty: int
    entry: float
    take_profit: float
    stop_loss: float


class PaperBroker(Broker):
    def __init__(self, cash: float = 25_000.0, is_open: bool = True, minutes_to_close: float = 300.0):
        self.cash = cash
        self.prices: dict[str, float] = {}
        self.open: dict[str, _Bracket] = {}
        self.fills: list[tuple[str, str, int, float]] = []  # (symbol, side, qty, price)
        self._ids = itertools.count(1)
        self._open = is_open
        self._mtc = minutes_to_close

    # -- simulation controls --------------------------------------------------
    def mark(self, symbol: str, price: float, high: float | None = None, low: float | None = None) -> None:
        self.prices[symbol] = price
        b = self.open.get(symbol)
        if b is None:
            return
        lo, hi = (low if low is not None else price), (high if high is not None else price)
        if lo <= b.stop_loss:
            self._exit(b, b.stop_loss)
        elif hi >= b.take_profit:
            self._exit(b, b.take_profit)

    def set_clock(self, is_open: bool, minutes_to_close: float | None) -> None:
        self._open, self._mtc = is_open, minutes_to_close

    def _exit(self, b: _Bracket, price: float) -> None:
        self.cash += b.qty * price
        self.fills.append((b.symbol, "sell", b.qty, price))
        del self.open[b.symbol]

    # -- Broker interface ----------------------------------------------------
    def account(self) -> Account:
        mv = sum(b.qty * self.prices.get(b.symbol, b.entry) for b in self.open.values())
        return Account(equity=self.cash + mv, cash=self.cash, buying_power=self.cash)

    def positions(self) -> list[BrokerPosition]:
        out = []
        for b in self.open.values():
            px = self.prices.get(b.symbol, b.entry)
            out.append(BrokerPosition(b.symbol, b.qty, b.entry, b.qty * px, b.qty * (px - b.entry)))
        return out

    def submit_bracket(self, symbol: str, qty: int, take_profit: float, stop_loss: float) -> str:
        if symbol in self.open:
            raise ValueError(f"already long {symbol}")
        px = self.prices[symbol]
        cost = px * qty
        if cost > self.cash:
            raise ValueError("insufficient cash")
        self.cash -= cost
        self.open[symbol] = _Bracket(symbol, qty, px, take_profit, stop_loss)
        self.fills.append((symbol, "buy", qty, px))
        return f"paper-{next(self._ids)}"

    def close_all(self) -> None:
        for b in list(self.open.values()):
            self._exit(b, self.prices.get(b.symbol, b.entry))

    def market_open(self) -> bool:
        return self._open

    def minutes_to_close(self) -> float | None:
        return self._mtc if self._open else None
