// Presentation helpers for stored Florida entities.

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
