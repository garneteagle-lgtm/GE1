"""Compounding arithmetic and a bootstrap Monte Carlo over observed daily
returns — so the plan is judged on distributions, not a single lucky path."""
from __future__ import annotations

import numpy as np

TRADING_DAYS = 252


def grow(start: float, rate_pct: float, periods: int) -> float:
    return start * (1 + rate_pct / 100.0) ** periods


def annualize_daily(rate_pct: float, days: int = TRADING_DAYS) -> float:
    """Daily rate -> annual % (compounded)."""
    return ((1 + rate_pct / 100.0) ** days - 1) * 100.0


def daily_for_annual(annual_pct: float, days: int = TRADING_DAYS) -> float:
    """Annual % -> daily rate that compounds to it."""
    return ((1 + annual_pct / 100.0) ** (1 / days) - 1) * 100.0


def projection_table(start: float, rate_pct: float, periods: int, step: int) -> list[tuple[int, float]]:
    return [(p, grow(start, rate_pct, p)) for p in range(0, periods + 1, step)]


def monte_carlo(
    daily_returns_pct: np.ndarray,
    days: int = TRADING_DAYS,
    n_paths: int = 5_000,
    seed: int = 0,
    ruin_drawdown_pct: float = 10.0,
) -> dict:
    """Resample observed daily returns with replacement into ``n_paths`` futures.
    Reports the spread of terminal multiples and how often the max-drawdown
    circuit breaker would have tripped."""
    r = np.asarray(daily_returns_pct, float) / 100.0
    if len(r) == 0:
        raise ValueError("need at least one daily return")
    rng = np.random.default_rng(seed)
    draws = rng.choice(r, size=(n_paths, days), replace=True)
    paths = np.cumprod(1 + draws, axis=1)
    peak = np.maximum.accumulate(paths, axis=1)
    dd = (peak - paths) / peak
    final = paths[:, -1]
    pct = lambda q: float(np.percentile(final, q))
    return {
        "paths": n_paths,
        "days": days,
        "p5": pct(5), "p25": pct(25), "p50": pct(50), "p75": pct(75), "p95": pct(95),
        "prob_loss": float((final < 1).mean()),
        "prob_ruin": float((dd.max(axis=1) >= ruin_drawdown_pct / 100.0).mean()),
        "ruin_drawdown_pct": ruin_drawdown_pct,
    }


def format_monte_carlo(mc: dict, start_equity: float) -> str:
    L = [
        f"MONTE CARLO  {mc['paths']} bootstrap paths x {mc['days']} sessions (from ${start_equity:,.0f})",
        f"  5th pct  ${start_equity * mc['p5']:>12,.0f}   ({(mc['p5'] - 1) * 100:+.1f}%)",
        f"  25th pct ${start_equity * mc['p25']:>12,.0f}   ({(mc['p25'] - 1) * 100:+.1f}%)",
        f"  median   ${start_equity * mc['p50']:>12,.0f}   ({(mc['p50'] - 1) * 100:+.1f}%)",
        f"  75th pct ${start_equity * mc['p75']:>12,.0f}   ({(mc['p75'] - 1) * 100:+.1f}%)",
        f"  95th pct ${start_equity * mc['p95']:>12,.0f}   ({(mc['p95'] - 1) * 100:+.1f}%)",
        f"  P(finish below start) = {mc['prob_loss'] * 100:.1f}%    "
        f"P(hit {mc['ruin_drawdown_pct']:.0f}% drawdown breaker) = {mc['prob_ruin'] * 100:.1f}%",
    ]
    return "\n".join(L)
