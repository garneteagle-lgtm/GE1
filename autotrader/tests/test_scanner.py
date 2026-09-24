import numpy as np
import pandas as pd

from autotrader import scanner, universe
from autotrader.data import synthetic_daily_bars


def test_bundled_universe_is_complete():
    u = universe.sp500(cache_dir="/nonexistent")
    assert len(u) >= 495
    assert list(u.columns) == ["symbol", "name", "sector", "sub_industry"]
    assert u["symbol"].is_unique
    assert "BRK-B" in set(u["symbol"])      # Alpaca dash convention, not BRK.B
    assert u["sector"].nunique() == 11


def test_symbol_metrics_ranges():
    df = synthetic_daily_bars(["AAA"], days=300, seed=1)["AAA"]
    m = scanner.symbol_metrics(df)
    assert m is not None
    assert 0 <= m["rsi14"] <= 100
    assert 0 <= m["days_reach_target_pct"] <= 100
    assert m["days_target_not_stop_pct"] <= m["days_reach_target_pct"]
    assert m["vol_20d_ann_pct"] > 0 and m["atr14_pct"] > 0
    assert m["from_52w_high_pct"] <= 0 <= m["from_52w_low_pct"]
    assert m["regime"].split("/")[0] in {"uptrend", "downtrend", "range"}


def test_symbol_metrics_needs_history():
    df = synthetic_daily_bars(["AAA"], days=30)["AAA"]
    assert scanner.symbol_metrics(df) is None


def test_scan_and_report_on_subset():
    u = universe.sp500(cache_dir="/nonexistent").head(40)
    syms = u["symbol"].tolist()
    bars = synthetic_daily_bars(syms + ["SPY"], days=260, seed=2)
    bars.pop(syms[0])                       # one missing symbol must not break the scan
    res = scanner.scan(bars, u)
    assert len(res.table) == 39 and res.missing == [syms[0]]
    assert res.breadth["advancers"] + res.breadth["decliners"] <= 39
    assert np.isfinite(res.table["beta_spy"]).all()
    assert set(res.sectors.index) <= set(u["sector"])
    report = scanner.format_report(res, top=5)
    assert "S&P 500 DAILY BEHAVIOUR SCAN" in report and "SECTORS" in report
