"""Event-driven backtester. Bars are processed in timestamp order across all
symbols; a signal on bar t is filled at bar t+1's open (never at t's close),
bracket exits are evaluated pessimistically (stop before target when both
touch in one bar), and every fill pays slippage + commission."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import Config
from .data import NY, Bars, session_dates
from .risk import RiskManager
from .strategy import Signal, Strategy

log = logging.getLogger(__name__)


@dataclass
class Position:
    symbol: str
    entry_time: pd.Timestamp
    entry_price: float
    qty: int
    take_profit: float
    stop_loss: float
    bars_held: int = 0
    reason: str = ""


@dataclass
class Trade:
    symbol: str
    entry_time: pd.Timestamp
    entry_price: float
    exit_time: pd.Timestamp
    exit_price: float
    qty: int
    pnl: float
    pnl_pct: float
    exit_reason: str
    bars_held: int
    entry_reason: str = ""


@dataclass
class BacktestResult:
    equity: pd.Series                 # mark-to-market equity per bar
    daily: pd.DataFrame               # per session: equity, return_pct
    trades: list[Trade] = field(default_factory=list)
    starting_equity: float = 0.0
    halted_reason: str = ""
    blocked: dict[str, int] = field(default_factory=dict)  # why entries were refused

    def trades_frame(self) -> pd.DataFrame:
        return pd.DataFrame([t.__dict__ for t in self.trades])


class _SymbolData:
    """Numpy views of one symbol's bars plus a ts -> row lookup."""

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.o = df["open"].to_numpy(float)
        self.h = df["high"].to_numpy(float)
        self.l = df["low"].to_numpy(float)
        self.c = df["close"].to_numpy(float)
        self.days = session_dates(df.index)
        n = len(df)
        self.last_of_day = np.ones(n, dtype=bool)
        if n > 1:
            self.last_of_day[:-1] = self.days[:-1] != self.days[1:]
        self.row = {ts: i for i, ts in enumerate(df.index)}


class Backtester:
    def __init__(self, cfg: Config, strategy: Strategy, bars: Bars):
        self.cfg = cfg
        self.strategy = strategy
        self.data = {s: _SymbolData(df) for s, df in bars.items() if len(df)}
        if not self.data:
            raise ValueError("no bars supplied")
        self.risk = RiskManager(cfg.risk, cfg.targets, cfg.starting_equity)

    # -- helpers -------------------------------------------------------------
    def _slip(self, price: float, side: str) -> float:
        s = self.cfg.costs.slippage_bps / 10_000.0
        return price * (1 + s) if side == "buy" else price * (1 - s)

    def _commission(self, qty: int) -> float:
        return self.cfg.costs.commission_per_share * qty

    # -- main loop -------------------------------------------------------------
    def run(self) -> BacktestResult:
        cfg, t = self.cfg, self.cfg.targets
        all_ts = sorted(set().union(*(d.df.index for d in self.data.values())))
        cash = cfg.starting_equity
        positions: dict[str, Position] = {}
        pending: dict[str, Signal] = {}
        last_close: dict[str, float] = {}
        trades: list[Trade] = []
        blocked: dict[str, int] = {}
        eq_vals: list[float] = []
        current_day = None
        strat_window = self.strategy.window

        def equity() -> float:
            return cash + sum(p.qty * last_close[p.symbol] for p in positions.values())

        def close_position(p: Position, price: float, ts: pd.Timestamp, why: str) -> None:
            nonlocal cash
            fill = self._slip(price, "sell")
            proceeds = fill * p.qty - self._commission(p.qty)
            cash += proceeds
            cost = p.entry_price * p.qty
            pnl = proceeds - cost
            trades.append(
                Trade(
                    symbol=p.symbol, entry_time=p.entry_time, entry_price=p.entry_price,
                    exit_time=ts, exit_price=fill, qty=p.qty, pnl=pnl,
                    pnl_pct=pnl / cost * 100.0, exit_reason=why, bars_held=p.bars_held,
                    entry_reason=p.reason,
                )
            )
            del positions[p.symbol]

        for ts in all_ts:
            day = ts.tz_convert(NY).date()
            if day != current_day:
                current_day = day
                self.risk.new_day(day, equity() if last_close else cash)

            # 1. fill pending entries at this bar's open
            for sym in list(pending):
                d = self.data[sym]
                i = d.row.get(ts)
                if i is None:
                    continue
                sig = pending.pop(sym)
                eq = equity() if last_close else cash
                ok, why = self.risk.can_open(eq, len(positions))
                if not ok:
                    blocked[why.split(" (")[0]] = blocked.get(why.split(" (")[0], 0) + 1
                    continue
                sl_pct = sig.stop_loss_pct or t.stop_loss_pct
                tp_pct = sig.take_profit_pct or t.take_profit_pct
                fill = self._slip(d.o[i], "buy")
                qty = self.risk.position_size(eq, fill, sl_pct, cash=cash - self._commission(1))
                if qty <= 0:
                    blocked["size=0"] = blocked.get("size=0", 0) + 1
                    continue
                cash -= fill * qty + self._commission(qty)
                positions[sym] = Position(
                    symbol=sym, entry_time=ts, entry_price=fill, qty=qty,
                    take_profit=fill * (1 + tp_pct / 100.0),
                    stop_loss=fill * (1 - sl_pct / 100.0), reason=sig.reason,
                )

            # 2. manage open positions on this bar
            for sym in list(positions):
                p = positions[sym]
                d = self.data[sym]
                i = d.row.get(ts)
                if i is None:
                    continue
                # A position entered at this bar's open is exposed to this bar's
                # range too. Gaps through a level fill at the open, not the level.
                if d.l[i] <= p.stop_loss:
                    close_position(p, min(p.stop_loss, d.o[i]), ts, "stop_loss")
                    continue
                if d.h[i] >= p.take_profit:
                    close_position(p, max(p.take_profit, d.o[i]), ts, "take_profit")
                    continue
                p.bars_held += 1
                if p.bars_held >= t.max_holding_bars:
                    close_position(p, d.c[i], ts, "time")
                    continue
                if t.flat_at_close and d.last_of_day[i]:
                    close_position(p, d.c[i], ts, "eod")

            # 3. mark to market
            for sym, d in self.data.items():
                i = d.row.get(ts)
                if i is not None:
                    last_close[sym] = d.c[i]
            eq = equity()
            eq_vals.append(eq)
            self.risk.update_equity(eq)

            # 4. signals for the next bar
            if self.risk.state.halted:
                continue
            for sym, d in self.data.items():
                i = d.row.get(ts)
                if i is None or sym in positions or sym in pending:
                    continue
                if i + 1 < strat_window:
                    continue
                hist = d.df.iloc[i + 1 - strat_window : i + 1]
                sig = self.strategy.on_bar(sym, hist)
                if sig is None:
                    continue
                ok, why = self.risk.can_open(eq, len(positions) + len(pending))
                if ok:
                    pending[sym] = sig
                else:
                    key = why.split(" (")[0]
                    blocked[key] = blocked.get(key, 0) + 1

        # liquidate anything left at the final close so the equity curve is honest
        final_ts = all_ts[-1]
        for sym in list(positions):
            close_position(positions[sym], last_close[sym], final_ts, "end")
        if positions == {} and eq_vals:
            eq_vals[-1] = cash

        equity_s = pd.Series(eq_vals, index=pd.DatetimeIndex(all_ts), name="equity")
        daily_eq = equity_s.groupby(session_dates(equity_s.index)).last()
        prev = np.concatenate([[cfg.starting_equity], daily_eq.to_numpy()[:-1]])
        daily = pd.DataFrame(
            {"equity": daily_eq.to_numpy(), "return_pct": (daily_eq.to_numpy() / prev - 1) * 100.0},
            index=pd.Index(daily_eq.index, name="session"),
        )
        return BacktestResult(
            equity=equity_s, daily=daily, trades=trades, starting_equity=cfg.starting_equity,
            halted_reason=self.risk.state.halted_reason, blocked=blocked,
        )
