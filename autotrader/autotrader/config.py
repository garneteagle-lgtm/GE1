"""Typed configuration loaded from YAML. Every section has safe defaults so a
partial file works; unknown keys fail loudly rather than silently doing nothing."""
from __future__ import annotations

from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any

import yaml


def _build(cls, raw: dict | None):
    raw = raw or {}
    allowed = {f.name for f in fields(cls)}
    unknown = set(raw) - allowed
    if unknown:
        raise ValueError(f"{cls.__name__}: unknown config keys {sorted(unknown)}")
    return cls(**raw)


@dataclass
class Targets:
    daily_return_pct: float = 1.0
    take_profit_pct: float = 1.0
    stop_loss_pct: float = 0.5
    max_holding_bars: int = 26
    flat_at_close: bool = True


@dataclass
class Risk:
    max_risk_per_trade_pct: float = 0.5
    max_position_pct: float = 20.0
    max_positions: int = 5
    max_daily_loss_pct: float = 2.0
    max_drawdown_pct: float = 10.0


@dataclass
class Costs:
    commission_per_share: float = 0.0
    slippage_bps: float = 5.0


@dataclass
class Data:
    timeframe: str = "15Min"
    symbols: list[str] = field(default_factory=lambda: ["SPY", "QQQ"])
    start: str | None = None
    end: str | None = None
    cache_dir: str = "data_cache"


@dataclass
class StrategyCfg:
    name: str = "mean_reversion"
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class Live:
    poll_seconds: int = 30
    flatten_minutes_before_close: int = 5


@dataclass
class Config:
    starting_equity: float = 25_000.0
    targets: Targets = field(default_factory=Targets)
    risk: Risk = field(default_factory=Risk)
    costs: Costs = field(default_factory=Costs)
    data: Data = field(default_factory=Data)
    strategy: StrategyCfg = field(default_factory=StrategyCfg)
    live: Live = field(default_factory=Live)

    def validate(self) -> None:
        t, r = self.targets, self.risk
        if t.take_profit_pct <= 0 or t.stop_loss_pct <= 0:
            raise ValueError("take_profit_pct and stop_loss_pct must be > 0")
        if r.max_risk_per_trade_pct > 5:
            raise ValueError("max_risk_per_trade_pct > 5% is reckless; refusing to run")
        if r.max_daily_loss_pct <= 0 or r.max_drawdown_pct <= 0:
            raise ValueError("loss limits must be > 0")
        if self.starting_equity <= 0:
            raise ValueError("starting_equity must be > 0")


def load(path: str | Path | None = None) -> Config:
    """Load a YAML config; ``None`` returns pure defaults."""
    raw: dict[str, Any] = {}
    if path is not None:
        raw = yaml.safe_load(Path(path).read_text()) or {}
    cfg = Config(
        starting_equity=float(raw.get("starting_equity", 25_000.0)),
        targets=_build(Targets, raw.get("targets")),
        risk=_build(Risk, raw.get("risk")),
        costs=_build(Costs, raw.get("costs")),
        data=_build(Data, raw.get("data")),
        strategy=_build(StrategyCfg, raw.get("strategy")),
        live=_build(Live, raw.get("live")),
    )
    cfg.validate()
    return cfg
