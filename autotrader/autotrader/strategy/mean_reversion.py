"""Intraday mean reversion: buy when price is ``z_entry`` standard deviations
below its rolling mean, betting on a snap back to the mean. Works best on
liquid, range-bound names; loses in trending sell-offs, which is what the
stop-loss is for."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Signal, Strategy, register


@register
class MeanReversion(Strategy):
    name = "mean_reversion"

    def __init__(self, lookback: int = 20, z_entry: float = -2.0, min_volume: float = 0.0):
        super().__init__(lookback=lookback, z_entry=z_entry, min_volume=min_volume)
        self.lookback = int(lookback)
        self.z_entry = float(z_entry)
        self.min_volume = float(min_volume)

    @property
    def window(self) -> int:
        return self.lookback + 1

    def on_bar(self, symbol: str, bars: pd.DataFrame) -> Signal | None:
        if len(bars) < self.window:
            return None
        close = bars["close"].to_numpy()
        ref = close[-self.lookback - 1 : -1]  # exclude the current bar from the baseline
        mean, std = ref.mean(), ref.std(ddof=0)
        if std <= 0 or not np.isfinite(std):
            return None
        z = (close[-1] - mean) / std
        if z <= self.z_entry and bars["volume"].iloc[-1] >= self.min_volume:
            return Signal(symbol, reason=f"z={z:.2f}")
        return None
