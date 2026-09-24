# autotrader

A config-driven algorithmic trading system for US stocks/ETFs on Alpaca, built
around one shared strategy + risk core that runs identically in three modes:

```
backtest  ──▶  paper (Alpaca paper account)  ──▶  live (guarded, opt-in)
```

It was built to answer one question honestly: **can a strategy compound 1% a
day?** The engine measures every run against that target and tells you how
often it was actually hit, instead of assuming it.

## Read this first: the arithmetic

| Target        | Annualized | $25,000 after 1 year |
|---------------|-----------:|---------------------:|
| 1% per day    | 1,127%     | ≈ $306,000           |
| 1% per week   | 68%        | ≈ $42,000            |
| 1% per month  | 12.7%      | ≈ $28,200            |
| S&P 500 avg   | ~10%       | ≈ $27,500            |

1%/day compounded is more than eleven-fold per year. No fund, desk, or
individual has sustained that on a real account net of costs; the best
long-run track records on record are in the 20–40%/yr range with deep
drawdowns. A backtest that shows 1%/day is measuring a bug (lookahead,
survivorship, unrealistic fills), not an edge.

So the system is built so you find that out for **$0** — in the backtester and
then the paper account — rather than for real. `autotrader compound` prints the
table above for any rate/period.

What *is* a sane spec, and what the defaults implement:

- **1% take-profit / 0.5% stop-loss per trade** (2:1 reward-to-risk). Above a
  ~35% win rate after costs, this is profitable. Daily P&L is then an outcome,
  not an input.
- **Never risk more than 0.5% of equity on one trade**, never more than 2% in a
  day, and shut the whole thing off at a 10% drawdown.

## Layout

```
autotrader/
  config.py          typed YAML config with validation (refuses reckless settings)
  data.py            Alpaca bars w/ CSV cache; synthetic random-walk generator
  strategy/          Strategy contract + mean_reversion, momentum
  risk.py            RiskManager: sizing, daily loss kill-switch, drawdown breaker
  backtest.py        event-driven, no-lookahead, pessimistic bracket fills
  metrics.py         report incl. "% of sessions that hit the daily target"
  compound.py        compounding math + bootstrap Monte Carlo
  broker/            Broker interface; PaperBroker (in-process); AlpacaBroker
  live.py            LiveRunner: same Strategy/RiskManager driven by a broker
  universe.py        S&P 500 constituents (bundled snapshot + Wikipedia refresh)
  scanner.py         daily behaviour scan of every constituent
  __main__.py        CLI
config/default.yaml  every knob, commented
tests/               22 tests: fills, exits, accounting, risk rails, live loop, scanner
```

### Design rules the engine enforces

- **No lookahead.** A signal on bar *t* fills at bar *t+1*'s open. Tested.
- **Pessimistic fills.** If a bar touches both the stop and the target, the stop
  wins. Gaps through a level fill at the open, not the level. Every fill pays
  slippage (5 bps default) plus commission.
- **Bracket exits only.** Every entry carries a take-profit, a stop-loss and a
  time limit; `flat_at_close` closes everything before 16:00 ET so a 0.5% stop
  can't become a 5% overnight gap.
- **Risk rails are shared code.** `RiskManager` is the single source of truth
  for sizing and limits in both the backtester and the live runner, so they
  can't drift apart.
- **Live is opt-in twice.** `AlpacaBroker(paper=False)` refuses unless the env
  var `AUTOTRADER_LIVE=I_ACCEPT_REAL_MONEY_RISK` is set, and the CLI additionally
  makes you type `LIVE`.

## Quick start

```bash
cd autotrader
pip install -e ".[dev]"
python -m pytest -q                       # 18 passed

# 1. The null baseline: random-walk bars, no API keys. Any "edge" here is noise.
python -m autotrader backtest --synthetic --days 120

# 2. What the target actually implies
python -m autotrader compound --rate 1 --period day --periods 252

# 3. Real history (free Alpaca keys, IEX feed)
cp .env.example .env                       # fill in ALPACA_API_KEY / ALPACA_SECRET_KEY
python -m autotrader fetch                 # caches bars in data_cache/
python -m autotrader backtest --trades reports/trades.csv

# 4. Paper trade the same config against the live market
python -m autotrader paper

# 5. Only after weeks of paper results you'd be happy to lose:
AUTOTRADER_LIVE=I_ACCEPT_REAL_MONEY_RISK python -m autotrader live
```

Swap strategies or parameters in `config/default.yaml` or pass `--config
path.yaml`. `strategy.name` is `mean_reversion` or `momentum`.

## What the null baseline looks like

Both bundled strategies on 120 sessions of pure random-walk bars (seed 0):

```
mean_reversion   $25,000 -> $22,704  (-9.2%)   772 trades, win rate 35.4%, PF 0.81
                 TARGET 1.00%/day: hit on 0.0% of sessions.
                 !! SYSTEM HALTED: drawdown 10.07% >= max 10.0%

momentum         $25,000 -> $23,312  (-6.8%)   282 trades, win rate 32.6%, PF 0.64
                 TARGET 1.00%/day: hit on 0.0% of sessions.
```

That is the correct result: on data with no edge, costs bleed the account and
the drawdown breaker trips. A real dataset that produces the *same* picture
means the strategy has no edge either. One that produces a positive expectancy
with a profit factor above ~1.3 across several years and several symbol sets is
worth paper trading. The Monte Carlo block under each report resamples the
observed daily returns into 5,000 one-year futures so you judge the
distribution, not a single lucky path.

## Daily S&P 500 scan

`autotrader scan` pulls a year of daily bars for all ~503 constituents (plus
SPY as the benchmark), computes ~30 behaviour statistics per stock, and prints
a market report. It runs in about a second once bars are cached; the full
per-symbol table lands in `reports/scan_<date>.csv` for spreadsheets.

```bash
python -m autotrader scan --synthetic            # no keys: random-walk demo
python -m autotrader scan                        # real: Alpaca daily bars, cached per day
python -m autotrader scan --refresh-universe     # also re-pull the constituent list
python -m autotrader scan --top 25 --min-dollar-vol 100
```

Per stock (`reports/scan_<date>.csv`):

| group | columns |
|---|---|
| returns | `ret_1d/5d/20d/60d/250d_pct` |
| volatility & range | `vol_20d_ann_pct`, `vol_250d_ann_pct`, `atr14_pct`, `avg_range_20d_pct`, `days_abs_move_ge_1_pct` |
| **bracket reachability** | `days_reach_target_pct` (open→high ≥ +1%), `days_hit_stop_pct` (open→low ≤ −0.5%), `days_target_not_stop_pct` (target reached on a day the stop was never touched) |
| gaps | `gap_abs_avg_pct`, `gaps_ge_1_pct` |
| trend | `rsi14`, `sma50_dist_pct`, `sma200_dist_pct`, `sma50_slope_pct`, `from_52w_high_pct`, `from_52w_low_pct`, `regime` (uptrend / downtrend / range, `+/high-vol` when 20d vol > 1.5× 250d) |
| behaviour | `autocorr_1` (lag-1 autocorrelation of daily returns: negative = mean-reverting, positive = trending), `beta_spy`, `corr_spy` |
| liquidity | `dollar_vol_20d_m` |

The report rolls these into breadth (advance/decline, % above SMA50/200, new
highs/lows), a sector table, and ranked lists: top/bottom movers, most
volatile, best target-reach among liquid names, most mean-reverting, most
trending, RSI extremes, highest beta.

The bracket-reachability columns are the ones that speak to the 1% goal. On
random-walk data the median stock reaches +1% from the open on ~64% of days but
does so *without first touching −0.5%* on only ~13% — the stop is hit far more
often than the target on noise. Real data will differ by name; that gap is
what a strategy has to close.

### Running it every day

Alpaca's IEX daily bar for today is final after the 16:00 ET close, so schedule
the scan for the evening. A crontab line (server in UTC, 21:30 UTC = 17:30 ET
during daylight time):

```
30 21 * * 1-5  cd /path/to/autotrader && /usr/bin/python3 -m autotrader scan >> reports/scan.log 2>&1
```

Universe changes (index additions/removals) are picked up with
`--refresh-universe`; the bundled `autotrader/universe/sp500.csv` is a
snapshot dated 2026-09-24.

## Writing a strategy

```python
from autotrader.strategy import Signal, Strategy, register

@register
class MyIdea(Strategy):
    name = "my_idea"

    def __init__(self, lookback: int = 30):
        super().__init__(lookback=lookback)
        self.lookback = lookback

    @property
    def window(self) -> int:          # bars of history on_bar needs
        return self.lookback + 1

    def on_bar(self, symbol, bars):   # bars ends at the bar that just closed
        if bars["close"].iloc[-1] < bars["close"].rolling(self.lookback).mean().iloc[-1]:
            return Signal(symbol, reason="below MA")   # optional per-signal tp/sl overrides
        return None
```

Import it somewhere `make_strategy` can see it (e.g. add to
`strategy/base.py`'s lazy import) and set `strategy.name: my_idea`. Strategies
only decide *entries*; exits and sizing belong to the engine.

## Honest limitations

- Long-only, market orders, one position per symbol. Shorting, limit entries
  and options are deliberately out of scope for v1.
- Alpaca's free IEX feed is a subset of consolidated volume; backtests on it are
  slightly pessimistic on fills and optimistic on volume signals. A paid SIP
  plan fixes both (`feed=DataFeed.SIP` in `data.py`).
- Pattern-day-trader rules apply to margin accounts under $25k: more than 3
  day trades in 5 sessions gets the account restricted. Alpaca paper accounts
  ignore this; a live account will not.
- Backtests assume you'd have been filled for your full size at the open plus
  slippage. On thin names that is generous; the default symbol list is liquid.
- Nothing here is investment advice. The engine will faithfully execute a bad
  strategy.
