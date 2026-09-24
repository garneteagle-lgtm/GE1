"""Bar data: a dict of ``{symbol: DataFrame[open, high, low, close, volume]}``
indexed by tz-aware UTC timestamps. Two sources: a synthetic generator (tests,
offline demos) and Alpaca historical bars with a CSV cache."""
from __future__ import annotations

import logging
import os
import re
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

NY = "America/New_York"
COLUMNS = ["open", "high", "low", "close", "volume"]
Bars = dict[str, pd.DataFrame]


def session_dates(index: pd.DatetimeIndex) -> np.ndarray:
    """Calendar date of each bar in New York time — the trading 'day'."""
    return index.tz_convert(NY).date


def session_date(ts: pd.Timestamp) -> date:
    return ts.tz_convert(NY).date()


def synthetic_bars(
    symbols: list[str],
    days: int = 60,
    bars_per_day: int = 26,
    seed: int = 0,
    start: str = "2025-01-06",
    daily_vol: float = 0.015,
) -> Bars:
    """Geometric Brownian motion bars on a real-looking RTH calendar
    (weekdays, 09:30-15:45 ET at 15-minute spacing). No edge is baked in, so a
    strategy that 'wins' on this data is fitting noise — that's the point of
    using it in tests and as a null baseline."""
    rng = np.random.default_rng(seed)
    bdays = pd.bdate_range(start, periods=days)
    stamps = []
    for d in bdays:
        first = (d + pd.Timedelta(hours=9, minutes=30)).tz_localize(NY)
        stamps.append(pd.date_range(first, periods=bars_per_day, freq="15min"))
    index = stamps[0].append(stamps[1:]).tz_convert("UTC")
    n = len(index)
    bar_vol = daily_vol / np.sqrt(bars_per_day)

    out: Bars = {}
    for i, sym in enumerate(symbols):
        px0 = 50.0 + 50.0 * (i + 1)
        rets = rng.normal(0.0, bar_vol, n)
        close = px0 * np.exp(np.cumsum(rets))
        open_ = np.concatenate([[px0], close[:-1]])
        wiggle = np.abs(rng.normal(0.0, bar_vol / 2, n))
        high = np.maximum(open_, close) * (1 + wiggle)
        low = np.minimum(open_, close) * (1 - wiggle)
        volume = rng.integers(50_000, 500_000, n).astype(float)
        out[sym] = pd.DataFrame(
            {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
            index=index,
        )
    return out


def synthetic_daily_bars(symbols: list[str], days: int = 300, seed: int = 0,
                        start: str = "2025-01-02", daily_vol: float = 0.018) -> Bars:
    """Random-walk daily bars on a weekday calendar; the null baseline for the scanner."""
    rng = np.random.default_rng(seed)
    index = pd.bdate_range(start, periods=days, tz=NY).tz_convert("UTC")
    out: Bars = {}
    for i, sym in enumerate(symbols):
        px0 = 20.0 + 5.0 * (i % 60)
        vol = daily_vol * rng.uniform(0.5, 2.0)
        close = px0 * np.exp(np.cumsum(rng.normal(0.0, vol, days)))
        gap = rng.normal(0.0, vol / 3, days)
        open_ = np.concatenate([[px0], close[:-1]]) * np.exp(gap)
        wiggle = np.abs(rng.normal(0.0, vol / 2, days))
        high = np.maximum(open_, close) * (1 + wiggle)
        low = np.minimum(open_, close) * (1 - wiggle)
        volume = rng.integers(500_000, 20_000_000, days).astype(float)
        out[sym] = pd.DataFrame({"open": open_, "high": high, "low": low, "close": close, "volume": volume}, index=index)
    return out


_TF_RE = re.compile(r"^(\d+)(Min|Hour|Day)$", re.IGNORECASE)


def parse_timeframe(tf: str):
    from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

    m = _TF_RE.match(tf.strip())
    if not m:
        raise ValueError(f"timeframe must look like 15Min / 1Hour / 1Day, got {tf!r}")
    amount, unit = int(m.group(1)), m.group(2).lower()
    unit_map = {"min": TimeFrameUnit.Minute, "hour": TimeFrameUnit.Hour, "day": TimeFrameUnit.Day}
    return TimeFrame(amount, unit_map[unit])


def alpaca_credentials() -> tuple[str, str]:
    key, secret = os.getenv("ALPACA_API_KEY", ""), os.getenv("ALPACA_SECRET_KEY", "")
    if not key or not secret:
        raise RuntimeError("Set ALPACA_API_KEY and ALPACA_SECRET_KEY (see .env.example)")
    return key, secret


class AlpacaData:
    """Historical + recent bars from Alpaca's market-data API."""

    def __init__(self, cache_dir: str | Path = "data_cache"):
        from alpaca.data.historical import StockHistoricalDataClient

        key, secret = alpaca_credentials()
        self.client = StockHistoricalDataClient(key, secret)
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _fetch(self, symbols: list[str], timeframe: str, start: pd.Timestamp, end: pd.Timestamp) -> Bars:
        from alpaca.data.enums import Adjustment, DataFeed
        from alpaca.data.requests import StockBarsRequest

        req = StockBarsRequest(
            symbol_or_symbols=symbols,
            timeframe=parse_timeframe(timeframe),
            start=start.to_pydatetime(),
            end=end.to_pydatetime(),
            adjustment=Adjustment.SPLIT,
            feed=DataFeed.IEX,  # free tier; switch to SIP with a paid data plan
        )
        df = self.client.get_stock_bars(req).df
        out: Bars = {}
        if df.empty:
            return {s: pd.DataFrame(columns=COLUMNS) for s in symbols}
        for sym in symbols:
            if sym not in df.index.get_level_values(0):
                log.warning("no bars returned for %s", sym)
                out[sym] = pd.DataFrame(columns=COLUMNS)
                continue
            d = df.xs(sym, level=0)[COLUMNS].copy()
            d.index = pd.DatetimeIndex(d.index).tz_convert("UTC")
            d.index.name = None
            out[sym] = d.sort_index()
        return out

    def history(self, symbols: list[str], timeframe: str, start: str, end: str, rth_only: bool = True) -> Bars:
        """Backtest data, cached per symbol/timeframe/range as CSV."""
        s, e = pd.Timestamp(start, tz="UTC"), pd.Timestamp(end, tz="UTC")
        out: Bars = {}
        missing = []
        for sym in symbols:
            f = self.cache_dir / f"{sym}_{timeframe}_{s.date()}_{e.date()}.csv"
            if f.exists():
                d = pd.read_csv(f, index_col=0, parse_dates=True)
                d.index = pd.DatetimeIndex(d.index).tz_convert("UTC")
                out[sym] = d
            else:
                missing.append(sym)
        if missing:
            log.info("fetching %d symbols from Alpaca: %s", len(missing), missing)
            fetched = self._fetch(missing, timeframe, s, e)
            for sym, d in fetched.items():
                d.to_csv(self.cache_dir / f"{sym}_{timeframe}_{s.date()}_{e.date()}.csv")
                out[sym] = d
        if rth_only:
            out = {k: regular_hours(v) for k, v in out.items()}
        return out

    def daily(self, symbols: list[str], lookback_days: int = 365, chunk: int = 100,
              cache_dir: str | Path | None = None) -> Bars:
        """Daily bars for a large universe, fetched in symbol chunks and cached
        once per calendar day (the scan re-runs are then instant)."""
        end = pd.Timestamp.now(tz="UTC")
        start = end - pd.Timedelta(days=int(lookback_days * 1.5))
        cache = Path(cache_dir or self.cache_dir) / f"daily_{end:%Y-%m-%d}.csv"
        out: Bars = {}
        if cache.exists():
            long = pd.read_csv(cache, index_col=0, parse_dates=True)
            long.index = pd.DatetimeIndex(long.index).tz_convert("UTC")
            for sym, d in long.groupby("symbol"):
                out[sym] = d.drop(columns="symbol").sort_index()
            if set(symbols) <= set(out):
                return {s: out[s] for s in symbols}
            log.info("cache %s lacks %d symbols; refetching", cache.name, len(set(symbols) - set(out)))
        symbols = list(dict.fromkeys(symbols))
        for i in range(0, len(symbols), chunk):
            batch = symbols[i : i + chunk]
            log.info("fetching daily bars %d-%d of %d", i + 1, i + len(batch), len(symbols))
            out.update(self._fetch(batch, "1Day", start, end))
        frames = [d.assign(symbol=s) for s, d in out.items() if len(d)]
        if frames:
            pd.concat(frames).to_csv(cache)
        return {s: out.get(s, pd.DataFrame(columns=COLUMNS)) for s in symbols}

    def recent(self, symbols: list[str], timeframe: str, bars: int) -> Bars:
        """Last ``bars`` bars per symbol for the live loop (over-fetches by
        calendar days, then trims)."""
        end = pd.Timestamp.now(tz="UTC")
        start = end - pd.Timedelta(days=max(7, bars // 20 + 5))
        data = self._fetch(symbols, timeframe, start, end)
        return {k: regular_hours(v).tail(bars) for k, v in data.items()}


def regular_hours(df: pd.DataFrame) -> pd.DataFrame:
    """Keep 09:30 <= t < 16:00 ET bars only."""
    if df.empty:
        return df
    local = df.index.tz_convert(NY)
    minutes = local.hour * 60 + local.minute
    return df[(minutes >= 570) & (minutes < 960)]
