// Presentation helpers for stored Florida entities.

import type { ParsedOfficer } from "./sunbiz-layout";

/**
 * Link to the LIVE record for this entity on sunbiz.org, by document number.
 * Opening this in a browser passes Cloudflare (unlike server scraping), letting
 * the user confirm the current agent/address against the authoritative source
 * before relying on the locally-stored copy.
 */
export function sunbizLiveUrl(documentNumber: string): string {
  const params = new URLSearchParams({
    inquiryType: "DocumentNumber",
    searchTerm: documentNumber,
  });
  return `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?${params}`;
}

// Officer/director title codes used in the corporate data file. Single-letter
// corporate codes can combine (e.g. "PD" = President + Director); LLC roles use
// multi-letter codes. Unknown codes are shown verbatim so nothing is guessed.
const OFFICER_TITLE_LETTERS: Record<string, string> = {
  P: "President",
  V: "Vice President",
  S: "Secretary",
  T: "Treasurer",
  C: "Chairman",
  D: "Director",
};
const OFFICER_TITLE_CODES: Record<string, string> = {
  MGR: "Manager",
  MGRM: "Managing Member",
  AMBR: "Authorized Member",
  MBR: "Member",
  AP: "Authorized Person",
  TRUS: "Trustee",
  PRES: "President",
};

export function decodeOfficerTitle(code?: string | null): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (!c) return null;
  if (OFFICER_TITLE_CODES[c]) return OFFICER_TITLE_CODES[c];
  // Try letter-by-letter for combined corporate titles.
  const letters = c.split("");
  if (letters.every((l) => OFFICER_TITLE_LETTERS[l])) {
    return letters.map((l) => OFFICER_TITLE_LETTERS[l]).join(", ");
  }
  return c; // show the raw code rather than mislabel it
}

/** Safely parse the stored officers JSON. Returns [] on null/garbage. */
export function parseOfficersJson(json?: string | null): ParsedOfficer[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ParsedOfficer[]) : [];
  } catch {
    return [];
  }
}

type AddressParts = {
  addr1?: string | null;
  addr2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
};

/** Join address parts into display lines, dropping anything blank. */
export function addressLines(p: AddressParts): string[] {
  const lines: string[] = [];
  if (p.addr1) lines.push(p.addr1);
  if (p.addr2) lines.push(p.addr2);
  const cityLine = [p.city, [p.state, p.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  if (cityLine) lines.push(cityLine);
  if (p.country && p.country.toUpperCase() !== "US") lines.push(p.country);
  return lines;
}

export function addressOneLine(p: AddressParts): string {
  return addressLines(p).join(", ");
}

type ServiceEntity = {
  legalName: string;
  documentNumber: string;
  status?: string | null;
  raName?: string | null;
  raType?: string | null;
  raAddr1?: string | null;
  raCity?: string | null;
  raState?: string | null;
  raZip?: string | null;
};

/**
 * A plain-text block ready to paste into a summons or subpoena: the entity's
 * exact legal name and the registered agent to be served, with address.
 */
export function serviceBlock(e: ServiceEntity): string {
  const ra = addressLines({
    addr1: e.raAddr1,
    city: e.raCity,
    state: e.raState,
    zip: e.raZip,
  });
  const lines = [
    e.legalName,
    `FL Document #: ${e.documentNumber}`,
    e.status ? `Status: ${e.status}` : null,
    "",
    "By service on its Registered Agent:",
    e.raName
      ? `  ${e.raName}${e.raType ? ` (${e.raType})` : ""}`
      : "  (no registered agent on file)",
    ...ra.map((l) => `  ${l}`),
  ].filter((l) => l !== null);
  return lines.join("\n");
}
