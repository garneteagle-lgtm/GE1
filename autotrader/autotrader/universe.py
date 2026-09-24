"""S&P 500 constituents. A snapshot ships with the package; ``refresh`` pulls
the current list from Wikipedia and caches it. Symbols use Alpaca's dash
convention (BRK-B, BF-B)."""
from __future__ import annotations

import io
import logging
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

log = logging.getLogger(__name__)

BUNDLED = Path(__file__).resolve().parent / "universe" / "sp500.csv"
WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
COLUMNS = ["symbol", "name", "sector", "sub_industry"]


def _cache_path(cache_dir: str | Path) -> Path:
    return Path(cache_dir) / f"sp500_{date.today():%Y-%m-%d}.csv"


def refresh(cache_dir: str | Path = "data_cache") -> pd.DataFrame:
    """Fetch the live list from Wikipedia. Raises on network failure."""
    req = urllib.request.Request(WIKI_URL, headers={"User-Agent": "autotrader/0.1"})
    html = urllib.request.urlopen(req, timeout=30).read().decode()
    t = pd.read_html(io.StringIO(html))[0]
    df = pd.DataFrame(
        {
            "symbol": t["Symbol"].astype(str).str.replace(".", "-", regex=False).str.strip(),
            "name": t["Security"],
            "sector": t["GICS Sector"],
            "sub_industry": t["GICS Sub-Industry"],
        }
    )
    if len(df) < 490:
        raise RuntimeError(f"Wikipedia table looks wrong ({len(df)} rows)")
    p = _cache_path(cache_dir)
    p.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(p, index=False)
    return df


def sp500(cache_dir: str | Path = "data_cache", refresh_online: bool = False) -> pd.DataFrame:
    """Today's cached list if present, else (optionally) a live refresh, else
    the bundled snapshot."""
    p = _cache_path(cache_dir)
    if p.exists() and not refresh_online:
        return pd.read_csv(p)
    if refresh_online:
        try:
            return refresh(cache_dir)
        except Exception as e:  # offline / layout change: fall back, but say so
            log.warning("could not refresh S&P 500 list (%s); using bundled snapshot", e)
    return pd.read_csv(BUNDLED)
