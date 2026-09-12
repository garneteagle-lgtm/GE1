#!/usr/bin/env node
// Cheap business-class flight finder.
//
//   node tools/flight-finder/cli.mjs "New York" "London" --depart 2026-11-12 --return 2026-11-19 --flex 3
//
// Run with --help for the full option list, or --demo to see it work without
// API credentials.

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { writeFileSync } from "node:fs";

import { loadEnv } from "./env.mjs";
import { Cache } from "./cache.mjs";
import { AmadeusClient, AmadeusError, MissingCredentialsError } from "./amadeus.mjs";
import { resolvePlace, PlaceResolutionError } from "./places.mjs";
import { buildDatePlan, sweep, filterOffers, summarize, addDays, daysBetween, CABINS } from "./search.mjs";
import {
  style,
  table,
  formatMoney,
  formatDuration,
  renderOffer,
  renderDateStrip,
  bookingLinks,
  cabinLabel,
} from "./format.mjs";
import { DemoClient } from "./demo-data.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "..", "..");

const CABIN_ALIASES = {
  economy: "ECONOMY",
  eco: "ECONOMY",
  coach: "ECONOMY",
  y: "ECONOMY",
  premium: "PREMIUM_ECONOMY",
  "premium-economy": "PREMIUM_ECONOMY",
  "premium_economy": "PREMIUM_ECONOMY",
  w: "PREMIUM_ECONOMY",
  business: "BUSINESS",
  biz: "BUSINESS",
  j: "BUSINESS",
  c: "BUSINESS",
  first: "FIRST",
  f: "FIRST",
};

const HELP = `
${style.bold("flight-finder")} - find the cheapest business-class fares between two cities

${style.bold("Usage")}
  npm run flights -- <from> <to> [options]
  node tools/flight-finder/cli.mjs <from> <to> [options]

  <from> and <to> accept a city name ("new york", "sao paulo") or an IATA
  code (JFK, LHR). City names resolve to the metro code where one exists, so
  "new york" prices JFK, EWR and LGA together in a single call.

${style.bold("When")}
  -d, --depart <date>      departure date: YYYY-MM-DD, +N days from today, or MM-DD
  -r, --return <date>      return date; omit for one-way
  -n, --nights <n>         return N nights after departure (instead of --return)
      --flex <n>           also price N days either side of the departure date,
                           keeping the trip length (default 3, 0 disables)
      --lengths <a,b,c>    on a round trip, also price these trip lengths in nights

${style.bold("Who and what")}
  -a, --adults <n>         travellers (default 1)
  -c, --cabin <cabin>      economy | premium | business | first (default business)
      --currency <code>    ISO currency for prices (default USD)

${style.bold("Narrowing")}
      --nonstop            nonstop flights only
      --max-stops <n>      allow at most N stops per direction
      --max-price <n>      per-traveller ceiling, passed to the API
      --max-duration <h>   drop itineraries longer than H hours in total
      --airlines <codes>   only these carriers, e.g. BA,AA,QR
      --exclude <codes>    never these carriers
      --strict             drop mixed-cabin results (every leg must be in cabin)

${style.bold("Output")}
  -t, --top <n>            how many offers to print (default 8)
      --json [file]        machine-readable results to stdout or a file
      --csv <file>         write the ranked offers as CSV
  -v, --verbose            log every API call

${style.bold("Plumbing")}
      --demo               run offline with invented fares (no credentials needed)
      --env <test|production>   which Amadeus host to use (default test)
      --no-cache           bypass the local response cache
      --cache-ttl <hours>  cache lifetime (default 6)
      --clear-cache        delete cached responses and exit
  -h, --help               this text

${style.bold("Examples")}
  npm run flights -- "new york" london --depart 2026-11-12 --nights 7 --flex 3
  npm run flights -- JFK NRT -d +45 -n 10 --cabin business --strict --nonstop
  npm run flights -- london dubai -d 2026-12-01 --flex 5 --lengths 4,7,10 --top 12
  npm run flights -- --demo "new york" tokyo -d +30 -n 7
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const options = {
    positionals: [],
    depart: undefined,
    return: undefined,
    nights: undefined,
    flex: 3,
    lengths: [],
    adults: 1,
    cabin: "BUSINESS",
    currency: "USD",
    nonStop: false,
    maxStops: undefined,
    maxPrice: undefined,
    maxDuration: undefined,
    airlines: undefined,
    exclude: undefined,
    strict: false,
    top: 8,
    json: undefined,
    csv: undefined,
    verbose: false,
    demo: false,
    env: process.env.AMADEUS_ENV || "test",
    cache: true,
    cacheTtlHours: 6,
    clearCache: false,
    help: false,
  };

  const takeValue = (flag, value) => {
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${flag} needs a value`);
    return value;
  };
  const int = (flag, value) => {
    const parsed = Number(takeValue(flag, value));
    if (!Number.isFinite(parsed)) throw new UsageError(`${flag} needs a number, got "${value}"`);
    return parsed;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-d":
      case "--depart":
      case "--from-date":
        options.depart = takeValue(arg, argv[++i]);
        break;
      case "-r":
      case "--return":
        options.return = takeValue(arg, argv[++i]);
        break;
      case "-n":
      case "--nights":
        options.nights = int(arg, argv[++i]);
        break;
      case "--flex":
        options.flex = Math.max(0, int(arg, argv[++i]));
        break;
      case "--lengths":
        options.lengths = takeValue(arg, argv[++i])
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value) && value > 0);
        break;
      case "-a":
      case "--adults":
        options.adults = int(arg, argv[++i]);
        break;
      case "-c":
      case "--cabin":
      case "--class": {
        const raw = takeValue(arg, argv[++i]).toLowerCase();
        const cabin = CABIN_ALIASES[raw] || (CABINS.includes(raw.toUpperCase()) ? raw.toUpperCase() : null);
        if (!cabin) throw new UsageError(`unknown cabin "${raw}" (try economy, premium, business, first)`);
        options.cabin = cabin;
        break;
      }
      case "--currency":
        options.currency = takeValue(arg, argv[++i]).toUpperCase();
        break;
      case "--nonstop":
      case "--non-stop":
        options.nonStop = true;
        break;
      case "--max-stops":
        options.maxStops = int(arg, argv[++i]);
        break;
      case "--max-price":
        options.maxPrice = int(arg, argv[++i]);
        break;
      case "--max-duration":
        options.maxDuration = int(arg, argv[++i]);
        break;
      case "--airlines":
        options.airlines = takeValue(arg, argv[++i]).toUpperCase().split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--exclude":
      case "--exclude-airlines":
        options.exclude = takeValue(arg, argv[++i]).toUpperCase().split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--strict":
        options.strict = true;
        break;
      case "-t":
      case "--top":
        options.top = int(arg, argv[++i]);
        break;
      case "--json":
        // Optional filename: `--json` alone means stdout.
        options.json = argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[++i] : true;
        break;
      case "--csv":
        options.csv = takeValue(arg, argv[++i]);
        break;
      case "-v":
      case "--verbose":
        options.verbose = true;
        break;
      case "--demo":
        options.demo = true;
        break;
      case "--env":
        options.env = takeValue(arg, argv[++i]);
        break;
      case "--no-cache":
        options.cache = false;
        break;
      case "--cache-ttl":
        options.cacheTtlHours = int(arg, argv[++i]);
        break;
      case "--clear-cache":
        options.clearCache = true;
        break;
      default:
        if (arg.startsWith("-") && arg !== "-") throw new UsageError(`unknown option ${arg}`);
        options.positionals.push(arg);
    }
  }
  return options;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts YYYY-MM-DD, "+30" (days from today) and MM-DD (next occurrence). */
export function parseDate(input, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const value = String(input).trim();
  if (ISO_DATE.test(value)) {
    if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new UsageError(`"${value}" is not a real date`);
    return value;
  }
  if (/^\+\d+$/.test(value)) return addDays(today, Number(value.slice(1)));
  if (/^\d{1,2}-\d{1,2}$/.test(value)) {
    const [month, day] = value.split("-").map(Number);
    const year = Number(today.slice(0, 4));
    const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return candidate >= today
      ? candidate
      : `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  throw new UsageError(`could not read the date "${input}" (use YYYY-MM-DD, +30, or MM-DD)`);
}

function toCsv(offers) {
  const header = [
    "rank", "price_total", "price_per_traveller", "currency", "airlines",
    "depart_date", "depart_time", "return_date", "stops", "total_duration_minutes",
    "all_segments_in_cabin", "checked_bags", "seats_left", "flights",
  ];
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = offers.map((offer, index) => [
    index + 1,
    offer.price.total,
    Math.round(offer.price.perTraveler * 100) / 100,
    offer.price.currency,
    offer.airlines.join(" / "),
    offer.query.departureDate,
    (offer.itineraries[0]?.departsAt || "").slice(11, 16),
    offer.query.returnDate || "",
    offer.stops,
    offer.totalDurationMinutes,
    offer.cabin.fullyRequested,
    offer.checkedBags ?? "",
    offer.bookableSeats ?? "",
    offer.itineraries.flatMap((it) => it.segments.map((s) => s.flightNumber)).join(" "),
  ]);
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

/** Everything the CLI prints, minus the `raw` Amadeus payload. */
function toJson({ origin, destination, options, offers, priced, stats, errors }) {
  return {
    search: {
      origin: { code: origin.code, name: origin.name },
      destination: { code: destination.code, name: destination.name },
      cabin: options.cabin,
      adults: options.adults,
      currency: options.currency,
      departureDate: options.depart,
      returnDate: options.return,
      flexDays: options.flex,
      generatedAt: new Date().toISOString(),
      demo: options.demo,
    },
    summary: stats,
    datePrices: priced,
    offers: offers.map((offer) => {
      const { raw, ...rest } = offer;
      return rest;
    }),
    errors: errors.map(({ slot, error }) => ({
      departureDate: slot.departureDate,
      returnDate: slot.returnDate,
      message: error.message,
      status: error.status,
      code: error.code,
    })),
  };
}

async function main(argv) {
  const options = parseArgs(argv);

  if (options.help || argv.length === 0) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  loadEnv(PROJECT_ROOT);

  const cache = new Cache(join(PROJECT_ROOT, ".cache", "flights"), {
    ttlMs: options.cacheTtlHours * 3600 * 1000,
    enabled: options.cache && !options.demo,
  });

  if (options.clearCache) {
    cache.clear();
    process.stdout.write("Cached flight responses deleted.\n");
    return 0;
  }

  if (options.positionals.length < 2) {
    throw new UsageError("give a departure city and a destination, e.g. `npm run flights -- london tokyo`");
  }
  const [originQuery, destinationQuery] = options.positionals;

  if (!options.depart) throw new UsageError("--depart is required (e.g. --depart 2026-11-12 or --depart +45)");
  options.depart = parseDate(options.depart);

  if (options.return) {
    options.return = parseDate(options.return);
  } else if (options.nights !== undefined) {
    options.return = addDays(options.depart, options.nights);
  }
  if (options.return && daysBetween(options.depart, options.return) <= 0) {
    throw new UsageError("the return date must be after the departure date");
  }
  if (options.adults < 1 || options.adults > 9) throw new UsageError("--adults must be between 1 and 9");
  if (options.airlines && options.exclude) {
    throw new UsageError("--airlines and --exclude cannot be used together; the API accepts only one");
  }
  if (!["test", "production"].includes(options.env)) {
    throw new UsageError(`--env must be "test" or "production", got "${options.env}"`);
  }

  const log = options.verbose ? (message) => process.stderr.write(`${style.dim(message)}\n`) : () => {};

  let client;
  if (options.demo) {
    client = new DemoClient();
  } else {
    try {
      client = new AmadeusClient({
        clientId: process.env.AMADEUS_CLIENT_ID,
        clientSecret: process.env.AMADEUS_CLIENT_SECRET,
        env: options.env,
        cache,
        log,
      });
    } catch (error) {
      if (!(error instanceof MissingCredentialsError)) throw error;
      process.stderr.write(
        `${style.yellow("No Amadeus API credentials found.")}\n\n` +
          "  1. Sign up free at https://developers.amadeus.com (Self-Service).\n" +
          "  2. Create an app; copy its API Key and API Secret.\n" +
          "  3. Put them in .env at the project root:\n\n" +
          "       AMADEUS_CLIENT_ID=your-key\n" +
          "       AMADEUS_CLIENT_SECRET=your-secret\n\n" +
          `  Or try it offline first: ${style.bold("npm run flights -- --demo " + originQuery + " " + destinationQuery + " -d +30 -n 7")}\n`,
      );
      return 2;
    }
  }

  const [origin, destination] = await Promise.all([
    resolvePlace(originQuery, { client }),
    resolvePlace(destinationQuery, { client }),
  ]);

  const plan = buildDatePlan({
    departureDate: options.depart,
    returnDate: options.return,
    flex: options.flex,
    nights: options.lengths,
  });
  if (plan.length === 0) throw new UsageError("that date window is entirely in the past");

  const tripLabel = options.return
    ? `${options.depart} to ${options.return} (${daysBetween(options.depart, options.return)} nights)`
    : `${options.depart}, one way`;
  // A bare code resolves to itself, so avoid printing "JFK (JFK)".
  const label = (place) => (place.name === place.code ? place.code : `${place.name} (${place.code})`);
  process.stderr.write(
    `${style.bold(label(origin))} ${style.dim("->")} ${style.bold(label(destination))}  ` +
      `${style.dim("|")} ${cabinLabel(options.cabin)} ${style.dim("|")} ${options.adults} traveller${options.adults > 1 ? "s" : ""} ` +
      `${style.dim("|")} ${tripLabel}\n` +
      style.dim(
        `Pricing ${plan.length} date option${plan.length === 1 ? "" : "s"}${options.demo ? " (demo data)" : ""}...\n`,
      ),
  );

  const { offers: allOffers, errors, priced } = await sweep({
    client,
    origin: origin.code,
    destination: destination.code,
    plan,
    adults: options.adults,
    cabin: options.cabin,
    nonStop: options.nonStop,
    currency: options.currency,
    maxPrice: options.maxPrice,
    includedAirlineCodes: options.airlines?.join(","),
    excludedAirlineCodes: options.exclude?.join(","),
    onProgress: ({ done, total }) => {
      if (!options.verbose && process.stderr.isTTY) {
        process.stderr.write(`\r${style.dim(`  ${done}/${total} dates priced`)}`);
      }
    },
  });
  if (!options.verbose && process.stderr.isTTY) process.stderr.write(`\r${" ".repeat(40)}\r`);

  const offers = filterOffers(allOffers, {
    maxStops: options.maxStops,
    maxDurationMinutes: options.maxDuration ? options.maxDuration * 60 : undefined,
    strictCabin: options.strict,
    airlines: options.airlines,
  });
  const stats = summarize(offers);

  if (options.json) {
    const payload = JSON.stringify(toJson({ origin, destination, options, offers, priced, stats, errors }), null, 2);
    if (options.json === true) {
      process.stdout.write(`${payload}\n`);
    } else {
      writeFileSync(options.json, `${payload}\n`);
      process.stderr.write(`Wrote ${options.json}\n`);
    }
  }

  if (options.csv) {
    writeFileSync(options.csv, `${toCsv(offers)}\n`);
    process.stderr.write(`Wrote ${options.csv}\n`);
  }

  if (options.json === true) return offers.length ? 0 : 1;

  // ---- human-readable report ----
  const out = [];

  if (offers.length === 0) {
    const reason = allOffers.length > 0 ? "Filters removed every result." : "No offers came back.";
    out.push(style.yellow(`${reason} Things worth trying:`));
    if (options.strict) out.push("  - drop --strict: mixed-cabin itineraries are often much cheaper");
    if (options.nonStop) out.push("  - drop --nonstop: one stop usually cuts a business fare hard");
    if (options.maxPrice) out.push(`  - raise --max-price above ${options.maxPrice}`);
    out.push("  - widen --flex, or try a different month");
    if (!options.demo && options.env === "test") {
      out.push(
        style.dim(
          "  - the Amadeus test environment only holds cached data for a subset of routes;\n" +
            "    once your app is approved, re-run with --env production for live fares",
        ),
      );
    }
    process.stdout.write(`${out.join("\n")}\n`);
    if (errors.length) {
      process.stderr.write(`\n${style.red(`${errors.length} search(es) failed:`)}\n`);
      for (const { slot, error } of errors.slice(0, 5)) {
        process.stderr.write(`  ${slot.departureDate}: ${error.message}${error.detail ? ` - ${error.detail}` : ""}\n`);
      }
    }
    return 1;
  }

  const strip = renderDateStrip(priced, options.currency);
  if (strip) {
    out.push(style.bold("Cheapest fare by departure date"));
    out.push(strip);
    out.push("");
  }

  const best = offers[0];
  out.push(style.bold(`Best ${cabinLabel(options.cabin)} fares (${Math.min(options.top, offers.length)} of ${offers.length})`));
  out.push("");
  offers.slice(0, options.top).forEach((offer, index) => {
    out.push(renderOffer(offer, index + 1, { adults: options.adults, cheapest: best.price.total }));
    out.push("");
  });

  if (stats && stats.count > 2) {
    out.push(
      style.dim(
        `Across ${stats.count} offers: cheapest ${formatMoney(stats.cheapest, stats.currency)}, ` +
          `typical ${formatMoney(stats.median, stats.currency)}, dearest ${formatMoney(stats.highest, stats.currency)}. ` +
          `The top result is ${Math.round(stats.savingVsMedian * 100)}% under typical.`,
      ),
    );
  }

  const fastest = offers.reduce((a, b) => (a.totalDurationMinutes <= b.totalDurationMinutes ? a : b));
  if (fastest !== best) {
    out.push(
      style.dim(
        `Quickest option is ${formatDuration(fastest.totalDurationMinutes)} in the air ` +
          `(${fastest.airlines.join(", ")}) at ${formatMoney(fastest.price.total, fastest.price.currency)}, ` +
          `${formatMoney(fastest.price.total - best.price.total, best.price.currency)} more than the cheapest.`,
      ),
    );
  }

  {
    const links = bookingLinks({
      origin: origin.code,
      destination: destination.code,
      departureDate: best.query.departureDate,
      returnDate: best.query.returnDate,
      cabin: options.cabin,
      adults: options.adults,
    });
    out.push("");
    out.push(style.bold("Book the best date"));
    out.push(`  Kayak          ${style.cyan(links.kayak)}`);
    out.push(`  Google Flights ${style.cyan(links.google)}`);
  }

  if (options.demo) {
    out.push("");
    out.push(style.yellow("Demo mode: every fare above is invented. Add Amadeus credentials for real prices."));
  }

  process.stdout.write(`${out.join("\n")}\n`);

  if (errors.length) {
    process.stderr.write(
      `\n${style.dim(`${errors.length} of ${plan.length} date searches failed; results above exclude them.`)}\n`,
    );
    for (const { slot, error } of errors.slice(0, 3)) {
      process.stderr.write(style.dim(`  ${slot.departureDate}: ${error.message}\n`));
    }
  }
  if (!options.demo && client.calls !== undefined) {
    log(`${client.calls} API calls, ${cache.hits} cache hits`);
  }
  return 0;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      if (error instanceof UsageError) {
        process.stderr.write(`${style.red("Error:")} ${error.message}\n\nRun with --help for usage.\n`);
        process.exitCode = 2;
      } else if (error instanceof PlaceResolutionError) {
        process.stderr.write(`${style.red("Error:")} ${error.message}\n`);
        process.exitCode = 2;
      } else if (error instanceof AmadeusError) {
        process.stderr.write(
          `${style.red("Amadeus error:")} ${error.message}\n` +
            (error.detail ? `  ${error.detail}\n` : "") +
            (error.status === 401 ? "  Check AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET in .env\n" : ""),
        );
        process.exitCode = 1;
      } else {
        process.stderr.write(`${style.red("Unexpected error:")} ${error.stack || error.message}\n`);
        process.exitCode = 1;
      }
    });
}

export { main, parseArgs, toCsv, UsageError };
