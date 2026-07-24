import { db } from "@/lib/db";

/** Shape of the firm's letterhead, with every field a plain string. */
export type Letterhead = {
  firmName: string;
  attorneyName: string;
  tagline: string;
  addressLines: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  barNumber: string;
  footer: string;
  signName: string;
  signTitle: string;
};

export const EMPTY_LETTERHEAD: Letterhead = {
  firmName: "",
  attorneyName: "",
  tagline: "",
  addressLines: "",
  phone: "",
  fax: "",
  email: "",
  website: "",
  barNumber: "",
  footer: "",
  signName: "",
  signTitle: "",
};

/**
 * Load the single letterhead-settings row, filling any missing values with
 * empty strings. Returns EMPTY_LETTERHEAD when nothing has been saved yet.
 */
export async function getLetterhead(): Promise<Letterhead> {
  const row = await db.letterheadSettings.findUnique({ where: { id: "singleton" } });
  if (!row) return { ...EMPTY_LETTERHEAD };
  return {
    firmName: row.firmName,
    attorneyName: row.attorneyName,
    tagline: row.tagline,
    addressLines: row.addressLines,
    phone: row.phone,
    fax: row.fax,
    email: row.email,
    website: row.website,
    barNumber: row.barNumber,
    footer: row.footer,
    signName: row.signName,
    signTitle: row.signTitle,
  };
}

/** True when at least one letterhead field has been filled in. */
export function isLetterheadConfigured(l: Letterhead): boolean {
  return Object.values(l).some((v) => v.trim().length > 0);
}
