// Turns whatever the user typed ("new york", "LHR", "Sao Paulo") into an IATA
// code the Flight Offers endpoint accepts.
//
// Metropolitan *city* codes are preferred over single airports: searching NYC
// covers JFK + EWR + LGA in one API call, which is both cheaper on quota and
// better at finding a bargain than picking one airport up front.

/** Well-known metro areas, resolved without spending an API call. */
const CITY_CODES = {
  // North America
  "new york": "NYC", nyc: "NYC", "new york city": "NYC", manhattan: "NYC",
  "los angeles": "LAX", la: "LAX", "san francisco": "SFO", "bay area": "SFO",
  chicago: "CHI", washington: "WAS", "washington dc": "WAS", dc: "WAS",
  boston: "BOS", miami: "MIA", atlanta: "ATL", dallas: "DFW", houston: "HOU",
  seattle: "SEA", denver: "DEN", "las vegas": "LAS", vegas: "LAS",
  philadelphia: "PHL", phoenix: "PHX", orlando: "ORL", detroit: "DTT",
  toronto: "YTO", vancouver: "YVR", montreal: "YMQ", "mexico city": "MEX",
  // Europe
  london: "LON", paris: "PAR", milan: "MIL", rome: "ROM", madrid: "MAD",
  barcelona: "BCN", berlin: "BER", frankfurt: "FRA", munich: "MUC",
  amsterdam: "AMS", brussels: "BRU", zurich: "ZRH", geneva: "GVA",
  vienna: "VIE", lisbon: "LIS", dublin: "DUB", copenhagen: "CPH",
  stockholm: "STO", oslo: "OSL", helsinki: "HEL", athens: "ATH",
  istanbul: "IST", moscow: "MOW", prague: "PRG", warsaw: "WAW",
  budapest: "BUD", edinburgh: "EDI", manchester: "MAN", nice: "NCE",
  venice: "VCE", naples: "NAP", florence: "FLR", hamburg: "HAM",
  dusseldorf: "DUS", cologne: "CGN", stuttgart: "STR", porto: "OPO",
  // Middle East + Africa
  dubai: "DXB", "abu dhabi": "AUH", doha: "DOH", riyadh: "RUH",
  jeddah: "JED", "tel aviv": "TLV", cairo: "CAI", casablanca: "CAS",
  johannesburg: "JNB", "cape town": "CPT", nairobi: "NBO", lagos: "LOS",
  addis: "ADD", "addis ababa": "ADD",
  // Asia-Pacific
  tokyo: "TYO", osaka: "OSA", seoul: "SEL", beijing: "BJS", shanghai: "SHA",
  "hong kong": "HKG", taipei: "TPE", singapore: "SIN", "kuala lumpur": "KUL",
  bangkok: "BKK", jakarta: "JKT", manila: "MNL", "ho chi minh city": "SGN",
  saigon: "SGN", hanoi: "HAN", delhi: "DEL", "new delhi": "DEL",
  mumbai: "BOM", bombay: "BOM", bangalore: "BLR", bengaluru: "BLR",
  chennai: "MAA", hyderabad: "HYD", kolkata: "CCU", colombo: "CMB",
  sydney: "SYD", melbourne: "MEL", brisbane: "BNE", perth: "PER",
  auckland: "AKL", wellington: "WLG",
  // South America
  "sao paulo": "SAO", "são paulo": "SAO", "rio de janeiro": "RIO", rio: "RIO",
  "buenos aires": "BUE", santiago: "SCL", lima: "LIM", bogota: "BOG",
  "bogotá": "BOG", montevideo: "MVD", quito: "UIO", panama: "PTY",
  "panama city": "PTY",
};

/** Display names for the codes above, so output reads like a place not a code. */
const CODE_NAMES = {};
for (const [name, code] of Object.entries(CITY_CODES)) {
  const title = name.replace(/\b\w/g, (c) => c.toUpperCase());
  // First (longest, most canonical) spelling wins.
  if (!CODE_NAMES[code] || CODE_NAMES[code].length < title.length) CODE_NAMES[code] = title;
}

function normalize(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(the)\s+/, "");
}

export class PlaceResolutionError extends Error {
  constructor(query, hint) {
    super(`Could not work out which airport "${query}" means${hint ? `. ${hint}` : ""}`);
    this.name = "PlaceResolutionError";
    this.query = query;
  }
}

/**
 * @param {string} query          user input
 * @param {object} options
 * @param {import("./amadeus.mjs").AmadeusClient} [options.client]
 * @returns {Promise<{code: string, name: string, kind: "city"|"airport", source: string}>}
 */
export async function resolvePlace(query, { client } = {}) {
  const raw = query.trim();
  if (!raw) throw new PlaceResolutionError(query);

  // A bare 3-letter code is taken at face value — it is unambiguous and the
  // user clearly knows what they want.
  if (/^[A-Za-z]{3}$/.test(raw)) {
    const code = raw.toUpperCase();
    return { code, name: CODE_NAMES[code] || code, kind: "airport", source: "code" };
  }

  const key = normalize(raw);
  if (CITY_CODES[key]) {
    const code = CITY_CODES[key];
    return { code, name: CODE_NAMES[code] || code, kind: "city", source: "builtin" };
  }

  if (!client) {
    throw new PlaceResolutionError(
      query,
      "Pass the 3-letter IATA code instead (e.g. LHR), or set Amadeus credentials so names can be looked up.",
    );
  }

  const body = await client.searchLocations(raw);
  const results = Array.isArray(body.data) ? body.data : [];
  if (results.length === 0) {
    throw new PlaceResolutionError(query, "Amadeus returned no matching city or airport.");
  }
  // Prefer a metro city code; fall back to the top-ranked airport.
  const city = results.find((item) => item.subType === "CITY");
  const pick = city || results[0];
  return {
    code: pick.iataCode,
    name: pick.address?.cityName
      ? `${titleCase(pick.address.cityName)}${pick.address.countryCode ? `, ${pick.address.countryCode}` : ""}`
      : titleCase(pick.name || pick.iataCode),
    kind: pick.subType === "CITY" ? "city" : "airport",
    source: "amadeus",
    alternatives: results
      .filter((item) => item.iataCode !== pick.iataCode)
      .slice(0, 4)
      .map((item) => `${item.iataCode} (${titleCase(item.name || "")})`),
  };
}

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/\b[\p{L}]/gu, (c) => c.toUpperCase());
}

export { CITY_CODES, CODE_NAMES, normalize };
