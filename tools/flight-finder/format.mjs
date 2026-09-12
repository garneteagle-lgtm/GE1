// Terminal rendering for search results.

const ESC = String.fromCharCode(27);
const useColor =
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const wrap = (open, close) => (text) =>
  useColor ? `${ESC}[${open}m${text}${ESC}[${close}m` : String(text);

export const style = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
};

const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

/** Visible width, ignoring ANSI escapes. */
const width = (text) => String(text).replace(ANSI_PATTERN, "").length;
const pad = (text, size) => String(text) + " ".repeat(Math.max(0, size - width(text)));
const padStart = (text, size) => " ".repeat(Math.max(0, size - width(text))) + String(text);

export function formatMoney(amount, currency) {
  if (!Number.isFinite(amount)) return "-";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "2026-11-01T18:25:00" -> "18:25" */
function clock(isoLocal) {
  if (typeof isoLocal !== "string") return "--:--";
  const match = /T(\d{2}:\d{2})/.exec(isoLocal);
  return match ? match[1] : "--:--";
}

function dayLabel(isoLocal) {
  if (typeof isoLocal !== "string") return "";
  const date = new Date(isoLocal.length <= 10 ? `${isoLocal}T00:00:00Z` : `${isoLocal}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Marks an arrival that lands on a later calendar day than it departed. */
function dayShift(departsAt, arrivesAt) {
  if (typeof departsAt !== "string" || typeof arrivesAt !== "string") return "";
  const diff = Math.round(
    (Date.parse(`${arrivesAt.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${departsAt.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
  if (!Number.isFinite(diff) || diff === 0) return "";
  return style.yellow(diff > 0 ? `+${diff}` : String(diff));
}

export function table(headers, rows, { align = [] } = {}) {
  const sizes = headers.map((header, index) =>
    Math.max(width(header), ...rows.map((row) => width(row[index] ?? ""))),
  );
  const line = (cells) =>
    cells
      .map((cell, index) =>
        align[index] === "right" ? padStart(cell ?? "", sizes[index]) : pad(cell ?? "", sizes[index]),
      )
      .join("  ")
      .trimEnd();
  const rule = sizes.map((size) => "-".repeat(size)).join("  ");
  const out = [style.dim(line(headers)), style.dim(rule)];
  for (const row of rows) out.push(line(row));
  return out.join("\n");
}

const CABIN_LABEL = {
  ECONOMY: "economy",
  PREMIUM_ECONOMY: "premium economy",
  BUSINESS: "business",
  FIRST: "first",
};

export function cabinLabel(cabin) {
  return CABIN_LABEL[cabin] || String(cabin || "").toLowerCase();
}

/** Kayak and Google Flights both take a deterministic URL; Amadeus Self-Service cannot book. */
export function bookingLinks({ origin, destination, departureDate, returnDate, cabin, adults = 1 }) {
  const kayakCabin =
    { BUSINESS: "business", FIRST: "first", PREMIUM_ECONOMY: "premium", ECONOMY: "economy" }[cabin] ||
    "business";
  const dates = returnDate ? `${departureDate}/${returnDate}` : departureDate;
  const kayak =
    `https://www.kayak.com/flights/${origin}-${destination}/${dates}/${kayakCabin}` +
    (adults > 1 ? `/${adults}adults` : "");
  const googleQuery = [
    `Flights from ${origin} to ${destination}`,
    `on ${departureDate}`,
    returnDate ? `through ${returnDate}` : "one way",
    `${cabinLabel(cabin)} class`,
    adults > 1 ? `${adults} adults` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const google = `https://www.google.com/travel/flights?q=${encodeURIComponent(googleQuery)}`;
  return { kayak, google };
}

/** One offer, rendered as a block with a line per flight segment. */
export function renderOffer(offer, rank, { adults = 1, cheapest } = {}) {
  const { currency } = offer.price;
  const lines = [];
  const price = style.bold(style.green(formatMoney(offer.price.total, currency)));
  const per = adults > 1 ? style.dim(` (${formatMoney(offer.price.perTraveler, currency)} each)`) : "";
  const delta =
    Number.isFinite(cheapest) && offer.price.total > cheapest
      ? style.dim(` +${formatMoney(offer.price.total - cheapest, currency)}`)
      : "";

  const badges = [];
  if (!offer.cabin.fullyRequested) {
    badges.push(
      style.yellow(
        `mixed cabin: ${offer.cabin.atOrAboveRequested}/${offer.cabin.segments} legs in ${cabinLabel(offer.cabin.requested)}`,
      ),
    );
  }
  if (offer.stops === 0) badges.push(style.cyan("nonstop"));
  if (Number.isFinite(offer.bookableSeats) && offer.bookableSeats <= 3) {
    badges.push(style.red(`${offer.bookableSeats} seat${offer.bookableSeats === 1 ? "" : "s"} left`));
  }

  lines.push(
    `${style.bold(`${String(rank).padStart(2)}.`)} ${price}${per}${delta}  ${style.dim("|")} ` +
      offer.airlines.join(", ") +
      (badges.length ? `  ${badges.join(style.dim(" | "))}` : ""),
  );

  offer.itineraries.forEach((itinerary, index) => {
    const direction = offer.itineraries.length > 1 ? (index === 0 ? "out " : "back") : "trip";
    const stops =
      itinerary.stops === 0 ? "nonstop" : `${itinerary.stops} stop${itinerary.stops > 1 ? "s" : ""}`;
    lines.push(
      `    ${style.dim(direction)} ${style.bold(dayLabel(itinerary.departsAt))}  ` +
        `${itinerary.from} ${clock(itinerary.departsAt)} -> ${itinerary.to} ${clock(itinerary.arrivesAt)}${dayShift(itinerary.departsAt, itinerary.arrivesAt)}  ` +
        style.dim(`${formatDuration(itinerary.durationMinutes)}, ${stops}`),
    );
    for (const segment of itinerary.segments) {
      const cabin =
        segment.cabin === offer.cabin.requested
          ? style.dim(cabinLabel(segment.cabin))
          : style.yellow(cabinLabel(segment.cabin));
      const operated =
        segment.operatingCarrier && segment.operatingCarrier !== segment.carrier
          ? style.dim(` op. by ${segment.operatingCarrier}`)
          : "";
      lines.push(
        style.dim(
          `      ${segment.flightNumber.padEnd(7)} ${segment.from}-${segment.to} ` +
            `${clock(segment.departsAt)}-${clock(segment.arrivesAt)} ${formatDuration(segment.durationMinutes)} `,
        ) +
          cabin +
          operated,
      );
    }
  });

  const extras = [];
  if (offer.checkedBags !== null) {
    extras.push(
      offer.checkedBags > 0
        ? `${offer.checkedBags} checked bag${offer.checkedBags > 1 ? "s" : ""}`
        : "no checked bag",
    );
  }
  if (offer.lastTicketingDate) extras.push(`book by ${offer.lastTicketingDate}`);
  if (extras.length) lines.push(style.dim(`    ${extras.join(" | ")}`));

  return lines.join("\n");
}

/** Price-by-departure-date strip, so a better date jumps out. */
export function renderDateStrip(priced, currency) {
  const withPrices = priced.filter((slot) => Number.isFinite(slot.cheapest));
  if (withPrices.length <= 1) return "";
  const best = Math.min(...withPrices.map((slot) => slot.cheapest));
  const rows = priced.map((slot) => {
    const label =
      dayLabel(slot.departureDate) + (slot.returnDate ? style.dim(` -> ${dayLabel(slot.returnDate)}`) : "");
    if (!Number.isFinite(slot.cheapest)) {
      return [label, style.dim(slot.failed ? "search failed" : "nothing found"), ""];
    }
    const value = formatMoney(slot.cheapest, slot.currency || currency);
    const isBest = slot.cheapest === best;
    const diff = isBest
      ? style.green("cheapest")
      : style.dim(`+${formatMoney(slot.cheapest - best, slot.currency || currency)}`);
    return [label, isBest ? style.bold(style.green(value)) : value, diff];
  });
  return table(["date", "from", ""], rows, { align: ["left", "right", "left"] });
}
