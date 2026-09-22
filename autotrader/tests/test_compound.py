import numpy as np
import pytest

from autotrader import compound


def test_grow_two_periods():
    assert compound.grow(100, 1, 2) == pytest.approx(102.01)


def test_one_percent_a_day_is_absurd():
    # 1%/day over 252 sessions is > 1,100% per year
    assert compound.annualize_daily(1.0) > 1100


def test_daily_for_annual_roundtrip():
    d = compound.daily_for_annual(10.0)
    assert compound.annualize_daily(d) == pytest.approx(10.0)


def test_monte_carlo_shape_and_bounds():
    r = np.array([1.0, -0.5, 0.2, 0.0, -0.3])
    mc = compound.monte_carlo(r, days=50, n_paths=200, seed=1)
    assert mc["p5"] <= mc["p50"] <= mc["p95"]
    assert 0 <= mc["prob_loss"] <= 1
    assert 0 <= mc["prob_ruin"] <= 1
