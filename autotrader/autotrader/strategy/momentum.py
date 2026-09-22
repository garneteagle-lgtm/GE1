"""Breakout momentum: buy when the bar closes above the prior ``lookback``-bar
high on volume ``volume_mult`` x the average. The opposite bet to mean
reversion, useful for comparing regimes."""
from __future__ import annotations

import pandas as pd

from .base import Signal, Strategy, register


@register
class Momentum(Strategy):
    name = "momentum"

    def __init__(self, lookback: int = 20, volume_mult: float = 1.5):
        super().__init__(lookback=lookback, volume_mult=volume_mult)
        self.lookback = int(lookback)
        self.volume_mult = float(volume_mult)

    @property
    def window(self) -> int:
        return self.lookback + 1

    def on_bar(self, symbol: str, bars: pd.DataFrame) -> Signal | None:
        if len(bars) < self.window:
            return None
        prior = bars.iloc[-self.lookback - 1 : -1]
        last = bars.iloc[-1]
        avg_vol = prior["volume"].mean()
        if last["close"] > prior["high"].max() and last["volume"] >= self.volume_mult * avg_vol:
            return Signal(symbol, reason=f"breakout>{prior['high'].max():.2f}")
        return None
