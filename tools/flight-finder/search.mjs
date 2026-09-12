// Search orchestration: expand a flexible date window into concrete queries,
// fan them out at the client's throttle, then normalize, filter and rank.

export const CABINS = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"];
const CABIN_RANK = new Map(CABINS.map((cabin, index) => [cabin, index]));

/** "PT12H45M" -> 765 */
export function parseIsoDuration(value) {
  if (typeof value !== "string") return null;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(value);
  if (!match) return null;
  const [, days, hours, minutes] = match;
  return (Number(days || 0) * 24 + Number(hours || 0)) * 60 + Number(minutes || 0);
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Every (departureDate, returnDate) pair the sweep should price.
 *
 * `flex` shifts the departure date either side of the requested one. For a
 * round trip the return moves with it, so the trip keeps its length — that is
 * 2*flex+1 calls rather than the (2*flex+1)^2 a full grid would cost. Passing
 * `nights` prices additional trip lengths on top.
 */
export function buildDatePlan({ departureDate, returnDate, flex = 0, nights = [] }) {
  const baseNights = returnDate ? daysBetween(departureDate, returnDate) : null;
  const lengths = returnDate
    ? [...new Set([baseNights, ...nights])].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
    : [null];

  const minDate = todayIso();
  const plan = [];
  const seen = new Set();
  for (let offset = -flex; offset <= flex; offset += 1) {
    const depart = addDays(departureDate, offset);
    if (depart < minDate) continue; // Amadeus rejects dates in the past.
    for (const length of lengths) {
      const back = length === null ? undefined : addDays(depart, length);
      const key = `${depart}|${back ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plan.push({ departureDate: depart, returnDate: back, offset, nights: length ?? undefined });
    }
  }
  // Price the dates the user actually asked about first, so a truncated sweep
  // still answers the original question.
  plan.sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));
  return plan;
}

/** Flattens one Amadeus offer into something printable and comparable. */
export function normalizeOffer(offer, { dictionaries = {}, adults = 1, requestedCabin, query }) {
  const carriers = dictionaries.carriers || {};
  const cabinBySegment = new Map();
  const bagsBySegment = new Map();
  for (const traveler of offer.travelerPricings || []) {
    for (const fare of traveler.fareDetailsBySegment || []) {
      if (!cabinBySegment.has(fare.segmentId)) cabinBySegment.set(fare.segmentId, fare.cabin);
      if (!bagsBySegment.has(fare.segmentId)) {
        bagsBySegment.set(fare.segmentId, fare.includedCheckedBags?.quantity ?? null);
      }
    }
  }

  let cabinSegments = 0;
  let atOrAboveRequested = 0;
  const wanted = CABIN_RANK.get(requestedCabin) ?? 0;

  const itineraries = (offer.itineraries || []).map((itinerary) => {
    const segments = (itinerary.segments || []).map((segment) => {
      const cabin = cabinBySegment.get(segment.id) || null;
      cabinSegments += 1;
      if (cabin && (CABIN_RANK.get(cabin) ?? -1) >= wanted) atOrAboveRequested += 1;
      return {
        from: segment.departure?.iataCode,
        to: segment.arrival?.iataCode,
        departsAt: segment.departure?.at,
        arrivesAt: segment.arrival?.at,
        carrier: segment.carrierCode,
        carrierName: carriers[segment.carrierCode] || segment.carrierCode,
        operatingCarrier: segment.operating?.carrierCode || segment.carrierCode,
        flightNumber: `${segment.carrierCode}${segment.number}`,
        aircraft: segment.aircraft?.code,
        durationMinutes: parseIsoDuration(segment.duration),
        cabin,
        checkedBags: bagsBySegment.get(segment.id) ?? null,
      };
    });
    return {
      durationMinutes: parseIsoDuration(itinerary.duration),
      stops: Math.max(0, segments.length - 1),
      segments,
      from: segments[0]?.from,
      to: segments[segments.length - 1]?.to,
      departsAt: segments[0]?.departsAt,
      arrivesAt: segments[segments.length - 1]?.arrivesAt,
    };
  });

  const total = Number(offer.price?.grandTotal ?? offer.price?.total ?? NaN);
  const airlines = [...new Set(itineraries.flatMap((it) => it.segments.map((s) => s.carrierName)))];

  return {
    id: offer.id,
    price: {
      total,
      perTraveler: Number.isFinite(total) ? total / Math.max(1, adults) : NaN,
      currency: offer.price?.currency || "EUR",
    },
    itineraries,
    airlines,
    validatingAirlines: offer.validatingAirlineCodes || [],
    stops: Math.max(...itineraries.map((it) => it.stops), 0),
    totalDurationMinutes: itineraries.reduce((sum, it) => sum + (it.durationMinutes || 0), 0),
    // Amadeus happily returns mixed-cabin itineraries for a BUSINESS request —
    // one long-haul business leg plus an economy feeder. Track it so a cheap
    // price that is only half business cannot masquerade as a bargain.
    cabin: {
      requested: requestedCabin,
      segments: cabinSegments,
      atOrAboveRequested,
      fullyRequested: cabinSegments > 0 && atOrAboveRequested === cabinSegments,
      list: [...new Set(itineraries.flatMap((it) => it.segments.map((s) => s.cabin)).filter(Boolean))],
    },
    // Worst leg wins: one segment with no free bag is the bag allowance.
    checkedBags: (() => {
      const perSegment = itineraries.flatMap((it) => it.segments.map((s) => s.checkedBags));
      if (perSegment.length === 0 || perSegment.some((qty) => qty === null)) return null;
      return Math.min(...perSegment);
    })(),
    bookableSeats: offer.numberOfBookableSeats ?? null,
    lastTicketingDate: offer.lastTicketingDate ?? null,
    instantTicketing: offer.instantTicketingRequired ?? false,
    query,
    raw: offer,
  };
}

function offerKey(offer) {
  const legs = offer.itineraries
    .map((it) => it.segments.map((s) => `${s.flightNumber}@${s.departsAt}`).join(">"))
    .join("|");
  return `${legs}#${offer.price.total}#${offer.price.currency}`;
}

/**
 * Runs the sweep.
 * @returns {Promise<{offers: object[], errors: object[], priced: object[]}>}
 */
export async function sweep({
  client,
  origin,
  destination,
  plan,
  adults = 1,
  cabin = "BUSINESS",
  nonStop = false,
  currency,
  maxPrice,
  includedAirlineCodes,
  excludedAirlineCodes,
  perQueryLimit = 20,
  onProgress = () => {},
}) {
  const offers = [];
  const errors = [];
  const priced = [];
  const seen = new Set();

  const tasks = plan.map((slot, index) => async () => {
    try {
      const body = await client.searchFlightOffers({
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate: slot.departureDate,
        returnDate: slot.returnDate,
        adults,
        travelClass: cabin,
        nonStop: nonStop || undefined,
        currencyCode: currency,
        maxPrice: maxPrice ? Math.floor(maxPrice) : undefined,
        includedAirlineCodes,
        excludedAirlineCodes,
        max: perQueryLimit,
      });
      const dictionaries = body.dictionaries || {};
      const normalized = (body.data || []).map((offer) =>
        normalizeOffer(offer, { dictionaries, adults, requestedCabin: cabin, query: slot }),
      );
      for (const offer of normalized) {
        const key = offerKey(offer);
        if (seen.has(key)) continue;
        seen.add(key);
        offers.push(offer);
      }
      const cheapest = normalized.reduce(
        (best, offer) => (!best || offer.price.total < best.price.total ? offer : best),
        null,
      );
      priced.push({
        ...slot,
        count: normalized.length,
        cheapest: cheapest ? cheapest.price.total : null,
        currency: cheapest ? cheapest.price.currency : null,
      });
      onProgress({ done: index + 1, total: plan.length, slot, count: normalized.length });
    } catch (error) {
      errors.push({ slot, error });
      priced.push({ ...slot, count: 0, cheapest: null, currency: null, failed: true });
      onProgress({ done: index + 1, total: plan.length, slot, error });
    }
  });

  // The client serializes and throttles internally, so firing them all at once
  // is safe and keeps the wall-clock down to the throttle interval.
  await Promise.all(tasks.map((task) => task()));

  offers.sort((a, b) => a.price.total - b.price.total);
  priced.sort((a, b) => (a.departureDate < b.departureDate ? -1 : a.departureDate > b.departureDate ? 1 : 0));
  return { offers, errors, priced };
}

export function filterOffers(offers, { maxStops, maxDurationMinutes, strictCabin, airlines } = {}) {
  const allow = airlines ? new Set(airlines.map((code) => code.toUpperCase())) : null;
  return offers.filter((offer) => {
    if (maxStops !== undefined && offer.stops > maxStops) return false;
    if (maxDurationMinutes !== undefined && offer.totalDurationMinutes > maxDurationMinutes) return false;
    if (strictCabin && !offer.cabin.fullyRequested) return false;
    if (allow) {
      const codes = offer.itineraries.flatMap((it) => it.segments.map((s) => s.carrier));
      if (!codes.some((code) => allow.has(code))) return false;
    }
    return true;
  });
}

/** Deal context: is the cheapest result actually cheap, or just the only one? */
export function summarize(offers) {
  if (offers.length === 0) return null;
  const totals = offers.map((offer) => offer.price.total).sort((a, b) => a - b);
  const median = totals[Math.floor(totals.length / 2)];
  const cheapest = totals[0];
  return {
    count: offers.length,
    currency: offers[0].price.currency,
    cheapest,
    median,
    highest: totals[totals.length - 1],
    savingVsMedian: median > 0 ? (median - cheapest) / median : 0,
  };
}
