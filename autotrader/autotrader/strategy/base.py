"""Strategy contract. A strategy sees bars up to and including the current one
and may emit a long entry signal. Exits are bracket orders (take-profit /
stop-loss / time) handled by the engine, so strategies stay small and honest:
they cannot peek forward and they cannot override the risk rails."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable

import pandas as pd


@dataclass(frozen=True)
class Signal:
    symbol: str
    reason: str = ""
    # Optional per-signal overrides of the configured bracket.
    take_profit_pct: float | None = None
    stop_loss_pct: float | None = None


class Strategy(ABC):
    name: str = "base"

    def __init__(self, **params: Any):
        self.params = params

    @property
    @abstractmethod
    def window(self) -> int:
        """Bars of history needed before ``on_bar`` is meaningful."""

    @abstractmethod
    def on_bar(self, symbol: str, bars: pd.DataFrame) -> Signal | None:
        """``bars`` ends at the bar that just closed. Return a Signal to go long
        at the next bar's open, or None."""

    def describe(self) -> str:
        p = ", ".join(f"{k}={v}" for k, v in self.params.items())
        return f"{self.name}({p})"


_REGISTRY: dict[str, type[Strategy]] = {}


def register(cls: type[Strategy]) -> type[Strategy]:
    _REGISTRY[cls.name] = cls
    return cls


def make_strategy(name: str, params: dict[str, Any] | None = None) -> Strategy:
    # Import concrete strategies lazily so registration happens on first use.
    from . import mean_reversion, momentum  # noqa: F401

    try:
        cls = _REGISTRY[name]
    except KeyError:
        raise ValueError(f"unknown strategy {name!r}; available: {sorted(_REGISTRY)}") from None
    return cls(**(params or {}))
