// Test suite. Runs the real HTTP client against a local server that speaks the
// Amadeus wire format, so auth, retry, caching and parsing are all exercised.
//
//   node tools/flight-finder/test.mjs

import { createServer } from "node:http";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

import { AmadeusClient, AmadeusError, MissingCredentialsError } from "./amadeus.mjs";
import { Cache } from "./cache.mjs";
import { resolvePlace, PlaceResolutionError } from "./places.mjs";
import {
  buildDatePlan,
  normalizeOffer,
  parseIsoDuration,
  addDays,
  daysBetween,
  sweep,
  filterOffers,
  summarize,
} from "./search.mjs";
import { formatMoney, formatDuration, bookingLinks, table } from "./format.mjs";
import { demoFlightOffers, DemoClient } from "./demo-data.mjs";
import { parseArgs, parseDate, toCsv, UsageError, main } from "./cli.mjs";

let passed = 0;
const failures = [];

/** Runs `fn` with stdout/stderr swallowed, returning [result, capturedText]. */
async function quiet(fn) {
  const outWrite = process.stdout.write.bind(process.stdout);
  const errWrite = process.stderr.write.bind(process.stderr);
  let captured = "";
  process.stdout.write = (chunk) => ((captured += chunk), true);
  process.stderr.write = (chunk) => ((captured += chunk), true);
  try {
    return [await fn(), captured];
  } finally {
    process.stdout.write = outWrite;
    process.stderr.write = errWrite;
  }
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`  ok  ${name}\n`);
  } catch (error) {
    failures.push({ name, error });
    process.stdout.write(`  FAIL ${name}\n       ${error.message}\n`);
  }
}

// ---------------------------------------------------------------- mock server

/** Minimal stand-in for the Amadeus Self-Service API. */
function startMockAmadeus() {
  const state = {
    tokenRequests: 0,
    offerRequests: 0,
    requestLog: [],
    // Scripted HTTP statuses consumed one per flight-offers request.
    failuresQueue: [],
    expiredTokens: new Set(),
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/v1/security/oauth2/token") {
      const body = await new Promise((resolve) => {
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => resolve(new URLSearchParams(raw)));
      });
      state.tokenRequests += 1;
      if (body.get("client_secret") !== "good-secret") {
        return send(401, { error: "invalid_client", error_description: "Client credentials are invalid" });
      }
      return send(200, {
        type: "amadeusOAuth2Token",
        access_token: `token-${state.tokenRequests}`,
        expires_in: 1799,
      });
    }

    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Bearer /, "");
    if (!token.startsWith("token-")) {
      return send(401, { errors: [{ status: 401, code: 38191, title: "Invalid access token" }] });
    }
    if (state.expiredTokens.has(token)) {
      return send(401, { errors: [{ status: 401, code: 38192, title: "Access token expired" }] });
    }

    if (url.pathname === "/v1/reference-data/locations") {
      const keyword = (url.searchParams.get("keyword") || "").toUpperCase();
      if (keyword.includes("NOWHERE")) return send(200, { data: [] });
      return send(200, {
        data: [
          {
            type: "location",
            subType: "AIRPORT",
            name: "PORTO AIRPORT",
            iataCode: "OPX",
            address: { cityName: "PORTOVILLE", countryCode: "PT" },
          },
          {
            type: "location",
            subType: "CITY",
            name: "PORTOVILLE",
            iataCode: "PRV",
            address: { cityName: "PORTOVILLE", countryCode: "PT" },
          },
        ],
      });
    }

    if (url.pathname === "/v2/shopping/flight-offers") {
      state.offerRequests += 1;
      state.requestLog.push({
        params: Object.fromEntries(url.searchParams),
        at: Date.now(),
        token,
      });
      const scripted = state.failuresQueue.shift();
      if (scripted === 429) {
        return send(429, { errors: [{ status: 429, code: 38194, title: "Too many requests" }] }, { "retry-after": "0" });
      }
      if (scripted === 500) {
        return send(500, { errors: [{ status: 500, code: 141, title: "SYSTEM ERROR HAS OCCURRED" }] });
      }
      if (scripted === 400) {
        return send(400, {
          errors: [{ status: 400, code: 425, title: "INVALID DATE", detail: "Date/Time is in the past" }],
        });
      }
      const params = Object.fromEntries(url.searchParams);
      return send(
        200,
        demoFlightOffers({
          ...params,
          adults: Number(params.adults || 1),
          max: Number(params.max || 20),
          nonStop: params.nonStop === "true",
        }),
      );
    }

    return send(404, { errors: [{ status: 404, title: "Not found" }] });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, state, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

// --------------------------------------------------------------------- suites

const mock = await startMockAmadeus();
const scratch = mkdtempSync(join(tmpdir(), "flight-finder-test-"));

const makeClient = (overrides = {}) =>
  new AmadeusClient({
    clientId: "good-id",
    clientSecret: "good-secret",
    baseUrl: mock.baseUrl,
    env: "test",
    ...overrides,
  });

process.stdout.write("\npure helpers\n");

await test("parseIsoDuration handles hours, minutes and days", () => {
  assert.equal(parseIsoDuration("PT12H45M"), 765);
  assert.equal(parseIsoDuration("PT9H"), 540);
  assert.equal(parseIsoDuration("PT45M"), 45);
  assert.equal(parseIsoDuration("P1DT2H"), 26 * 60);
  assert.equal(parseIsoDuration(undefined), null);
});

await test("addDays and daysBetween cross month and year boundaries", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-11-12", "2026-11-19"), 7);
  assert.equal(daysBetween("2026-12-28", "2027-01-04"), 7);
});

await test("parseDate accepts ISO, +N and MM-DD", () => {
  assert.equal(parseDate("2026-11-12"), "2026-11-12");
  assert.equal(parseDate("+30", { today: "2026-09-12" }), "2026-10-12");
  assert.equal(parseDate("12-25", { today: "2026-09-12" }), "2026-12-25");
  // A date already past this year rolls to next year.
  assert.equal(parseDate("01-05", { today: "2026-09-12" }), "2027-01-05");
  assert.throws(() => parseDate("next tuesday"), UsageError);
  assert.throws(() => parseDate("2026-13-45"), UsageError);
});

await test("formatMoney and formatDuration render sensibly", () => {
  assert.equal(formatMoney(3219, "USD"), "$3,219");
  assert.equal(formatMoney(NaN, "USD"), "-");
  assert.equal(formatDuration(765), "12h 45m");
  assert.equal(formatDuration(540), "9h");
  assert.equal(formatDuration(0), "-");
});

await test("table aligns around ANSI escapes", () => {
  const rendered = table(["a", "b"], [["xx", "1"], ["y", "22"]], { align: ["left", "right"] });
  const lines = rendered.split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[3].includes(" 22"));
});

await test("bookingLinks builds deterministic Kayak and Google URLs", () => {
  const links = bookingLinks({
    origin: "JFK",
    destination: "LHR",
    departureDate: "2026-11-12",
    returnDate: "2026-11-19",
    cabin: "BUSINESS",
    adults: 2,
  });
  assert.equal(links.kayak, "https://www.kayak.com/flights/JFK-LHR/2026-11-12/2026-11-19/business/2adults");
  assert.ok(links.google.startsWith("https://www.google.com/travel/flights?q="));
  assert.ok(decodeURIComponent(links.google).includes("business class"));

  const oneWay = bookingLinks({ origin: "LHR", destination: "DXB", departureDate: "2026-12-01", cabin: "FIRST" });
  assert.equal(oneWay.kayak, "https://www.kayak.com/flights/LHR-DXB/2026-12-01/first");
});

process.stdout.write("\ndate planning\n");

await test("flex window keeps trip length and stays off past dates", () => {
  const plan = buildDatePlan({ departureDate: "2099-06-10", returnDate: "2099-06-17", flex: 2 });
  assert.equal(plan.length, 5);
  for (const slot of plan) assert.equal(daysBetween(slot.departureDate, slot.returnDate), 7);
  // Requested date is priced first so a truncated run still answers the question.
  assert.equal(plan[0].departureDate, "2099-06-10");
  assert.deepEqual(
    plan.map((slot) => slot.departureDate).sort(),
    ["2099-06-08", "2099-06-09", "2099-06-10", "2099-06-11", "2099-06-12"],
  );
});

await test("extra trip lengths multiply the plan without duplicating it", () => {
  const plan = buildDatePlan({
    departureDate: "2099-06-10",
    returnDate: "2099-06-17",
    flex: 1,
    // 7 repeats the base length and must not produce a duplicate query.
    nights: [4, 7, 10],
  });
  assert.equal(plan.length, 9); // 3 departure dates x 3 distinct lengths
  const keys = plan.map((slot) => `${slot.departureDate}|${slot.returnDate}`);
  assert.equal(new Set(keys).size, keys.length);
});

await test("one-way plans carry no return date", () => {
  const plan = buildDatePlan({ departureDate: "2099-06-10", flex: 1 });
  assert.equal(plan.length, 3);
  for (const slot of plan) assert.equal(slot.returnDate, undefined);
});

await test("a window entirely in the past yields no queries", () => {
  assert.deepEqual(buildDatePlan({ departureDate: "2001-01-01", flex: 2 }), []);
});

process.stdout.write("\noffer parsing\n");

const MIXED_CABIN_OFFER = {
  id: "7",
  itineraries: [
    {
      duration: "PT14H20M",
      segments: [
        {
          id: "1",
          departure: { iataCode: "JFK", at: "2026-11-12T18:25:00" },
          arrival: { iataCode: "CDG", at: "2026-11-13T07:45:00" },
          carrierCode: "AF",
          number: "007",
          aircraft: { code: "77W" },
          operating: { carrierCode: "DL" },
          duration: "PT7H20M",
        },
        {
          id: "2",
          departure: { iataCode: "CDG", at: "2026-11-13T09:30:00" },
          arrival: { iataCode: "LHR", at: "2026-11-13T09:45:00" },
          carrierCode: "AF",
          number: "1680",
          aircraft: { code: "319" },
          duration: "PT1H15M",
        },
      ],
    },
  ],
  price: { currency: "USD", total: "2410.00", grandTotal: "2410.00" },
  validatingAirlineCodes: ["AF"],
  numberOfBookableSeats: 2,
  lastTicketingDate: "2026-10-01",
  travelerPricings: [
    {
      travelerId: "1",
      fareDetailsBySegment: [
        { segmentId: "1", cabin: "BUSINESS", includedCheckedBags: { quantity: 2 } },
        { segmentId: "2", cabin: "ECONOMY", includedCheckedBags: { quantity: 1 } },
      ],
    },
  ],
};

await test("normalizeOffer flattens prices, legs and carrier names", () => {
  const offer = normalizeOffer(MIXED_CABIN_OFFER, {
    dictionaries: { carriers: { AF: "AIR FRANCE" } },
    adults: 2,
    requestedCabin: "BUSINESS",
    query: { departureDate: "2026-11-12" },
  });
  assert.equal(offer.price.total, 2410);
  assert.equal(offer.price.perTraveler, 1205);
  assert.equal(offer.price.currency, "USD");
  assert.deepEqual(offer.airlines, ["AIR FRANCE"]);
  assert.equal(offer.stops, 1);
  assert.equal(offer.totalDurationMinutes, 860);
  assert.equal(offer.itineraries[0].segments[0].flightNumber, "AF007");
  assert.equal(offer.itineraries[0].segments[0].operatingCarrier, "DL");
  assert.equal(offer.bookableSeats, 2);
});

await test("mixed-cabin itineraries are flagged, not silently sold as business", () => {
  const offer = normalizeOffer(MIXED_CABIN_OFFER, {
    dictionaries: {},
    adults: 1,
    requestedCabin: "BUSINESS",
    query: {},
  });
  assert.equal(offer.cabin.fullyRequested, false);
  assert.equal(offer.cabin.segments, 2);
  assert.equal(offer.cabin.atOrAboveRequested, 1);
  assert.deepEqual(offer.cabin.list.sort(), ["BUSINESS", "ECONOMY"]);
});

await test("a cabin above the one requested still counts as satisfied", () => {
  const upgraded = structuredClone(MIXED_CABIN_OFFER);
  upgraded.travelerPricings[0].fareDetailsBySegment[1].cabin = "FIRST";
  const offer = normalizeOffer(upgraded, { dictionaries: {}, adults: 1, requestedCabin: "BUSINESS", query: {} });
  assert.equal(offer.cabin.fullyRequested, true);
});

await test("checked-bag allowance takes the worst leg", () => {
  const offer = normalizeOffer(MIXED_CABIN_OFFER, { dictionaries: {}, adults: 1, requestedCabin: "BUSINESS", query: {} });
  assert.equal(offer.checkedBags, 1);

  const unknown = structuredClone(MIXED_CABIN_OFFER);
  delete unknown.travelerPricings[0].fareDetailsBySegment[1].includedCheckedBags;
  const offerWithUnknown = normalizeOffer(unknown, { dictionaries: {}, adults: 1, requestedCabin: "BUSINESS", query: {} });
  assert.equal(offerWithUnknown.checkedBags, null, "unknown allowance must not read as zero bags");
});

process.stdout.write("\nfiltering and ranking\n");

const fakeOffer = (overrides) => ({
  price: { total: 1000, perTraveler: 1000, currency: "USD" },
  stops: 1,
  totalDurationMinutes: 600,
  cabin: { fullyRequested: true, requested: "BUSINESS", segments: 2, atOrAboveRequested: 2, list: ["BUSINESS"] },
  itineraries: [{ segments: [{ carrier: "BA" }, { carrier: "BA" }] }],
  ...overrides,
});

await test("filters drop stops, duration, mixed cabins and other airlines", () => {
  const offers = [
    fakeOffer({ stops: 0 }),
    fakeOffer({ stops: 2 }),
    fakeOffer({ totalDurationMinutes: 2000 }),
    fakeOffer({ cabin: { fullyRequested: false, requested: "BUSINESS", segments: 2, atOrAboveRequested: 1, list: [] } }),
    fakeOffer({ itineraries: [{ segments: [{ carrier: "QR" }] }] }),
  ];
  assert.equal(filterOffers(offers, { maxStops: 1 }).length, 4);
  assert.equal(filterOffers(offers, { maxDurationMinutes: 900 }).length, 4);
  assert.equal(filterOffers(offers, { strictCabin: true }).length, 4);
  assert.equal(filterOffers(offers, { airlines: ["ba"] }).length, 4);
  assert.equal(filterOffers(offers, {}).length, 5);
});

await test("summarize reports the spread and the saving against typical", () => {
  const stats = summarize([
    fakeOffer({ price: { total: 1000, perTraveler: 1000, currency: "USD" } }),
    fakeOffer({ price: { total: 2000, perTraveler: 2000, currency: "USD" } }),
    fakeOffer({ price: { total: 3000, perTraveler: 3000, currency: "USD" } }),
  ]);
  assert.equal(stats.cheapest, 1000);
  assert.equal(stats.median, 2000);
  assert.equal(stats.highest, 3000);
  assert.equal(stats.savingVsMedian, 0.5);
  assert.equal(summarize([]), null);
});

process.stdout.write("\nHTTP client\n");

await test("missing credentials fail fast rather than at request time", () => {
  assert.throws(() => new AmadeusClient({ clientId: "", clientSecret: "" }), MissingCredentialsError);
});

await test("token is fetched once and reused across requests", async () => {
  const before = mock.state.tokenRequests;
  const client = makeClient();
  await client.searchFlightOffers({
    originLocationCode: "JFK",
    destinationLocationCode: "LHR",
    departureDate: "2099-06-10",
    travelClass: "BUSINESS",
  });
  await client.searchFlightOffers({
    originLocationCode: "JFK",
    destinationLocationCode: "LHR",
    departureDate: "2099-06-11",
    travelClass: "BUSINESS",
  });
  assert.equal(mock.state.tokenRequests - before, 1, "second request must reuse the token");
});

await test("bad credentials surface as a clear error", async () => {
  const client = makeClient({ clientSecret: "wrong" });
  await assert.rejects(
    () => client.searchFlightOffers({ originLocationCode: "JFK", destinationLocationCode: "LHR", departureDate: "2099-06-10" }),
    (error) => error instanceof AmadeusError && /credentials/i.test(error.message),
  );
});

await test("an expired token mid-sweep is refreshed and the request retried", async () => {
  const client = makeClient();
  // Prime a token, then expire it server-side.
  await client.searchFlightOffers({ originLocationCode: "JFK", destinationLocationCode: "LHR", departureDate: "2099-07-01" });
  const stale = mock.state.requestLog[mock.state.requestLog.length - 1].token;
  mock.state.expiredTokens.add(stale);

  const body = await client.searchFlightOffers({
    originLocationCode: "JFK",
    destinationLocationCode: "LHR",
    departureDate: "2099-07-02",
  });
  assert.ok(Array.isArray(body.data) && body.data.length > 0, "request should succeed on the refreshed token");
  const used = mock.state.requestLog[mock.state.requestLog.length - 1].token;
  assert.notEqual(used, stale);
});

await test("429 and 5xx are retried, then succeed", async () => {
  const client = makeClient();
  mock.state.failuresQueue = [429, 500];
  const before = mock.state.offerRequests;
  const body = await client.searchFlightOffers({
    originLocationCode: "JFK",
    destinationLocationCode: "LHR",
    departureDate: "2099-08-01",
  });
  assert.ok(body.data.length > 0);
  assert.equal(mock.state.offerRequests - before, 3, "two failures plus the successful retry");
  assert.equal(mock.state.failuresQueue.length, 0);
});

await test("a 400 is reported with the API's own title and detail, not retried", async () => {
  const client = makeClient();
  mock.state.failuresQueue = [400];
  const before = mock.state.offerRequests;
  await assert.rejects(
    () => client.searchFlightOffers({ originLocationCode: "JFK", destinationLocationCode: "LHR", departureDate: "2099-08-02" }),
    (error) => {
      assert.ok(error instanceof AmadeusError);
      assert.equal(error.status, 400);
      assert.equal(error.code, 425);
      assert.equal(error.message, "INVALID DATE");
      assert.equal(error.detail, "Date/Time is in the past");
      return true;
    },
  );
  assert.equal(mock.state.offerRequests - before, 1, "client errors must not be retried");
});

await test("requests are throttled to the configured interval", async () => {
  const client = makeClient();
  client.minIntervalMs = 80;
  await client.searchFlightOffers({ originLocationCode: "JFK", destinationLocationCode: "LHR", departureDate: "2099-09-01" });
  const start = mock.state.requestLog.length;
  await Promise.all(
    ["2099-09-02", "2099-09-03", "2099-09-04"].map((departureDate) =>
      client.searchFlightOffers({ originLocationCode: "JFK", destinationLocationCode: "LHR", departureDate }),
    ),
  );
  const stamps = mock.state.requestLog.slice(start).map((entry) => entry.at);
  for (let i = 1; i < stamps.length; i += 1) {
    assert.ok(stamps[i] - stamps[i - 1] >= 60, `requests ${i - 1} and ${i} were only ${stamps[i] - stamps[i - 1]}ms apart`);
  }
});

await test("cache serves a repeated query without a second API call", async () => {
  const cache = new Cache(join(scratch, "cache"), { ttlMs: 60_000 });
  const client = makeClient({ cache });
  const params = {
    originLocationCode: "JFK",
    destinationLocationCode: "LHR",
    departureDate: "2099-10-01",
    travelClass: "BUSINESS",
  };
  const before = mock.state.offerRequests;
  const first = await client.searchFlightOffers(params);
  const second = await client.searchFlightOffers(params);
  assert.equal(mock.state.offerRequests - before, 1);
  assert.deepEqual(second, first);
  assert.equal(cache.hits, 1);
});

await test("an expired cache entry is refetched", async () => {
  const cache = new Cache(join(scratch, "cache-ttl"), { ttlMs: -1 });
  const client = makeClient({ cache });
  const params = { originLocationCode: "JFK", destinationLocationCode: "CDG", departureDate: "2099-10-02" };
  const before = mock.state.offerRequests;
  await client.searchFlightOffers(params);
  await client.searchFlightOffers(params);
  assert.equal(mock.state.offerRequests - before, 2);
});

process.stdout.write("\nplace resolution\n");

await test("IATA codes and known cities resolve without an API call", async () => {
  assert.deepEqual(await resolvePlace("lhr"), { code: "LHR", name: "LHR", kind: "airport", source: "code" });
  const nyc = await resolvePlace("  New York  ");
  assert.equal(nyc.code, "NYC");
  assert.equal(nyc.kind, "city");
  assert.equal((await resolvePlace("são paulo")).code, "SAO");
  assert.equal((await resolvePlace("Washington, DC")).code, "WAS");
});

await test("unknown names fall back to the Amadeus lookup and prefer the metro code", async () => {
  const place = await resolvePlace("portoville", { client: makeClient() });
  assert.equal(place.code, "PRV", "a CITY result should beat the AIRPORT result");
  assert.equal(place.kind, "city");
  assert.equal(place.source, "amadeus");
});

await test("an unresolvable name gives an actionable error", async () => {
  await assert.rejects(() => resolvePlace("nowhere land", { client: makeClient() }), PlaceResolutionError);
  await assert.rejects(
    () => resolvePlace("nowhere land"),
    (error) => error instanceof PlaceResolutionError && /IATA code/.test(error.message),
  );
});

process.stdout.write("\nsweep\n");

await test("sweep prices every date, dedupes offers and ranks by price", async () => {
  const client = makeClient();
  const plan = buildDatePlan({ departureDate: "2099-11-10", returnDate: "2099-11-17", flex: 2 });
  const { offers, errors, priced } = await sweep({
    client,
    origin: "JFK",
    destination: "LHR",
    plan,
    cabin: "BUSINESS",
    currency: "USD",
  });
  assert.equal(errors.length, 0);
  assert.equal(priced.length, plan.length);
  assert.ok(offers.length > 0);
  for (let i = 1; i < offers.length; i += 1) {
    assert.ok(offers[i - 1].price.total <= offers[i].price.total, "offers must come back cheapest first");
  }
  assert.ok(priced.every((slot) => slot.departureDate));
  // priced is ordered by date for the strip, regardless of price.
  const dates = priced.map((slot) => slot.departureDate);
  assert.deepEqual(dates, [...dates].sort());
});

await test("one failing date does not sink the whole sweep", async () => {
  const client = makeClient();
  const plan = buildDatePlan({ departureDate: "2099-12-10", flex: 1 });
  mock.state.failuresQueue = [400];
  const { offers, errors, priced } = await sweep({ client, origin: "JFK", destination: "LHR", plan, cabin: "BUSINESS" });
  assert.equal(errors.length, 1);
  assert.ok(offers.length > 0, "the other dates still return offers");
  assert.equal(priced.filter((slot) => slot.failed).length, 1);
  mock.state.failuresQueue = [];
});

process.stdout.write("\nCLI\n");

await test("parseArgs reads the documented flags", () => {
  const options = parseArgs([
    "new york", "london",
    "-d", "2026-11-12", "-n", "7", "--flex", "4",
    "--cabin", "biz", "--adults", "2", "--currency", "eur",
    "--nonstop", "--max-stops", "1", "--strict",
    "--airlines", "ba,af", "--exclude", "u2",
    "--lengths", "5,9", "--top", "12", "--verbose",
  ]);
  assert.deepEqual(options.positionals, ["new york", "london"]);
  assert.equal(options.depart, "2026-11-12");
  assert.equal(options.nights, 7);
  assert.equal(options.flex, 4);
  assert.equal(options.cabin, "BUSINESS");
  assert.equal(options.adults, 2);
  assert.equal(options.currency, "EUR");
  assert.equal(options.nonStop, true);
  assert.equal(options.maxStops, 1);
  assert.equal(options.strict, true);
  assert.deepEqual(options.airlines, ["BA", "AF"]);
  assert.deepEqual(options.exclude, ["U2"]);
  assert.deepEqual(options.lengths, [5, 9]);
  assert.equal(options.top, 12);
  assert.equal(options.verbose, true);
});

await test("parseArgs rejects unknown options, cabins and missing values", () => {
  assert.throws(() => parseArgs(["--nope"]), UsageError);
  assert.throws(() => parseArgs(["--cabin", "sleeper"]), UsageError);
  assert.throws(() => parseArgs(["--adults", "many"]), UsageError);
  assert.throws(() => parseArgs(["--depart"]), UsageError);
});

await test("--json takes an optional filename", () => {
  assert.equal(parseArgs(["--json"]).json, true);
  assert.equal(parseArgs(["--json", "out.json"]).json, "out.json");
  assert.equal(parseArgs(["--json", "--verbose"]).json, true);
});

await test("toCsv escapes commas and quotes", () => {
  const csv = toCsv([
    {
      price: { total: 2410, perTraveler: 1205, currency: "USD" },
      airlines: ['AIR "FRANCE"', "KLM"],
      query: { departureDate: "2026-11-12", returnDate: "2026-11-19" },
      itineraries: [{ departsAt: "2026-11-12T18:25:00", segments: [{ flightNumber: "AF007" }] }],
      stops: 1,
      totalDurationMinutes: 860,
      cabin: { fullyRequested: false },
      checkedBags: 1,
      bookableSeats: 2,
    },
  ]);
  const lines = csv.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes('"AIR ""FRANCE"" / KLM"'));
  assert.ok(lines[1].includes("18:25"));
  assert.ok(lines[1].includes("false"));
});

await test("demo mode runs the whole pipeline and exits clean", async () => {
  const jsonPath = join(scratch, "demo.json");
  const [code, output] = await quiet(() =>
    main(["--demo", "new york", "london", "-d", "+30", "-n", "7", "--flex", "1", "--json", jsonPath]),
  );
  assert.equal(code, 0);
  assert.ok(/Best business fares/.test(output), "the human-readable report should still print");
  assert.ok(/every fare above is invented/.test(output), "demo output must be labelled as invented");
  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  assert.equal(report.search.origin.code, "NYC");
  assert.equal(report.search.destination.code, "LON");
  assert.equal(report.search.cabin, "BUSINESS");
  assert.equal(report.search.demo, true);
  assert.ok(report.offers.length > 0);
  assert.ok(report.datePrices.length === 3);
  assert.equal(report.errors.length, 0);
  // The raw Amadeus payload must not bloat the exported report.
  assert.equal(report.offers[0].raw, undefined);
  assert.ok(report.summary.cheapest <= report.summary.median);
});

await test("demo mode respects --nonstop and --strict", async () => {
  const jsonPath = join(scratch, "demo-strict.json");
  const [code] = await quiet(() =>
    main([
      "--demo", "JFK", "NRT", "-d", "+60", "-n", "10",
      "--flex", "2", "--nonstop", "--strict", "--json", jsonPath,
    ]),
  );
  assert.equal(code, 0);
  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  assert.ok(report.offers.length > 0);
  for (const offer of report.offers) {
    assert.equal(offer.stops, 0, "--nonstop must exclude connections");
    assert.equal(offer.cabin.fullyRequested, true, "--strict must exclude mixed cabins");
  }
});

await test("missing arguments are rejected before any network call", async () => {
  const rejects = (argv, matcher = UsageError) => quiet(() => assert.rejects(() => main(argv), matcher));
  await rejects(["--demo", "london"]);
  await rejects(["--demo", "london", "tokyo"]);
  await rejects(
    ["--demo", "london", "tokyo", "-d", "2026-11-12", "-r", "2026-11-05"],
    (error) => error instanceof UsageError && /after the departure/.test(error.message),
  );
  await rejects(["--demo", "london", "tokyo", "-d", "+10", "--adults", "20"]);
  await rejects(["--demo", "london", "tokyo", "-d", "+10", "--env", "staging"]);
});

await test("--help exits 0 and prints usage", async () => {
  const [code, output] = await quiet(() => main(["--help"]));
  assert.equal(code, 0);
  assert.ok(output.includes("--flex"));
  assert.ok(output.includes("--demo"));
});

await test("demo generator produces coherent, well-formed offers", () => {
  const body = demoFlightOffers({
    originLocationCode: "NYC",
    destinationLocationCode: "LON",
    departureDate: "2099-06-10",
    returnDate: "2099-06-17",
    travelClass: "BUSINESS",
    currencyCode: "USD",
    adults: 2,
  });
  assert.ok(body.data.length > 0);
  for (const offer of body.data) {
    assert.equal(offer.itineraries.length, 2);
    const ids = offer.itineraries.flatMap((it) => it.segments.map((s) => s.id));
    assert.equal(new Set(ids).size, ids.length, "segment ids must be unique across itineraries");
    assert.equal(offer.travelerPricings.length, 2);
    assert.equal(offer.travelerPricings[0].fareDetailsBySegment.length, ids.length);
    for (const itinerary of offer.itineraries) {
      for (const segment of itinerary.segments) {
        assert.ok(Date.parse(segment.arrival.at) > Date.parse(segment.departure.at), "segments must land after takeoff");
        // No connection may sit inside the origin or destination metro area.
        assert.ok(!["JFK", "EWR", "LGA", "LHR", "LGW"].includes(segment.departure.iataCode) || segment.departure.iataCode === "NYC");
      }
    }
  }
  // Prices come back cheapest-first.
  const totals = body.data.map((offer) => Number(offer.price.grandTotal));
  assert.deepEqual(totals, [...totals].sort((a, b) => a - b));
});

await test("DemoClient satisfies the client interface sweep uses", async () => {
  const client = new DemoClient();
  const { offers } = await sweep({
    client,
    origin: "LON",
    destination: "DXB",
    plan: buildDatePlan({ departureDate: "2099-06-10", flex: 1 }),
    cabin: "BUSINESS",
  });
  assert.ok(offers.length > 0);
  assert.equal(client.calls, 3);
});

// ----------------------------------------------------------------- teardown

mock.server.close();
rmSync(scratch, { recursive: true, force: true });

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const { name, error } of failures) {
    process.stdout.write(`\n--- ${name}\n${error.stack}\n`);
  }
  process.exitCode = 1;
}
