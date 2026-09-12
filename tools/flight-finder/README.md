# flight-finder

A command-line tool that finds the cheapest business-class fares between two
cities. Give it two places and a rough date; it prices a window of departure
dates, ranks every offer it finds, and tells you which day is actually cheapest.

It is a standalone Node script inside this repo — no dependencies, no build
step, and completely separate from the Next.js case-management app.

```
npm run flights -- "new york" london --depart 2026-11-12 --nights 7 --flex 3
```

```
New York City (NYC) -> London (LON)  | business | 1 traveller | 2026-11-12 to 2026-11-19 (7 nights)

Cheapest fare by departure date
date                         from
-------------------------  ------  --------
Sun, Nov 9  -> Sun, Nov 16  $3,676  +$457
Mon, Nov 10 -> Mon, Nov 17  $3,752  +$533
Wed, Nov 12 -> Wed, Nov 19  $3,219  cheapest
Thu, Nov 13 -> Thu, Nov 20  $4,799  +$1,580

Best business fares (8 of 45)

 1. $3,219  | DELTA AIR LINES
    out  Wed, Nov 12  NYC 08:00 -> LON 21:45  13h 45m, 1 stop
      DL396   NYC-ATL 08:00-14:26 6h 26m business
      DL668   ATL-LON 17:23-21:45 4h 22m business
    back Wed, Nov 19  LON 19:00 -> NYC 08:23+1  13h 23m, 1 stop
      ...
    2 checked bags | book by 2026-11-12

 2. $3,676 +$457  | AIR FRANCE  mixed cabin: 3/4 legs in business
    ...

Across 45 offers: cheapest $3,219, typical $4,410, dearest $8,850.
The top result is 27% under typical.

Book the best date
  Kayak          https://www.kayak.com/flights/NYC-LON/2026-11-12/2026-11-19/business
  Google Flights https://www.google.com/travel/flights?q=...
```

## Try it without signing up for anything

```
npm run flights -- --demo "new york" tokyo -d +30 -n 7
```

Demo mode generates plausible-looking itineraries locally so you can see the
output and learn the flags. **The prices are invented** — the tool says so at
the bottom of every demo run.

## Getting real prices

Fares come from the [Amadeus Self-Service API](https://developers.amadeus.com),
which is the same GDS inventory travel agents search. The free tier covers
2,000 calls a month, which is plenty — a flexible search costs one call per
departure date.

1. Sign up at <https://developers.amadeus.com> and create a Self-Service app.
2. Copy its **API Key** and **API Secret**.
3. Add them to `.env` in the project root:

   ```
   AMADEUS_CLIENT_ID="your-key"
   AMADEUS_CLIENT_SECRET="your-secret"
   AMADEUS_ENV="test"
   ```

### test vs production

New Amadeus apps start in the **test** environment, which serves cached fares
for a limited set of routes. Expect thin or empty results on less common city
pairs — that is the sandbox, not a bug in this tool.

Moving the app to **production** in the Amadeus dashboard is free and gives you
live fares on every route. Once approved, set `AMADEUS_ENV="production"` (or
pass `--env production`).

## How it finds a cheap fare

Four things do most of the work:

**Metro codes, not airports.** Typing `"new york"` resolves to `NYC`, which
prices JFK, EWR and LGA together in one call. Same for `LON`, `PAR`, `TYO` and
the rest. Pass an explicit code (`JFK`) when you really do want one airport.

**Flexible dates.** `--flex 3` prices three days either side of your departure
date, keeping the trip length, then shows the price for each day so a cheaper
departure is obvious. On long-haul business fares the gap between a Tuesday and
a Saturday is routinely four figures. `--lengths 5,7,10` also prices different
trip lengths.

**Mixed-cabin detection.** Amadeus answers a `BUSINESS` request with itineraries
where only *some* legs are in business — a business long-haul with an economy
feeder. Those look like bargains and aren't quite. Every offer shows the cabin
per leg, and anything short of a full business itinerary is flagged
`mixed cabin: 3/4 legs in business`. `--strict` drops them entirely.

**Price context.** The summary line reports the cheapest, typical (median) and
dearest fare across everything found, so you can tell a genuine deal from the
only result.

## Options

| Flag | What it does |
| --- | --- |
| `-d, --depart <date>` | Departure date: `2026-11-12`, `+45` (days from today), or `11-12` |
| `-r, --return <date>` | Return date; omit for one-way |
| `-n, --nights <n>` | Return N nights after departure, instead of `--return` |
| `--flex <n>` | Also price N days either side of the departure date (default 3) |
| `--lengths <a,b,c>` | Also price these trip lengths in nights |
| `-a, --adults <n>` | Travellers, 1–9 (default 1) |
| `-c, --cabin <cabin>` | `economy`, `premium`, `business`, `first` (default business) |
| `--currency <code>` | Currency for prices (default USD) |
| `--nonstop` | Nonstop flights only |
| `--max-stops <n>` | At most N stops per direction |
| `--max-price <n>` | Per-traveller ceiling, passed to the API |
| `--max-duration <h>` | Drop itineraries over H hours total |
| `--airlines <codes>` | Only these carriers, e.g. `BA,AA,QR` |
| `--exclude <codes>` | Never these carriers |
| `--strict` | Every leg must be in the requested cabin |
| `-t, --top <n>` | How many offers to print (default 8) |
| `--json [file]` | Full results as JSON, to stdout or a file |
| `--csv <file>` | Ranked offers as CSV |
| `--demo` | Run offline with invented fares |
| `--env <test\|production>` | Which Amadeus host to use |
| `--no-cache` / `--cache-ttl <h>` / `--clear-cache` | Response cache control |
| `-v, --verbose` | Log every API call |

## Examples

```bash
# The default shape: a week in London, flexible by three days each way
npm run flights -- "new york" london -d 2026-11-12 -n 7 --flex 3

# Nonstop only, all legs genuinely in business
npm run flights -- JFK NRT -d +45 -n 10 --strict --nonstop

# Cast a wide net: five days of flex, three trip lengths, top 12 results
npm run flights -- london dubai -d 2026-12-01 --flex 5 --lengths 4,7,10 --top 12

# One-way first class, Gulf carriers only, priced in euros
npm run flights -- LHR SIN -d 2027-01-15 -c first --airlines QR,EK --currency EUR

# Feed the results somewhere else
npm run flights -- paris "sao paulo" -d +60 -n 14 --csv trip.csv --json trip.json
```

## Caching and quota

Responses are cached under `.cache/flights/` for six hours, so re-running the
same search (to change `--top`, or to add `--strict`) costs nothing. Fares do
move during the day — use `--no-cache` when you are about to book.

The client throttles itself to stay inside the Amadeus rate limit, retries 429s
and 5xx with backoff, and refreshes the OAuth token if it expires mid-sweep. A
date that fails is reported at the end; the rest of the sweep still returns.

## Booking

Amadeus Self-Service prices but cannot issue tickets, so each run ends with
Kayak and Google Flights links for the best date. Prices there should match
closely; when they differ, the airline's own site is the authority.

## Tests

```
npm run flights:test
```

Runs the client against a local HTTP server that speaks the Amadeus wire
format, covering OAuth, token refresh, 429/5xx retry, rate limiting, caching,
date planning, offer parsing (including mixed cabins), filtering, ranking, CSV
export and the CLI argument parser.

## Layout

| File | Role |
| --- | --- |
| `cli.mjs` | Argument parsing, orchestration, report rendering |
| `amadeus.mjs` | API client: OAuth, throttle, retry, typed errors |
| `search.mjs` | Date planning, sweep, offer normalization, filtering, ranking |
| `places.mjs` | City/airport name to IATA code |
| `format.mjs` | Terminal tables, money, durations, booking links |
| `cache.mjs` | On-disk response cache |
| `env.mjs` | Dependency-free `.env` loader |
| `demo-data.mjs` | Offline fare generator for `--demo` |
| `test.mjs` | Test suite and mock Amadeus server |
