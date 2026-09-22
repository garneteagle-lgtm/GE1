"""Performance summary. The single most important number here is
``pct_days_hit_target``: how often the system actually delivered the daily
return you asked for."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .backtest import BacktestResult
from .config import Config

TRADING_DAYS = 252


def max_drawdown_pct(equity: pd.Series) -> float:
    peak = equity.cummax()
    return float(((equity - peak) / peak).min() * -100.0) if len(equity) else 0.0


def summarize(res: BacktestResult, cfg: Config) -> dict:
    d = res.daily["return_pct"].to_numpy(float)
    n_days = len(d)
    start, end = res.starting_equity, float(res.equity.iloc[-1]) if len(res.equity) else res.starting_equity
    total_ret = (end / start - 1) * 100.0
    mean_d, std_d = (float(d.mean()), float(d.std(ddof=1))) if n_days > 1 else (0.0, 0.0)
    cagr = ((end / start) ** (TRADING_DAYS / n_days) - 1) * 100.0 if n_days and end > 0 else 0.0
    sharpe = mean_d / std_d * np.sqrt(TRADING_DAYS) if std_d > 0 else 0.0
    target = cfg.targets.daily_return_pct

    tf = res.trades_frame()
    n = len(tf)
    wins = tf[tf["pnl"] > 0] if n else tf
    losses = tf[tf["pnl"] <= 0] if n else tf
    gross_win = float(wins["pnl"].sum()) if n else 0.0
    gross_loss = float(-losses["pnl"].sum()) if n else 0.0

    return {
        "start_equity": start,
        "end_equity": end,
        "total_return_pct": total_ret,
        "sessions": n_days,
        "avg_daily_return_pct": mean_d,
        "median_daily_return_pct": float(np.median(d)) if n_days else 0.0,
        "daily_return_std_pct": std_d,
        "best_day_pct": float(d.max()) if n_days else 0.0,
        "worst_day_pct": float(d.min()) if n_days else 0.0,
        "annualized_return_pct": cagr,
        "sharpe": float(sharpe),
        "max_drawdown_pct": max_drawdown_pct(res.equity),
        "target_daily_pct": target,
        "pct_days_hit_target": float((d >= target).mean() * 100.0) if n_days else 0.0,
        "target_equity_if_hit_daily": start * (1 + target / 100.0) ** n_days,
        "trades": n,
        "trades_per_day": n / n_days if n_days else 0.0,
        "win_rate_pct": len(wins) / n * 100.0 if n else 0.0,
        "avg_win_pct": float(wins["pnl_pct"].mean()) if len(wins) else 0.0,
        "avg_loss_pct": float(losses["pnl_pct"].mean()) if len(losses) else 0.0,
        "expectancy_pct": float(tf["pnl_pct"].mean()) if n else 0.0,
        "profit_factor": gross_win / gross_loss if gross_loss > 0 else float("inf") if gross_win > 0 else 0.0,
        "exit_reasons": tf["exit_reason"].value_counts().to_dict() if n else {},
        "entries_blocked": res.blocked,
        "halted": res.halted_reason,
    }


def format_report(s: dict, strategy_desc: str = "") -> str:
    L = []
    add = L.append
    add("=" * 64)
    add(f"BACKTEST  {strategy_desc}")
    add("=" * 64)
    add(f"Equity        ${s['start_equity']:>12,.2f} -> ${s['end_equity']:>12,.2f}   ({s['total_return_pct']:+.2f}%)")
    add(f"Sessions      {s['sessions']}     Annualized {s['annualized_return_pct']:+.1f}%     Sharpe {s['sharpe']:.2f}")
    add(f"Max drawdown  {s['max_drawdown_pct']:.2f}%")
    add("")
    add(f"Daily return  avg {s['avg_daily_return_pct']:+.3f}%  median {s['median_daily_return_pct']:+.3f}%  "
        f"std {s['daily_return_std_pct']:.3f}%  best {s['best_day_pct']:+.2f}%  worst {s['worst_day_pct']:+.2f}%")
    add("-" * 64)
    add(f"TARGET {s['target_daily_pct']:.2f}%/day: hit on {s['pct_days_hit_target']:.1f}% of sessions.")
    add(f"  If hit every session, equity would be ${s['target_equity_if_hit_daily']:,.2f}; "
        f"actual ${s['end_equity']:,.2f}.")
    add("-" * 64)
    add(f"Trades {s['trades']}  ({s['trades_per_day']:.2f}/day)   win rate {s['win_rate_pct']:.1f}%   "
        f"profit factor {s['profit_factor']:.2f}")
    add(f"Avg win {s['avg_win_pct']:+.3f}%   avg loss {s['avg_loss_pct']:+.3f}%   expectancy {s['expectancy_pct']:+.3f}%/trade")
    add(f"Exits  {s['exit_reasons']}")
    if s["entries_blocked"]:
        add(f"Entries refused by risk rails: {s['entries_blocked']}")
    if s["halted"]:
        add(f"!! SYSTEM HALTED: {s['halted']}")
    add("=" * 64)
    return "\n".join(L)
