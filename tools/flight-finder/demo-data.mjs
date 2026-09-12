// Offline demo generator. Produces responses shaped exactly like the Amadeus
// Flight Offers payload, so `--demo` exercises the real parsing, ranking and
// rendering path without credentials or network access.
//
// Prices are invented. Never present demo output as a real fare.

const AIRLINES = [
  { code: "BA", name: "BRITISH AIRWAYS", hub: "LHR", aircraft: "789" },
  { code: "AF", name: "AIR FRANCE", hub: "CDG", aircraft: "77W" },
  { code: "KL", name: "KLM", hub: "AMS", aircraft: "789" },
  { code: "LH", name: "LUFTHANSA", hub: "FRA", aircraft: "74H" },
  { code: "QR", name: "QATAR AIRWAYS", hub: "DOH", aircraft: "35K" },
  { code: "EK", name: "EMIRATES", hub: "DXB", aircraft: "388" },
  { code: "TK", name: "TURKISH AIRLINES", hub: "IST", aircraft: "333" },
  { code: "DL", name: "DELTA AIR LINES", hub: "ATL", aircraft: "339" },
  { code: "UA", name: "UNITED AIRLINES", hub: "EWR", aircraft: "788" },
  { code: "SQ", name: "SINGAPORE AIRLINES", hub: "SIN", aircraft: "35K" },
];

/** Deterministic PRNG so the same query always renders the same demo trip. */
function seeded(text) {
  let hash = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, "0");

function addMinutes(isoDate, startMinutes, addedMinutes) {
  const base = Date.parse(`${isoDate}T00:00:00Z`) + (startMinutes + addedMinutes) * 60_000;
  const date = new Date(base);
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00`
  );
}

const isoDuration = (minutes) => `PT${Math.floor(minutes / 60)}H${minutes % 60}M`;

/** Airports that belong to a metro code, so a connection never lands in the city it left. */
const METRO_MEMBERS = {
  NYC: ["JFK", "EWR", "LGA", "NYC"],
  LON: ["LHR", "LGW", "STN", "LCY", "LTN", "LON"],
  PAR: ["CDG", "ORY", "PAR"],
  TYO: ["NRT", "HND", "TYO"],
  CHI: ["ORD", "MDW", "CHI"],
  WAS: ["IAD", "DCA", "BWI", "WAS"],
  MIL: ["MXP", "LIN", "BGY", "MIL"],
  ROM: ["FCO", "CIA", "ROM"],
  MOW: ["SVO", "DME", "VKO", "MOW"],
  SAO: ["GRU", "CGH", "SAO"],
  BUE: ["EZE", "AEP", "BUE"],
  YTO: ["YYZ", "YTZ", "YTO"],
  SEL: ["ICN", "GMP", "SEL"],
  BJS: ["PEK", "PKX", "BJS"],
  SHA: ["PVG", "SHA"],
  OSA: ["KIX", "ITM", "OSA"],
  JKT: ["CGK", "HLP", "JKT"],
  RIO: ["GIG", "SDU", "RIO"],
};

function metroMembers(code) {
  return METRO_MEMBERS[code] || [code];
}

function buildItinerary({ from, to, date, airline, stops, rand, idStart, avoid = new Set() }) {
  const departMinutes = 6 * 60 + Math.floor(rand() * 15) * 60;
  const segments = [];
  let cursor = 0;
  let segmentId = idStart;

  if (stops === 0) {
    const legMinutes = 260 + Math.floor(rand() * 480);
    segments.push({
      departure: { iataCode: from, at: addMinutes(date, departMinutes, 0) },
      arrival: { iataCode: to, at: addMinutes(date, departMinutes, legMinutes) },
      carrierCode: airline.code,
      number: String(100 + Math.floor(rand() * 800)),
      aircraft: { code: airline.aircraft },
      operating: { carrierCode: airline.code },
      duration: isoDuration(legMinutes),
      id: String(segmentId),
      numberOfStops: 0,
    });
    cursor = legMinutes;
  } else {
    const via = avoid.has(airline.hub) ? "IST" : airline.hub;
    const first = 180 + Math.floor(rand() * 300);
    const layover = 75 + Math.floor(rand() * 180);
    const second = 200 + Math.floor(rand() * 420);
    segments.push({
      departure: { iataCode: from, at: addMinutes(date, departMinutes, 0) },
      arrival: { iataCode: via, at: addMinutes(date, departMinutes, first) },
      carrierCode: airline.code,
      number: String(100 + Math.floor(rand() * 800)),
      aircraft: { code: airline.aircraft },
      operating: { carrierCode: airline.code },
      duration: isoDuration(first),
      id: String(segmentId),
      numberOfStops: 0,
    });
    segmentId += 1;
    segments.push({
      departure: { iataCode: via, at: addMinutes(date, departMinutes, first + layover) },
      arrival: { iataCode: to, at: addMinutes(date, departMinutes, first + layover + second) },
      carrierCode: airline.code,
      number: String(100 + Math.floor(rand() * 800)),
      aircraft: { code: airline.aircraft },
      operating: { carrierCode: airline.code },
      duration: isoDuration(second),
      id: String(segmentId),
      numberOfStops: 0,
    });
    cursor = first + layover + second;
  }

  return { itinerary: { duration: isoDuration(cursor), segments }, nextId: segmentId + 1 };
}

/**
 * Mimics AmadeusClient.searchFlightOffers for offline use.
 * @returns {{data: object[], dictionaries: object, meta: object}}
 */
export function demoFlightOffers(params) {
  const {
    originLocationCode: from,
    destinationLocationCode: to,
    departureDate,
    returnDate,
    adults = 1,
    travelClass = "BUSINESS",
    currencyCode = "USD",
    nonStop = false,
    max = 20,
  } = params;

  const rand = seeded(`${from}|${to}|${departureDate}|${returnDate || ""}|${travelClass}`);
  // Exclude carriers whose hub sits inside either metro area, so the demo never
  // invents a connection like NYC -> EWR.
  const endpoints = new Set([...metroMembers(from), ...metroMembers(to)]);
  const pool = AIRLINES.filter((airline) => !endpoints.has(airline.hub));
  const cabinBase = { ECONOMY: 520, PREMIUM_ECONOMY: 1150, BUSINESS: 2400, FIRST: 5200 }[travelClass] ?? 2400;

  // A mid-week departure is cheaper than a weekend one, which is what makes a
  // flexible-date sweep worth running at all.
  const weekday = new Date(`${departureDate}T00:00:00Z`).getUTCDay();
  const weekdayFactor = [1.04, 0.9, 0.88, 0.92, 1.0, 1.12, 1.08][weekday];

  const count = Math.min(max, 5 + Math.floor(rand() * 4));
  const data = [];
  const carriers = {};

  for (let index = 0; index < count; index += 1) {
    const airline = pool[Math.floor(rand() * pool.length)] || AIRLINES[0];
    carriers[airline.code] = airline.name;
    const stops = nonStop ? 0 : rand() < 0.4 ? 0 : 1;

    let nextId = 1;
    const itineraries = [];
    const out = buildItinerary({ from, to, date: departureDate, airline, stops, rand, idStart: nextId, avoid: endpoints });
    itineraries.push(out.itinerary);
    nextId = out.nextId;
    if (returnDate) {
      const back = buildItinerary({ from: to, to: from, date: returnDate, airline, stops, rand, idStart: nextId, avoid: endpoints });
      itineraries.push(back.itinerary);
      nextId = back.nextId;
    }

    const tripFactor = returnDate ? 1.85 : 1;
    const spread = 0.78 + rand() * 0.75;
    const nonstopPremium = stops === 0 ? 1.18 : 1;
    const perTraveler = Math.round(cabinBase * weekdayFactor * tripFactor * spread * nonstopPremium);
    const total = perTraveler * adults;

    // Roughly one offer in five downgrades a feeder leg, mirroring how Amadeus
    // really answers a BUSINESS request.
    const mixed = travelClass === "BUSINESS" && stops === 1 && rand() < 0.25;
    const segmentIds = itineraries.flatMap((itinerary) => itinerary.segments.map((segment) => segment.id));

    data.push({
      type: "flight-offer",
      id: String(index + 1),
      source: "GDS",
      oneWay: !returnDate,
      numberOfBookableSeats: 1 + Math.floor(rand() * 9),
      lastTicketingDate: departureDate,
      itineraries,
      price: {
        currency: currencyCode,
        total: total.toFixed(2),
        base: (total * 0.72).toFixed(2),
        grandTotal: total.toFixed(2),
      },
      pricingOptions: { fareType: ["PUBLISHED"], includedCheckedBagsOnly: true },
      validatingAirlineCodes: [airline.code],
      travelerPricings: Array.from({ length: adults }, (_, travelerIndex) => ({
        travelerId: String(travelerIndex + 1),
        fareOption: "STANDARD",
        travelerType: "ADULT",
        price: { currency: currencyCode, total: perTraveler.toFixed(2) },
        fareDetailsBySegment: segmentIds.map((segmentId, position) => ({
          segmentId,
          cabin: mixed && position === 0 ? "ECONOMY" : travelClass,
          fareBasis: `${travelClass.slice(0, 1)}FLEX`,
          class: travelClass === "BUSINESS" ? "J" : "Y",
          includedCheckedBags: { quantity: travelClass === "ECONOMY" ? 1 : 2 },
        })),
      })),
    });
  }

  data.sort((a, b) => Number(a.price.grandTotal) - Number(b.price.grandTotal));
  return { meta: { count: data.length }, data, dictionaries: { carriers } };
}

/** Stands in for AmadeusClient when `--demo` is set. */
export class DemoClient {
  constructor() {
    this.calls = 0;
    this.env = "demo";
  }

  async searchFlightOffers(params) {
    this.calls += 1;
    return demoFlightOffers(params);
  }

  async searchLocations(keyword) {
    return {
      data: [
        {
          type: "location",
          subType: "CITY",
          name: keyword.toUpperCase(),
          iataCode: keyword.slice(0, 3).toUpperCase(),
          address: { cityName: keyword.toUpperCase(), countryCode: "XX" },
        },
      ],
    };
  }
}
