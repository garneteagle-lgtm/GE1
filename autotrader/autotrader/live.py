"""Live/paper runner. Same Strategy and RiskManager objects as the backtester,
driven by a broker and a bar feed instead of a historical array. One ``step``
per poll; a step acts only on symbols whose latest bar is new."""
from __future__ import annotations

import logging
import time
from datetime import date

import pandas as pd

from .broker.base import Broker
from .config import Config
from .data import Bars, session_date
from .risk import RiskManager
from .strategy import Strategy

log = logging.getLogger(__name__)


class LiveRunner:
    def __init__(self, cfg: Config, strategy: Strategy, broker: Broker, feed):
        """``feed`` must expose ``recent(symbols, timeframe, bars) -> Bars``."""
        self.cfg = cfg
        self.strategy = strategy
        self.broker = broker
        self.feed = feed
        self.risk = RiskManager(cfg.risk, cfg.targets, broker.account().equity)
        self.last_bar: dict[str, pd.Timestamp] = {}
        self.day: date | None = None
        self.stopped = False

    def step(self, bars: Bars | None = None) -> list[str]:
        """Run one cycle. Returns order ids submitted (for tests/logging)."""
        acct = self.broker.account()
        equity = acct.equity
        today = pd.Timestamp.now(tz="UTC")
        if bars is None:
            if not self.broker.market_open():
                return []
            bars = self.feed.recent(self.cfg.data.symbols, self.cfg.data.timeframe, self.strategy.window)
        latest = max((df.index[-1] for df in bars.values() if len(df)), default=today)
        day = session_date(latest)
        if day != self.day:
            self.day = day
            self.risk.new_day(day, equity)
            log.info("new session %s, equity $%.2f", day, equity)

        self.risk.update_equity(equity)
        if self.risk.state.halted:
            log.error("HALTED: %s — flattening and stopping", self.risk.state.halted_reason)
            self.broker.close_all()
            self.stopped = True
            return []
        if self.risk.daily_loss_breached(equity):
            log.warning("daily loss limit hit (%.2f%%) — flattening, no entries today", self.risk.day_pnl_pct(equity))
            self.broker.close_all()
            return []
        mtc = self.broker.minutes_to_close()
        if self.cfg.targets.flat_at_close and mtc is not None and mtc <= self.cfg.live.flatten_minutes_before_close:
            if self.broker.positions():
                log.info("%.1f min to close — flattening", mtc)
                self.broker.close_all()
            return []

        held = {p.symbol for p in self.broker.positions()}
        submitted: list[str] = []
        t = self.cfg.targets
        for sym, df in bars.items():
            if sym in held or len(df) < self.strategy.window:
                continue
            ts = df.index[-1]
            if self.last_bar.get(sym) == ts:
                continue  # already acted on this bar
            self.last_bar[sym] = ts
            sig = self.strategy.on_bar(sym, df.tail(self.strategy.window))
            if sig is None:
                continue
            ok, why = self.risk.can_open(equity, len(held) + len(submitted))
            if not ok:
                log.info("signal %s ignored: %s", sym, why)
                continue
            price = float(df["close"].iloc[-1])
            sl_pct = sig.stop_loss_pct or t.stop_loss_pct
            tp_pct = sig.take_profit_pct or t.take_profit_pct
            qty = self.risk.position_size(equity, price, sl_pct, cash=acct.cash)
            if qty <= 0:
                continue
            oid = self.broker.submit_bracket(sym, qty, price * (1 + tp_pct / 100), price * (1 - sl_pct / 100))
            log.info("%s %s x%d @~%.2f (%s) -> %s", sym, sig.reason, qty, price, self.strategy.name, oid)
            submitted.append(oid)
        return submitted

    def run(self) -> None:
        log.info("runner started: %s on %s every %ds", self.strategy.describe(), self.cfg.data.symbols, self.cfg.live.poll_seconds)
        while not self.stopped:
            try:
                self.step()
            except KeyboardInterrupt:
                log.info("interrupted; leaving positions to their brackets")
                return
            except Exception:  # keep the loop alive; the risk rails are the safety, not this
                log.exception("step failed")
            time.sleep(self.cfg.live.poll_seconds)
