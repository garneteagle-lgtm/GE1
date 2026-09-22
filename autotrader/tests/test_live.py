import pandas as pd

from autotrader.broker import PaperBroker
from autotrader.config import Config, Risk, Targets
from autotrader.data import synthetic_bars
from autotrader.live import LiveRunner
from autotrader.strategy import Signal, Strategy


class Always(Strategy):
    name = "always"
    window = 2

    def on_bar(self, symbol, bars):
        return Signal(symbol, "always")


def make_runner(**risk):
    cfg = Config(starting_equity=10_000, risk=Risk(max_positions=2, **risk))
    broker = PaperBroker(cash=10_000)
    bars = synthetic_bars(["AAA", "BBB", "CCC"], days=1)
    for s, df in bars.items():
        broker.mark(s, float(df["close"].iloc[-1]))
    return LiveRunner(cfg, Always(), broker, feed=None), broker, bars


def test_submits_brackets_up_to_max_positions_and_not_twice_for_same_bar():
    runner, broker, bars = make_runner()
    ids = runner.step(bars)
    assert len(ids) == 2
    assert {p.symbol for p in broker.positions()} <= set(bars)
    assert runner.step(bars) == []   # same bars -> already acted


def test_flattens_near_close():
    runner, broker, bars = make_runner()
    runner.step(bars)
    assert broker.positions()
    broker.set_clock(True, minutes_to_close=3)
    runner.step(bars)
    assert broker.positions() == []


def test_halts_on_drawdown():
    runner, broker, bars = make_runner(max_drawdown_pct=5)
    runner.step(bars)
    broker.cash -= 1_000  # brackets cap per-trade loss, so simulate a 10% account hit directly
    runner.step(bars)
    assert runner.stopped and broker.positions() == []
