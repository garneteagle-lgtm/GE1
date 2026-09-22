from datetime import date

from autotrader.config import Risk, Targets
from autotrader.risk import RiskManager


def rm(**kw):
    return RiskManager(Risk(**kw), Targets(), starting_equity=10_000)


def test_position_size_from_risk_and_stop():
    r = rm(max_risk_per_trade_pct=1.0, max_position_pct=500)
    # risk $100, stop 0.5% of $50 = $0.25/share -> 400 shares (notional cap $50k not binding)
    assert r.position_size(10_000, 50.0, 0.5) == 400


def test_position_size_capped_by_notional_and_cash():
    r = rm(max_risk_per_trade_pct=1.0, max_position_pct=20)
    # notional cap: $2,000 / $50 = 40 shares
    assert r.position_size(10_000, 50.0, 0.5) == 40
    assert r.position_size(10_000, 50.0, 0.5, cash=1_000) == 20


def test_daily_loss_blocks_new_entries():
    r = rm(max_daily_loss_pct=2.0)
    r.new_day(date(2025, 1, 6), 10_000)
    assert r.can_open(9_900, 0)[0]
    ok, why = r.can_open(9_790, 0)
    assert not ok and "daily loss" in why


def test_max_positions():
    r = rm(max_positions=2)
    assert not r.can_open(10_000, 2)[0]


def test_drawdown_halts_permanently():
    r = rm(max_drawdown_pct=10.0)
    r.update_equity(12_000)
    r.update_equity(10_900)
    assert not r.state.halted
    r.update_equity(10_800)
    assert r.state.halted
    r.update_equity(20_000)  # recovering does not un-halt
    assert not r.can_open(20_000, 0)[0]
