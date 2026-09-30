// Parsing and case-matching for court filing notices that arrive by email
// (federal CM/ECF "Notice of Electronic Filing", state e-filing services, etc.).

export type ParsedFiling = {
  caseNumber: string | null;
  docNumber: string | null;
  docketText: string | null;
};

// Federal-style case numbers: "1:24-cv-01234-ABC", "24-cv-1234", "2:23-cr-00077".
const FED_RE = /(?:\d+:)?(\d{2})-([a-z]{2,4})-0*(\d+)/gi;

export function parseFiling(subject: string, body: string): ParsedFiling {
  // CM/ECF subjects look like: "Activity in Case 1:24-cv-01234-ABC Smith v. Jones Order on Motion"
  const subjCase = subject.match(/Activity in Case\s+(\S+)/i)?.[1];
  const bodyCase = body.match(/Case (?:Number|No\.?)\s*:\s*(\S+)/i)?.[1];
  const docNumber = body.match(/Document Number\s*:\s*(\d+)/i)?.[1] ?? null;

  let docketText: string | null = null;
  const dt = body.match(/Docket Text\s*:\s*([\s\S]*?)(?:\n\s*\n|Notice has been electronically|$)/i);
  if (dt?.[1]?.trim()) {
    docketText = dt[1].replace(/\s+/g, " ").trim().slice(0, 2000);
  } else if (subjCase) {
    // Fall back to the part of the CM/ECF subject after the case number.
    docketText = subject.replace(/^.*?Activity in Case\s+\S+\s*/i, "").trim() || null;
  }

  return { caseNumber: subjCase ?? bodyCase ?? null, docNumber, docketText };
}

function fedKey(yy: string, type: string, num: string) {
  return `${yy}-${type.toLowerCase()}-${Number(num)}`;
}

function compact(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Find the case whose stored case number appears in the notice. Federal numbers
// are compared ignoring division prefix, judge initials and leading zeros; other
// formats are compared on letters/digits only.
export function matchCase<T extends { caseNumber: string | null }>(
  cases: T[],
  text: string,
): T | null {
  const fedInText = new Set<string>();
  for (const m of text.matchAll(FED_RE)) fedInText.add(fedKey(m[1], m[2], m[3]));
  const compactText = compact(text);

  for (const c of cases) {
    if (!c.caseNumber) continue;
    const fed = [...c.caseNumber.matchAll(FED_RE)][0];
    if (fed) {
      if (fedInText.has(fedKey(fed[1], fed[2], fed[3]))) return c;
      continue;
    }
    const key = compact(c.caseNumber);
    if (key.length >= 6 && compactText.includes(key)) return c;
  }
  return null;
}
