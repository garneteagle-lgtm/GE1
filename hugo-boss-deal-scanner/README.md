# Hugo Boss Deal Scanner (Mac)

A Mac app that checks 13 reputable stores for Hugo Boss suits on sale, whenever
you click **Scan**, and shows the deals biggest discount first. It only shows
suits that are:

- **From reputable stores.** Only the Hugo Boss site and established department
  stores and retailers. There are no marketplaces (eBay, Amazon), resale sites
  or grey-market discounters, and a result only counts when the product page is
  on the store's own website.
- **Brand new.** Any listing that says pre-owned, used or worn is dropped.
- **Slim fit or regular fit.** Extra-slim suits are always dropped (as are
  "tailored" and "modern" fits). The fit comes from the product name, the
  product page, or the Boss model name: Huge, Genius and Hutson are slim;
  Houston, Jeckson and Novan are regular; Arti and Hesten are extra slim.

Sizes aren't checked. Open a suit on the store's site to pick your size.

- **Stores:** hugoboss.com sale, Nordstrom, Nordstrom Rack, Dillard's, Macy's,
  Bloomingdale's, Saks Off 5th, Neiman Marcus, Bergdorf Goodman, SSENSE,
  Zappos, Farfetch and Belk. You can add, remove or turn off stores in the
  **Websites** tab.
- **Filters:** slim or regular fit, max price, minimum % off, full suits only
  (hides separate jackets and pants), and a text search for things like `navy`
  or `Huge`.
- **NEW badges** mark suits that weren't there on your last scan.
- **Private.** It runs only on your Mac. There's no account and nothing is sent
  anywhere except the normal page loads to the stores themselves.

## Install (one time, about 3 minutes)

1. Get this folder onto your Mac (clone the repo, or download it as a ZIP and unzip it).
2. Open **Terminal** and run:

   ```bash
   cd path/to/hugo-boss-deal-scanner
   ./install.sh
   ```

   The script sets up a private Python environment inside the folder and
   downloads the browser it scans with (about 150 MB). Then it creates
   **Hugo Boss Deals.app** in `~/Applications`.
   If it asks for Python, install it from <https://www.python.org/downloads/>
   and run the script again.

3. Press ⌘-Space, type **Hugo Boss Deals** and hit Return. You can also drag
   the app from `~/Applications` to your Dock.

> Keep this folder where it is after installing, because the app runs from it.
> If you move the folder, run `./install.sh` again.

## Using it

1. Open the app. A page opens in your web browser.
2. Click **Scan for deals**. Step 1 searches the stores, and each one shows a
   green, orange or red chip as it finishes. Step 2 opens the product page
   for any sale suit whose name doesn't say its fit. A full scan takes a few
   minutes.
3. Click any suit to open it on the store's website.
4. Click **Quit** when you're done. If you don't, the app keeps running quietly
   in the background, and opening it again just brings the page back.

### "Fit unconfirmed" suits

Sometimes the app can't tell a suit's fit. The store may have blocked the
product page, or the page may not say. Those suits are hidden, not thrown away.
The summary line tells you how many there are, and ticking **Also show
unconfirmed fit** shows them with an orange "Fit unconfirmed" label. Open the
link and check them yourself before buying.

### If a store says "blocked"

Some big retailers (Macy's, Neiman Marcus and others) block automated
browsers. Your odds are best from a home internet connection with
**Google Chrome** installed, because the scanner uses your Chrome when it's
available. If a store is still blocked, tick **Show browser while scanning**
and scan again. That runs a visible browser window, which gets past many of
these checks. Leave the window alone until the scan finishes.

### Adding a store

Only add stores that sell new Hugo Boss directly. Go to the store's website, search for "hugo boss suit" (or open its Hugo Boss
sale page), and copy the address from the address bar. Paste it into
**Websites → Add website**, then click **Save**. The scanner reads the product
tiles on the page, so it works with most stores and doesn't need custom code.

## Command-line use (optional)

```bash
.venv/bin/python scanner.py                 # print deals in Terminal
.venv/bin/python scanner.py --show-browser  # same, with a visible browser
```

## Files

| File | What it does |
| --- | --- |
| `app.py` | Local web server for the app window (runs only on `127.0.0.1`) |
| `scanner.py` | Opens each store, keeps Hugo Boss suits, works out the discounts |
| `extract.js` | Runs inside each search page to read product names, prices and images |
| `check_product.js` | Runs on a product page to read the fit and check the listing is new |
| `sites.json` | Your list of stores (the Websites tab edits this file) |
| `static/index.html` | The app's interface |
| `install.sh` | One-time setup and app builder |
