import numpy as np
import pandas as pd
import pytest

from autotrader.backtest import Backtester
from autotrader.config import Config, Costs, Targets
from autotrader.data import synthetic_bars
from autotrader.metrics import summarize
from autotrader.strategy import Signal, Strategy, make_strategy


class FireOnce(Strategy):
    """Signals exactly once, on the bar at ``fire_index``."""
    name = "fire_once"

    def __init__(self, fire_index: int):
        super().__init__(fire_index=fire_index)
        self.fire_index = fire_index
        self.seen = 0

    @property
    def window(self) -> int:
        return 1

    def on_bar(self, symbol, bars):
        self.seen += 1
        return Signal(symbol, "test") if self.seen - 1 == self.fire_index else None


class Never(Strategy):
    name = "never"
    window = 1

    def on_bar(self, symbol, bars):
        return None


def test_no_trades_means_flat_equity():
    cfg = Config(starting_equity=10_000)
    bars = synthetic_bars(["AAA"], days=3)
    res = Backtester(cfg, Never(), bars).run()
    assert res.trades == []
    assert (res.equity == 10_000).all()
    assert len(res.daily) == 3
    assert (res.daily["return_pct"] == 0).all()


def test_signal_fills_next_bar_open_with_slippage():
    cfg = Config(starting_equity=10_000, costs=Costs(slippage_bps=10), targets=Targets(max_holding_bars=1000, flat_at_close=False))
    bars = synthetic_bars(["AAA"], days=2)
    df = bars["AAA"]
    res = Backtester(cfg, FireOnce(fire_index=5), bars).run()
    assert len(res.trades) == 1
    t = res.trades[0]
    assert t.entry_time == df.index[6]                      # bar after the signal, never the same bar
    assert t.entry_price == pytest.approx(df["open"].iloc[6] * 1.001)


def test_flat_at_close_never_holds_overnight():
    cfg = Config(starting_equity=10_000, targets=Targets(take_profit_pct=50, stop_loss_pct=20, max_holding_bars=10_000, flat_at_close=True))
    bars = synthetic_bars(["AAA"], days=2)
    res = Backtester(cfg, FireOnce(fire_index=3), bars).run()
    assert len(res.trades) == 1
    t = res.trades[0]
    assert t.exit_reason == "eod"
    assert t.entry_time.tz_convert("America/New_York").date() == t.exit_time.tz_convert("America/New_York").date()


def test_stop_loss_beats_take_profit_when_both_touch():
    cfg = Config(starting_equity=10_000, costs=Costs(slippage_bps=0), targets=Targets(take_profit_pct=1, stop_loss_pct=1, max_holding_bars=100, flat_at_close=False))
    idx = pd.date_range("2025-01-06 14:30", periods=4, freq="15min", tz="UTC")
    df = pd.DataFrame({"open": [100, 100, 100, 100], "high": [100, 100, 105, 100],
                       "low": [100, 100, 95, 100], "close": [100, 100, 100, 100], "volume": 1.0}, index=idx)
    res = Backtester(cfg, FireOnce(fire_index=0), {"AAA": df}).run()
    assert res.trades[0].exit_reason == "stop_loss"
    assert res.trades[0].pnl < 0


def test_equity_accounting_matches_trade_pnl():
    cfg = Config(starting_equity=10_000)
    strat = make_strategy("mean_reversion", {"lookback": 10, "z_entry": -1.0})
    bars = synthetic_bars(["AAA", "BBB", "CCC"], days=20, seed=3)
    res = Backtester(cfg, strat, bars).run()
    assert len(res.trades) > 0
    assert res.equity.iloc[-1] == pytest.approx(10_000 + sum(t.pnl for t in res.trades))
    s = summarize(res, cfg)
    assert s["trades"] == len(res.trades)
    assert 0 <= s["max_drawdown_pct"] < 100


def test_strategies_register():
    assert make_strategy("momentum").name == "momentum"
    with pytest.raises(ValueError):
        make_strategy("nope")
