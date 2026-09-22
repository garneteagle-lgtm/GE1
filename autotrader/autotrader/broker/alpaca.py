"""Alpaca broker. Paper by default. Live requires AUTOTRADER_LIVE to be set to
the exact phrase below — there is no flag, no config key, no shortcut."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from ..data import alpaca_credentials
from .base import Account, Broker, BrokerPosition

log = logging.getLogger(__name__)

LIVE_PHRASE = "I_ACCEPT_REAL_MONEY_RISK"


def _round_price(p: float) -> float:
    # Alpaca sub-penny rule: >= $1.00 must be 2dp; below $1.00 up to 4dp.
    return round(p, 2) if p >= 1 else round(p, 4)


class AlpacaBroker(Broker):
    def __init__(self, paper: bool = True):
        from alpaca.trading.client import TradingClient

        if not paper and os.getenv("AUTOTRADER_LIVE", "") != LIVE_PHRASE:
            raise RuntimeError(
                f"Live trading refused. Set AUTOTRADER_LIVE={LIVE_PHRASE} only after the "
                "strategy has survived paper trading."
            )
        key, secret = alpaca_credentials()
        self.paper = paper
        self.client = TradingClient(key, secret, paper=paper)
        acct = self.client.get_account()
        log.warning("Alpaca %s account %s, equity $%s", "PAPER" if paper else "*** LIVE ***", acct.account_number, acct.equity)

    def account(self) -> Account:
        a = self.client.get_account()
        return Account(equity=float(a.equity), cash=float(a.cash), buying_power=float(a.buying_power))

    def positions(self) -> list[BrokerPosition]:
        out = []
        for p in self.client.get_all_positions():
            out.append(
                BrokerPosition(
                    symbol=p.symbol, qty=int(float(p.qty)), avg_entry=float(p.avg_entry_price),
                    market_value=float(p.market_value), unrealized_pnl=float(p.unrealized_pl),
                )
            )
        return out

    def submit_bracket(self, symbol: str, qty: int, take_profit: float, stop_loss: float) -> str:
        from alpaca.trading.enums import OrderClass, OrderSide, TimeInForce
        from alpaca.trading.requests import MarketOrderRequest, StopLossRequest, TakeProfitRequest

        req = MarketOrderRequest(
            symbol=symbol,
            qty=qty,
            side=OrderSide.BUY,
            time_in_force=TimeInForce.DAY,
            order_class=OrderClass.BRACKET,
            take_profit=TakeProfitRequest(limit_price=_round_price(take_profit)),
            stop_loss=StopLossRequest(stop_price=_round_price(stop_loss)),
        )
        order = self.client.submit_order(req)
        log.info("submitted bracket %s x%d tp=%.2f sl=%.2f id=%s", symbol, qty, take_profit, stop_loss, order.id)
        return str(order.id)

    def close_all(self) -> None:
        self.client.cancel_orders()
        self.client.close_all_positions(cancel_orders=True)
        log.warning("flattened all positions")

    def _clock(self):
        return self.client.get_clock()

    def market_open(self) -> bool:
        return bool(self._clock().is_open)

    def minutes_to_close(self) -> float | None:
        c = self._clock()
        if not c.is_open:
            return None
        now = datetime.now(timezone.utc)
        return (c.next_close - now).total_seconds() / 60.0
