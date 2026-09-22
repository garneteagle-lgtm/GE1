"""Risk rails shared by the backtester and the live runner. If a rule lives
anywhere else, it can drift between the two — so it lives here."""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from .config import Risk, Targets


@dataclass
class RiskState:
    day: date | None = None
    day_start_equity: float = 0.0
    peak_equity: float = 0.0
    halted: bool = False
    halted_reason: str = ""


class RiskManager:
    def __init__(self, risk: Risk, targets: Targets, starting_equity: float):
        self.cfg = risk
        self.targets = targets
        self.state = RiskState(peak_equity=starting_equity, day_start_equity=starting_equity)

    # -- lifecycle -----------------------------------------------------------
    def new_day(self, day: date, equity: float) -> None:
        self.state.day = day
        self.state.day_start_equity = equity

    def update_equity(self, equity: float) -> None:
        s = self.state
        s.peak_equity = max(s.peak_equity, equity)
        if s.peak_equity > 0 and self.drawdown_pct(equity) >= self.cfg.max_drawdown_pct and not s.halted:
            s.halted = True
            s.halted_reason = (
                f"drawdown {self.drawdown_pct(equity):.2f}% >= max {self.cfg.max_drawdown_pct}%"
            )

    # -- queries ---------------------------------------------------------------
    def drawdown_pct(self, equity: float) -> float:
        p = self.state.peak_equity
        return 0.0 if p <= 0 else (p - equity) / p * 100.0

    def day_pnl_pct(self, equity: float) -> float:
        d = self.state.day_start_equity
        return 0.0 if d <= 0 else (equity - d) / d * 100.0

    def daily_loss_breached(self, equity: float) -> bool:
        return self.day_pnl_pct(equity) <= -self.cfg.max_daily_loss_pct

    def can_open(self, equity: float, open_positions: int) -> tuple[bool, str]:
        s = self.state
        if s.halted:
            return False, f"halted: {s.halted_reason}"
        if self.daily_loss_breached(equity):
            return False, f"daily loss limit hit ({self.day_pnl_pct(equity):.2f}%)"
        if open_positions >= self.cfg.max_positions:
            return False, f"max positions ({self.cfg.max_positions}) open"
        return True, "ok"

    def position_size(self, equity: float, price: float, stop_loss_pct: float, cash: float | None = None) -> int:
        """Whole shares such that hitting the stop loses ~max_risk_per_trade_pct
        of equity, capped by max_position_pct and (if given) available cash."""
        if price <= 0 or stop_loss_pct <= 0:
            return 0
        risk_dollars = equity * self.cfg.max_risk_per_trade_pct / 100.0
        per_share_risk = price * stop_loss_pct / 100.0
        qty = risk_dollars / per_share_risk
        qty = min(qty, equity * self.cfg.max_position_pct / 100.0 / price)
        if cash is not None:
            qty = min(qty, cash / price)
        return max(0, math.floor(qty))
