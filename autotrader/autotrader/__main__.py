"""CLI: backtest | compound | paper | live | fetch."""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

from . import compound
from .config import load
from .metrics import format_report, summarize
from .strategy import make_strategy

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "config" / "default.yaml"


def _cfg(args):
    return load(args.config)


def cmd_backtest(args) -> int:
    from .backtest import Backtester
    from .data import synthetic_bars

    cfg = _cfg(args)
    strategy = make_strategy(cfg.strategy.name, cfg.strategy.params)
    if args.synthetic:
        bars = synthetic_bars(cfg.data.symbols, days=args.days, seed=args.seed)
        source = f"synthetic ({args.days} sessions, seed {args.seed})"
    else:
        from .data import AlpacaData

        if not cfg.data.start or not cfg.data.end:
            sys.exit("config data.start/data.end are required for a historical backtest")
        bars = AlpacaData(cfg.data.cache_dir).history(cfg.data.symbols, cfg.data.timeframe, cfg.data.start, cfg.data.end)
        source = f"Alpaca {cfg.data.timeframe} {cfg.data.start}..{cfg.data.end}"
    res = Backtester(cfg, strategy, bars).run()
    s = summarize(res, cfg)
    print(format_report(s, f"{strategy.describe()}  |  {source}"))
    if s["sessions"] >= 20:
        mc = compound.monte_carlo(res.daily["return_pct"].to_numpy(), days=args.mc_days,
                                  ruin_drawdown_pct=cfg.risk.max_drawdown_pct)
        print(compound.format_monte_carlo(mc, cfg.starting_equity))
    if args.trades:
        out = Path(args.trades)
        out.parent.mkdir(parents=True, exist_ok=True)
        res.trades_frame().to_csv(out, index=False)
        res.daily.to_csv(out.with_name(out.stem + "_daily.csv"))
        print(f"wrote {out} and {out.with_name(out.stem + '_daily.csv')}")
    return 0


def cmd_scan(args) -> int:
    from . import scanner, universe
    from .data import synthetic_daily_bars

    cfg = _cfg(args)
    uni = universe.sp500(cfg.data.cache_dir, refresh_online=args.refresh_universe)
    symbols = uni["symbol"].tolist()
    if args.limit:
        uni, symbols = uni.head(args.limit), symbols[: args.limit]
    if args.synthetic:
        bars = synthetic_daily_bars(symbols + [scanner.BENCHMARK], days=args.lookback + 10, seed=args.seed)
    else:
        from .data import AlpacaData

        bars = AlpacaData(cfg.data.cache_dir).daily(symbols + [scanner.BENCHMARK], lookback_days=args.lookback)
    tp, sl = cfg.targets.take_profit_pct, cfg.targets.stop_loss_pct
    res = scanner.scan(bars, uni, target_pct=tp, stop_pct=sl)
    print(scanner.format_report(res, top=args.top, min_dollar_vol_m=args.min_dollar_vol, target_pct=tp, stop_pct=sl))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = res.asof.tz_convert("America/New_York").strftime("%Y-%m-%d")
    res.table.round(4).to_csv(out_dir / f"scan_{stamp}.csv")
    res.sectors.to_csv(out_dir / f"scan_{stamp}_sectors.csv")
    print(f"wrote {out_dir / f'scan_{stamp}.csv'} ({len(res.table)} rows) and {out_dir / f'scan_{stamp}_sectors.csv'}")
    return 0


def cmd_compound(args) -> int:
    print(f"{args.rate:.2f}% per {args.period} compounding from ${args.start:,.0f}\n")
    per_year = {"day": 252, "week": 52, "month": 12}[args.period]
    print(f"Annualized: {compound.annualize_daily(args.rate, per_year):,.1f}%")
    print(f"For comparison, the S&P 500's long-run average is ~10%/yr, i.e. "
          f"{compound.daily_for_annual(10, 252):.4f}%/day.\n")
    step = max(1, args.periods // 10)
    for p, v in compound.projection_table(args.start, args.rate, args.periods, step):
        print(f"  {args.period:>5} {p:>5}   ${v:>16,.0f}")
    return 0


def _runner(cfg, paper: bool):
    from .broker.alpaca import AlpacaBroker
    from .data import AlpacaData
    from .live import LiveRunner

    strategy = make_strategy(cfg.strategy.name, cfg.strategy.params)
    return LiveRunner(cfg, strategy, AlpacaBroker(paper=paper), AlpacaData(cfg.data.cache_dir))


def cmd_paper(args) -> int:
    _runner(_cfg(args), paper=True).run()
    return 0


def cmd_live(args) -> int:
    cfg = _cfg(args)
    print("*** LIVE TRADING WITH REAL MONEY ***")
    print(f"strategy={cfg.strategy.name} symbols={cfg.data.symbols} max_daily_loss={cfg.risk.max_daily_loss_pct}% "
          f"max_drawdown={cfg.risk.max_drawdown_pct}%")
    if input("type LIVE to continue: ").strip() != "LIVE":
        print("aborted")
        return 1
    _runner(cfg, paper=False).run()
    return 0


def cmd_fetch(args) -> int:
    from .data import AlpacaData

    cfg = _cfg(args)
    bars = AlpacaData(cfg.data.cache_dir).history(cfg.data.symbols, cfg.data.timeframe, cfg.data.start, cfg.data.end)
    for sym, df in bars.items():
        print(f"{sym:>6} {len(df):>7} bars  {df.index.min()} .. {df.index.max()}" if len(df) else f"{sym:>6} no data")
    return 0


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    p = argparse.ArgumentParser(prog="autotrader")
    p.add_argument("--config", default=str(DEFAULT_CONFIG))
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("backtest", help="run the configured strategy over historical or synthetic bars")
    b.add_argument("--synthetic", action="store_true", help="use random-walk bars (no API keys needed)")
    b.add_argument("--days", type=int, default=120)
    b.add_argument("--seed", type=int, default=0)
    b.add_argument("--mc-days", type=int, default=252, help="Monte Carlo horizon in sessions")
    b.add_argument("--trades", help="CSV path to write the trade log")
    b.set_defaults(fn=cmd_backtest)

    sc = sub.add_parser("scan", help="daily behaviour scan of every S&P 500 constituent")
    sc.add_argument("--synthetic", action="store_true", help="random-walk daily bars (no API keys needed)")
    sc.add_argument("--lookback", type=int, default=252, help="sessions of history per symbol")
    sc.add_argument("--top", type=int, default=15, help="rows per ranked list")
    sc.add_argument("--min-dollar-vol", type=float, default=50.0, help="liquidity floor in $M/day for candidate lists")
    sc.add_argument("--limit", type=int, default=0, help="only the first N constituents (quick runs)")
    sc.add_argument("--seed", type=int, default=0)
    sc.add_argument("--refresh-universe", action="store_true", help="pull the current constituent list from Wikipedia")
    sc.add_argument("--out", default="reports", help="directory for the per-symbol CSV")
    sc.set_defaults(fn=cmd_scan)

    c = sub.add_parser("compound", help="what a fixed periodic return compounds to")
    c.add_argument("--rate", type=float, default=1.0, help="percent per period")
    c.add_argument("--period", choices=["day", "week", "month"], default="day")
    c.add_argument("--periods", type=int, default=252)
    c.add_argument("--start", type=float, default=25_000)
    c.set_defaults(fn=cmd_compound)

    sub.add_parser("paper", help="trade the Alpaca PAPER account").set_defaults(fn=cmd_paper)
    sub.add_parser("live", help="trade real money (guarded)").set_defaults(fn=cmd_live)
    sub.add_parser("fetch", help="download and cache historical bars").set_defaults(fn=cmd_fetch)

    args = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
