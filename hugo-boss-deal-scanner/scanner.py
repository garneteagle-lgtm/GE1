"""Scan retailer websites for Hugo Boss suit deals.

Opens each site in a real (headless) browser, pulls product tiles off the page,
keeps the ones that look like Hugo Boss suits, and ranks them by discount.

Run directly for a quick terminal report:  python3 scanner.py
"""
import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
EXTRACT_JS = (HERE / "extract.js").read_text()
SITES_FILE = HERE / "sites.json"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
CONCURRENCY = 4
PAGE_TIMEOUT_MS = 45_000
SETTLE_MS = 5_000

BRAND_RE = re.compile(r"\bboss\b|hugo", re.I)
SUIT_RE = re.compile(r"\bsuits?\b|tuxedo", re.I)
NOT_A_SUIT_RE = re.compile(
    r"(swim|track|jump|sweat|body|play|snow|ski|wet|boiler|rain)[\s-]?suit"
    r"|suit\s?(bag|case|carrier|cover|hanger)|garment bag|dress shirt only",
    re.I,
)
SEPARATES_RE = re.compile(r"\b(jacket|blazer|trousers?|pants?|vest|waistcoat|(top|over|sport)?\s?coat)\b", re.I)
FULL_SUIT_RE = re.compile(r"(two|three|2|3)[\s-]?(piece|pc)|suit with", re.I)
BLOCKED_TITLE_RE = re.compile(
    r"access denied|attention required|just a moment|site offline|error page|"
    r"page not found|404|has been denied|robot|captcha",
    re.I,
)


def load_sites():
    return json.loads(SITES_FILE.read_text())


def save_sites(sites):
    SITES_FILE.write_text(json.dumps(sites, indent=2, ensure_ascii=False) + "\n")


def _canonical(url):
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


def _clean(items, site):
    """Filter raw page items down to Hugo Boss suits and merge duplicates."""
    merged = {}
    for it in items:
        name = (it.get("name") or "").strip()
        url = it.get("url") or ""
        haystack = f"{name} {url} {it.get('card', '')}"
        if not url.startswith("http") or not name:
            continue
        if not site.get("brand_implied") and not BRAND_RE.search(haystack):
            continue
        if not SUIT_RE.search(f"{name} {url}") or NOT_A_SUIT_RE.search(name):
            continue
        price = it.get("price")
        if not price or price < 20:
            continue
        key = _canonical(url)
        prev = merged.get(key)
        if prev:
            # Keep the richest data: a known original price beats none.
            if not prev["was"] and it.get("was"):
                prev["was"] = it["was"]
                prev["price"] = price
            if not prev["image"] and it.get("image"):
                prev["image"] = it["image"]
            if "suit" not in prev["name"].lower() and "suit" in name.lower():
                prev["name"] = name
            continue
        merged[key] = {
            "name": name,
            "url": url,
            "price": round(price, 2),
            "was": round(it["was"], 2) if it.get("was") else None,
            "image": it.get("image") or "",
            "site": site["name"],
            "resale": bool(site.get("resale")),
        }
    out = []
    for d in merged.values():
        d["discount"] = round(100 * (1 - d["price"] / d["was"])) if d["was"] else 0
        d["separates"] = bool(SEPARATES_RE.search(d["name"])) and not FULL_SUIT_RE.search(d["name"])
        out.append(d)
    return out


async def _scan_site(ctx, site, sem, on_progress):
    async with sem:
        started = time.time()
        result = {"site": site["name"], "url": site["url"], "status": "ok", "count": 0, "items": []}
        page = await ctx.new_page()
        try:
            resp = await page.goto(site["url"], wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
            await page.wait_for_timeout(SETTLE_MS)
            # Scroll to trigger lazy-loaded product tiles.
            for _ in range(5):
                await page.mouse.wheel(0, 2500)
                await page.wait_for_timeout(700)
            raw = await page.evaluate(EXTRACT_JS)
            title = await page.title()
            items = _clean(raw, site)
            result["items"] = items
            result["count"] = len(items)
            code = resp.status if resp else 0
            if not items and (code >= 400 or BLOCKED_TITLE_RE.search(title or "")):
                result["status"] = "blocked"
                result["note"] = f"HTTP {code} – {title[:80]}"
            elif not items:
                result["status"] = "empty"
                result["note"] = "No Hugo Boss suits found on the page"
        except Exception as e:  # timeouts, DNS, crashes – report and move on
            result["status"] = "error"
            result["note"] = str(e).splitlines()[0][:160]
        finally:
            await page.close()
        result["seconds"] = round(time.time() - started, 1)
        if on_progress:
            on_progress(result)
        return result


async def _launch(pw, headless):
    args = ["--disable-blink-features=AutomationControlled"]
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if os.environ.get("CHROMIUM_PATH"):
        return await pw.chromium.launch(
            executable_path=os.environ["CHROMIUM_PATH"], headless=headless, args=args,
            proxy={"server": proxy} if proxy else None,
        )
    # Prefer the user's installed Google Chrome (looks like a normal visitor to
    # most sites); fall back to Playwright's bundled Chromium.
    try:
        return await pw.chromium.launch(channel="chrome", headless=headless, args=args)
    except Exception:
        return await pw.chromium.launch(headless=headless, args=args)


async def scan(sites=None, headless=True, on_progress=None):
    sites = [s for s in (sites or load_sites()) if s.get("enabled", True)]
    sem = asyncio.Semaphore(CONCURRENCY)
    async with async_playwright() as pw:
        browser = await _launch(pw, headless)
        ctx = await browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1440, "height": 1000},
            locale="en-US",
            timezone_id="America/New_York",
        )
        await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        results = await asyncio.gather(*[_scan_site(ctx, s, sem, on_progress) for s in sites])
        await browser.close()
    deals = [d for r in results for d in r.pop("items")]
    deals.sort(key=lambda d: (-d["discount"], d["price"]))
    return {"scanned_at": time.strftime("%Y-%m-%d %H:%M"), "sites": results, "deals": deals}


def main():
    headless = "--show-browser" not in sys.argv

    def progress(r):
        print(f"  {r['status']:>7}  {r['count']:>3} suits  {r['site']}", file=sys.stderr)

    print("Scanning…", file=sys.stderr)
    report = asyncio.run(scan(headless=headless, on_progress=progress))
    print()
    for d in report["deals"]:
        off = f"{d['discount']:>3}% off" if d["discount"] else "        "
        was = f"(was ${d['was']:,.0f})" if d["was"] else ""
        print(f"{off}  ${d['price']:>8,.2f} {was:<14} {d['site']:<22} {d['name'][:60]}")
        print(f"          {d['url']}")


if __name__ == "__main__":
    main()
