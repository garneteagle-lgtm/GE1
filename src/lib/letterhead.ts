import { db } from "@/lib/db";

/** The firm's letterhead: logo, footer contact bar, and signature defaults. */
export type Letterhead = {
  /** Data-URL of an uploaded logo. Empty means fall back to LOGO_FALLBACK. */
  logoDataUrl: string;
  /** Firm name — used as a text fallback if no logo, and in the page title. */
  firmName: string;
  /** Address line shown in the footer bar (typically all-caps). */
  footerAddress: string;
  phone: string;
  fax: string;
  email: string;
  /** Accent color for the PHONE/FAX labels in the footer. */
  accentColor: string;
  /** Typed signature name, e.g. "Daniel L. Martin, Esq." */
  signName: string;
  /** Default complimentary close, e.g. "Very truly yours,". */
  closing: string;
};

/** Bundled logo used when no custom logo has been uploaded. */
export const LOGO_FALLBACK = "/letterhead-logo.png";

/**
 * Defaults, pre-filled with the firm's letterhead so letters look right out of
 * the box. Everything here is editable at /letterhead/settings.
 */
export const DEFAULT_LETTERHEAD: Letterhead = {
  logoDataUrl: "",
  firmName: "Rudolph & Associates LLC",
  footerAddress: "315 FIFTH STREET, WEST PALM BEACH, FLORIDA 33401",
  phone: "561-655-1901",
  fax: "561-655-3870",
  email: "",
  accentColor: "#2F5496",
  signName: "Daniel L. Martin, Esq.",
  closing: "Very truly yours,",
};

/**
 * Load the single letterhead-settings row. Returns DEFAULT_LETTERHEAD when
 * nothing has been saved yet, so the letter template renders correctly on first
 * run.
 */
export async function getLetterhead(): Promise<Letterhead> {
  const row = await db.letterheadSettings.findUnique({ where: { id: "singleton" } });
  if (!row) return { ...DEFAULT_LETTERHEAD };
  return {
    logoDataUrl: row.logoDataUrl,
    firmName: row.firmName,
    footerAddress: row.footerAddress,
    phone: row.phone,
    fax: row.fax,
    email: row.email,
    accentColor: row.accentColor || DEFAULT_LETTERHEAD.accentColor,
    signName: row.signName,
    closing: row.closing || DEFAULT_LETTERHEAD.closing,
  };
}

/** The logo to display: the uploaded one, or the bundled fallback. */
export function logoSrc(l: Letterhead): string {
  return l.logoDataUrl.trim() || LOGO_FALLBACK;
}
