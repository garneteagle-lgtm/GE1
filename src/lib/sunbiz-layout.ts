// Fixed-width record layout for Florida's "Corporate Data File" (cordata),
// the bulk download published by the FL Division of Corporations.
//
// Source of truth: https://dos.sunbiz.org/data-definitions/cor.html
// Record length: 1440 characters. Positions below are 1-based START positions
// and field LENGTHs, copied directly from that definition. The same layout
// applies to both the quarterly (full) and daily (incremental) files.
//
// If Florida ever changes the layout, this is the only place to update — the
// importer and parser are driven entirely by FIELDS below.

export const COR_RECORD_LENGTH = 1440;

type Field = { start: number; len: number };

// Only the fields needed for service-of-process lookup are mapped. Officer
// blocks (fields 37+, six of them, 128 chars each starting at position 669)
// are intentionally left out of v1.
export const FIELDS = {
  documentNumber: { start: 1, len: 12 },
  legalName: { start: 13, len: 192 },
  status: { start: 205, len: 1 }, // "A" active, "I" inactive
  filingType: { start: 206, len: 15 }, // code, decoded below

  princAddr1: { start: 221, len: 42 },
  princAddr2: { start: 263, len: 42 },
  princCity: { start: 305, len: 28 },
  princState: { start: 333, len: 2 },
  princZip: { start: 335, len: 10 },
  princCountry: { start: 345, len: 2 },

  mailAddr1: { start: 347, len: 42 },
  mailAddr2: { start: 389, len: 42 },
  mailCity: { start: 431, len: 28 },
  mailState: { start: 459, len: 2 },
  mailZip: { start: 461, len: 10 },
  mailCountry: { start: 471, len: 2 },

  fileDate: { start: 473, len: 8 }, // MMDDYYYY
  feiNumber: { start: 481, len: 14 },

  raName: { start: 545, len: 42 },
  raType: { start: 587, len: 1 }, // "P" person, "C" corporation
  raAddr1: { start: 588, len: 42 },
  raCity: { start: 630, len: 28 },
  raState: { start: 658, len: 2 },
  raZip: { start: 660, len: 9 }, // zip+4
} satisfies Record<string, Field>;

const FILING_TYPES: Record<string, string> = {
  DOMP: "Domestic Profit",
  DOMNP: "Domestic Non-Profit",
  FORP: "Foreign Profit",
  FORNP: "Foreign Non-Profit",
  DOMLP: "Domestic Limited Partnership",
  FORLP: "Foreign Limited Partnership",
  FLAL: "Florida Limited Liability Co.",
  FORL: "Foreign Limited Liability Co.",
  NPREG: "Non-Profit, Registration",
  TRUST: "Declaration of Trust",
  AGENT: "Designation of Registered Agent",
};

/** Slice one field out of a fixed-width line and trim padding whitespace. */
function field(line: string, f: Field): string {
  // start is 1-based and inclusive.
  return line.slice(f.start - 1, f.start - 1 + f.len).trim();
}

/** Turn an 8-char MMDDYYYY date into MM/DD/YYYY, or null if blank/invalid. */
function formatFileDate(raw: string): string | null {
  if (!/^\d{8}$/.test(raw)) return raw || null;
  return `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
}

export type ParsedEntity = {
  documentNumber: string;
  legalName: string;
  nameKey: string;
  status: string | null;
  filingType: string | null;
  feiNumber: string | null;
  fileDate: string | null;
  princAddr1: string | null;
  princAddr2: string | null;
  princCity: string | null;
  princState: string | null;
  princZip: string | null;
  princCountry: string | null;
  mailAddr1: string | null;
  mailAddr2: string | null;
  mailCity: string | null;
  mailState: string | null;
  mailZip: string | null;
  mailCountry: string | null;
  raName: string | null;
  raType: string | null;
  raAddr1: string | null;
  raCity: string | null;
  raState: string | null;
  raZip: string | null;
};

const nn = (s: string): string | null => (s ? s : null);

/**
 * Parse a single fixed-width cordata line into a structured record, or return
 * null if the line is blank or has no document number. Lines whose length is
 * unexpected are still parsed (slice() is forgiving) but the caller may want to
 * count them as warnings.
 */
export function parseRecord(line: string): ParsedEntity | null {
  if (!line || !line.trim()) return null;
  const documentNumber = field(line, FIELDS.documentNumber);
  if (!documentNumber) return null;

  const legalName = field(line, FIELDS.legalName);
  const statusCode = field(line, FIELDS.status).toUpperCase();
  const filingCode = field(line, FIELDS.filingType).toUpperCase();
  const raTypeCode = field(line, FIELDS.raType).toUpperCase();

  return {
    documentNumber,
    legalName,
    nameKey: legalName.toUpperCase(),
    status:
      statusCode === "A" ? "Active" : statusCode === "I" ? "Inactive" : nn(statusCode),
    filingType: FILING_TYPES[filingCode] ?? nn(filingCode),
    feiNumber: nn(field(line, FIELDS.feiNumber)),
    fileDate: formatFileDate(field(line, FIELDS.fileDate)),
    princAddr1: nn(field(line, FIELDS.princAddr1)),
    princAddr2: nn(field(line, FIELDS.princAddr2)),
    princCity: nn(field(line, FIELDS.princCity)),
    princState: nn(field(line, FIELDS.princState)),
    princZip: nn(field(line, FIELDS.princZip)),
    princCountry: nn(field(line, FIELDS.princCountry)),
    mailAddr1: nn(field(line, FIELDS.mailAddr1)),
    mailAddr2: nn(field(line, FIELDS.mailAddr2)),
    mailCity: nn(field(line, FIELDS.mailCity)),
    mailState: nn(field(line, FIELDS.mailState)),
    mailZip: nn(field(line, FIELDS.mailZip)),
    mailCountry: nn(field(line, FIELDS.mailCountry)),
    raName: nn(field(line, FIELDS.raName)),
    raType:
      raTypeCode === "P" ? "Person" : raTypeCode === "C" ? "Corporation" : nn(raTypeCode),
    raAddr1: nn(field(line, FIELDS.raAddr1)),
    raCity: nn(field(line, FIELDS.raCity)),
    raState: nn(field(line, FIELDS.raState)),
    raZip: nn(field(line, FIELDS.raZip)),
  };
}
