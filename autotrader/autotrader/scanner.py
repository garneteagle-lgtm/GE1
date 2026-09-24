"""Daily S&P 500 behaviour scan. For every constituent, describe how the stock
*moves* — volatility, range, gaps, trend, mean-reversion tendency, liquidity,
beta — and in particular how often a 1% move was actually on offer intraday.
Then roll it up into market breadth, sector tables and ranked lists."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .data import Bars

log = logging.getLogger(__name__)

MIN_BARS = 60
BENCHMARK = "SPY"


# ---------------------------------------------------------------------------
# per-symbol metrics
# ---------------------------------------------------------------------------
def _rsi(close: np.ndarray, n: int = 14) -> float:
    d = np.diff(close[-(n + 1):])
    if len(d) < n:
        return np.nan
    up, dn = d.clip(min=0).mean(), (-d).clip(min=0).mean()
    if dn == 0:
        return 100.0
    return 100 - 100 / (1 + up / dn)


def _pct_change(close: np.ndarray, n: int) -> float:
    return (close[-1] / close[-1 - n] - 1) * 100 if len(close) > n else np.nan


def symbol_metrics(df: pd.DataFrame, spy_ret: pd.Series | None = None, target_pct: float = 1.0,
                   stop_pct: float = 0.5) -> dict | None:
    """One row of behaviour statistics for one symbol's daily bars."""
    df = df.dropna()
    if len(df) < MIN_BARS:
        return None
    o, h, l, c, v = (df[k].to_numpy(float) for k in ("open", "high", "low", "close", "volume"))
    ret = pd.Series(np.diff(np.log(c)), index=df.index[1:])
    r = ret.to_numpy()
    prev_c = c[:-1]

    # volatility & range
    vol20 = r[-20:].std(ddof=1) * np.sqrt(252) * 100
    vol250 = r[-250:].std(ddof=1) * np.sqrt(252) * 100
    tr = np.maximum(h[1:] - l[1:], np.maximum(np.abs(h[1:] - prev_c), np.abs(l[1:] - prev_c)))
    atr14_pct = tr[-14:].mean() / c[-1] * 100
    range20_pct = ((h - l) / c)[-20:].mean() * 100

    # was the bracket reachable? (open -> high, open -> low, close/close)
    up_from_open = (h / o - 1) * 100
    dn_from_open = (l / o - 1) * 100
    cc = (c[1:] / prev_c - 1) * 100
    reach_target = up_from_open >= target_pct
    hit_stop = dn_from_open <= -stop_pct
    # crude odds of target-before-stop: days target reached and stop not hit
    clean_target = reach_target & ~hit_stop

    # gaps
    gap = (o[1:] / prev_c - 1) * 100

    # trend
    sma50 = c[-50:].mean()
    sma200 = c[-200:].mean() if len(c) >= 200 else np.nan
    sma50_prev = c[-70:-20].mean() if len(c) >= 70 else np.nan
    sma50_slope = (sma50 / sma50_prev - 1) * 100 if np.isfinite(sma50_prev) else np.nan
    hi52 = h[-252:].max()
    lo52 = l[-252:].min()

    # behaviour
    autocorr = float(pd.Series(r[-120:]).autocorr(1)) if len(r) >= 30 else np.nan
    beta = corr = np.nan
    if spy_ret is not None:
        j = ret.align(spy_ret, join="inner")
        a, b = j[0].to_numpy()[-120:], j[1].to_numpy()[-120:]
        if len(a) >= 30 and b.std() > 0:
            beta = float(np.cov(a, b)[0, 1] / b.var(ddof=1))
            corr = float(np.corrcoef(a, b)[0, 1])

    above50 = bool(c[-1] > sma50)
    above200 = bool(c[-1] > sma200) if np.isfinite(sma200) else above50  # < 200 bars: lean on SMA50
    slope = sma50_slope if np.isfinite(sma50_slope) else 0.0
    if above50 and above200 and slope > 0:
        regime = "uptrend"
    elif not above50 and not above200 and slope < 0:
        regime = "downtrend"
    else:
        regime = "range"
    if vol20 > 1.5 * vol250:
        regime += "/high-vol"

    return {
        "close": c[-1],
        "ret_1d_pct": cc[-1],
        "ret_5d_pct": _pct_change(c, 5),
        "ret_20d_pct": _pct_change(c, 20),
        "ret_60d_pct": _pct_change(c, 60),
        "ret_250d_pct": _pct_change(c, 250),
        "vol_20d_ann_pct": vol20,
        "vol_250d_ann_pct": vol250,
        "atr14_pct": atr14_pct,
        "avg_range_20d_pct": range20_pct,
        "days_abs_move_ge_1_pct": (np.abs(cc) >= 1).mean() * 100,
        "days_reach_target_pct": reach_target.mean() * 100,
        "days_hit_stop_pct": hit_stop.mean() * 100,
        "days_target_not_stop_pct": clean_target.mean() * 100,
        "gap_abs_avg_pct": np.abs(gap).mean(),
        "gaps_ge_1_pct": (np.abs(gap) >= 1).mean() * 100,
        "rsi14": _rsi(c),
        "sma50_dist_pct": (c[-1] / sma50 - 1) * 100,
        "sma200_dist_pct": (c[-1] / sma200 - 1) * 100 if np.isfinite(sma200) else np.nan,
        "sma50_slope_pct": sma50_slope,
        "from_52w_high_pct": (c[-1] / hi52 - 1) * 100,
        "from_52w_low_pct": (c[-1] / lo52 - 1) * 100,
        "autocorr_1": autocorr,
        "beta_spy": beta,
        "corr_spy": corr,
        "dollar_vol_20d_m": (c * v)[-20:].mean() / 1e6,
        "regime": regime,
        "bars": len(df),
    }


# ---------------------------------------------------------------------------
# universe scan
# ---------------------------------------------------------------------------
@dataclass
class ScanResult:
    asof: pd.Timestamp
    table: pd.DataFrame                       # one row per symbol
    breadth: dict = field(default_factory=dict)
    sectors: pd.DataFrame = field(default_factory=pd.DataFrame)
    missing: list[str] = field(default_factory=list)


def scan(bars: Bars, universe: pd.DataFrame, target_pct: float = 1.0, stop_pct: float = 0.5) -> ScanResult:
    spy_ret = None
    if BENCHMARK in bars and len(bars[BENCHMARK]) > MIN_BARS:
        s = bars[BENCHMARK]["close"]
        spy_ret = pd.Series(np.diff(np.log(s.to_numpy(float))), index=s.index[1:])

    rows, missing, asof = [], [], None
    meta = universe.set_index("symbol")
    for sym in universe["symbol"]:
        df = bars.get(sym)
        m = symbol_metrics(df, spy_ret, target_pct, stop_pct) if df is not None else None
        if m is None:
            missing.append(sym)
            continue
        m.update(symbol=sym, name=meta.at[sym, "name"], sector=meta.at[sym, "sector"])
        rows.append(m)
        asof = max(asof, df.index[-1]) if asof is not None else df.index[-1]
    if not rows:
        raise ValueError("no symbol had enough daily bars to analyze")
    t = pd.DataFrame(rows).set_index("symbol")
    front = ["name", "sector", "regime", "close", "ret_1d_pct", "ret_5d_pct", "ret_20d_pct"]
    t = t[front + [c for c in t.columns if c not in front]]

    breadth = {
        "symbols": len(t),
        "advancers": int((t["ret_1d_pct"] > 0).sum()),
        "decliners": int((t["ret_1d_pct"] < 0).sum()),
        "median_ret_1d_pct": float(t["ret_1d_pct"].median()),
        "pct_above_sma50": float((t["sma50_dist_pct"] > 0).mean() * 100),
        "pct_above_sma200": float((t["sma200_dist_pct"] > 0).mean() * 100),
        "pct_uptrend": float(t["regime"].str.startswith("uptrend").mean() * 100),
        "pct_downtrend": float(t["regime"].str.startswith("downtrend").mean() * 100),
        "new_52w_highs": int((t["from_52w_high_pct"] >= -0.01).sum()),
        "new_52w_lows": int((t["from_52w_low_pct"] <= 0.01).sum()),
        "median_vol_20d_pct": float(t["vol_20d_ann_pct"].median()),
        "median_days_reach_target_pct": float(t["days_reach_target_pct"].median()),
        "median_days_target_not_stop_pct": float(t["days_target_not_stop_pct"].median()),
    }
    sectors = (
        t.groupby("sector")
        .agg(
            n=("close", "size"),
            ret_1d=("ret_1d_pct", "median"),
            ret_20d=("ret_20d_pct", "median"),
            vol_20d=("vol_20d_ann_pct", "median"),
            above_sma50=("sma50_dist_pct", lambda s: (s > 0).mean() * 100),
            reach_target=("days_reach_target_pct", "median"),
        )
        .sort_values("ret_1d", ascending=False)
        .round(2)
    )
    return ScanResult(asof=asof, table=t, breadth=breadth, sectors=sectors, missing=missing)


# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------
def _fmt(t: pd.DataFrame, cols: list[str]) -> str:
    return t[cols].round(2).to_string()


def format_report(res: ScanResult, top: int = 15, min_dollar_vol_m: float = 50.0,
                  target_pct: float = 1.0, stop_pct: float = 0.5) -> str:
    t, b = res.table, res.breadth
    liquid = t[t["dollar_vol_20d_m"] >= min_dollar_vol_m]
    L = []
    add = L.append
    add("=" * 78)
    add(f"S&P 500 DAILY BEHAVIOUR SCAN   as of {res.asof.tz_convert('America/New_York'):%Y-%m-%d}   "
        f"{b['symbols']} symbols analyzed, {len(res.missing)} missing")
    add("=" * 78)
    add(f"Breadth   adv/dec {b['advancers']}/{b['decliners']}   median 1d {b['median_ret_1d_pct']:+.2f}%   "
        f"above SMA50 {b['pct_above_sma50']:.0f}%   above SMA200 {b['pct_above_sma200']:.0f}%")
    add(f"Regimes   uptrend {b['pct_uptrend']:.0f}%   downtrend {b['pct_downtrend']:.0f}%   "
        f"new 52w highs {b['new_52w_highs']}   lows {b['new_52w_lows']}   median 20d vol {b['median_vol_20d_pct']:.0f}%")
    add(f"Bracket   median stock: +{target_pct}% from open reached on {b['median_days_reach_target_pct']:.0f}% of days; "
        f"reached without touching -{stop_pct}% on {b['median_days_target_not_stop_pct']:.0f}% of days")
    add("")
    add("SECTORS (medians)")
    add(res.sectors.to_string())
    add("")
    add(f"TOP {top} TODAY")
    add(_fmt(t.nlargest(top, "ret_1d_pct"), ["name", "sector", "ret_1d_pct", "ret_5d_pct", "rsi14", "regime"]))
    add("")
    add(f"BOTTOM {top} TODAY")
    add(_fmt(t.nsmallest(top, "ret_1d_pct"), ["name", "sector", "ret_1d_pct", "ret_5d_pct", "rsi14", "regime"]))
    add("")
    add(f"MOST VOLATILE (20d annualized)")
    add(_fmt(t.nlargest(top, "vol_20d_ann_pct"), ["name", "vol_20d_ann_pct", "vol_250d_ann_pct", "atr14_pct", "gaps_ge_1_pct", "regime"]))
    add("")
    add(f"BEST {target_pct}% TARGET REACH, liquid (>= ${min_dollar_vol_m:.0f}M/day): share of days +{target_pct}% from open hit WITHOUT -{stop_pct}% first")
    add(_fmt(liquid.nlargest(top, "days_target_not_stop_pct"),
             ["name", "days_target_not_stop_pct", "days_reach_target_pct", "days_hit_stop_pct", "atr14_pct", "dollar_vol_20d_m", "regime"]))
    add("")
    add("MOST MEAN-REVERTING, liquid (most negative lag-1 autocorrelation of daily returns)")
    add(_fmt(liquid.nsmallest(top, "autocorr_1"), ["name", "autocorr_1", "vol_20d_ann_pct", "days_target_not_stop_pct", "regime"]))
    add("")
    add("MOST TRENDING, liquid (most positive lag-1 autocorrelation)")
    add(_fmt(liquid.nlargest(top, "autocorr_1"), ["name", "autocorr_1", "ret_20d_pct", "sma50_slope_pct", "regime"]))
    add("")
    add("STRETCHED: RSI14 > 70 (overbought) / < 30 (oversold)")
    ob, os_ = t[t["rsi14"] > 70], t[t["rsi14"] < 30]
    add(f"  overbought ({len(ob)}): " + ", ".join(ob.sort_values("rsi14", ascending=False).index[:25]))
    add(f"  oversold   ({len(os_)}): " + ", ".join(os_.sort_values("rsi14").index[:25]))
    add("")
    add("HIGHEST BETA TO SPY")
    add(_fmt(t.nlargest(top, "beta_spy"), ["name", "beta_spy", "corr_spy", "vol_20d_ann_pct"]))
    if res.missing:
        add("")
        add(f"missing/insufficient data: {', '.join(res.missing[:40])}{' ...' if len(res.missing) > 40 else ''}")
    add("=" * 78)
    return "\n".join(L)
