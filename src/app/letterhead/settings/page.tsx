import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { getLetterhead } from "@/lib/letterhead";
import LogoField from "./LogoField";

const FIELDS = [
  "logoDataUrl",
  "firmName",
  "footerAddress",
  "phone",
  "fax",
  "email",
  "accentColor",
  "signName",
  "closing",
] as const;

async function saveLetterhead(formData: FormData) {
  "use server";
  await requireUser();
  const data = Object.fromEntries(
    FIELDS.map((f) => [f, String(formData.get(f) ?? "").trim()]),
  ) as Record<(typeof FIELDS)[number], string>;

  await db.letterheadSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  redirect("/letterhead");
}

export default async function LetterheadSettingsPage() {
  await requireUser();
  const l = await getLetterhead();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Letterhead settings</h1>
        <Link className="btn-ghost" href="/letterhead">
          Back to letters
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        The logo appears at the top of every letter and the address bar at the bottom. Stored
        locally in your database.
      </p>

      <form action={saveLetterhead} className="card space-y-5 p-6">
        <LogoField initial={l.logoDataUrl} />

        <div>
          <label className="label">Firm name</label>
          <input className="input" name="firmName" defaultValue={l.firmName} />
          <p className="mt-1 text-xs text-slate-500">
            Shown as text only if no logo is set; also used for the browser tab title.
          </p>
        </div>

        <hr className="border-slate-200" />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Footer bar
        </p>
        <div>
          <label className="label">Address line</label>
          <input
            className="input"
            name="footerAddress"
            defaultValue={l.footerAddress}
            placeholder="315 FIFTH STREET, WEST PALM BEACH, FLORIDA 33401"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Phone</label>
            <input className="input" name="phone" defaultValue={l.phone} />
          </div>
          <div>
            <label className="label">Fax</label>
            <input className="input" name="fax" defaultValue={l.fax} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" name="email" defaultValue={l.email} />
          </div>
        </div>
        <div>
          <label className="label">Accent color (PHONE / FAX labels)</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              name="accentColor"
              defaultValue={l.accentColor}
              className="h-9 w-12 cursor-pointer rounded border border-slate-300"
            />
            <span className="text-xs text-slate-500">{l.accentColor}</span>
          </div>
        </div>

        <hr className="border-slate-200" />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Signature block
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Default closing</label>
            <input className="input" name="closing" defaultValue={l.closing} />
          </div>
          <div>
            <label className="label">Signature name</label>
            <input
              className="input"
              name="signName"
              defaultValue={l.signName}
              placeholder="Daniel L. Martin, Esq."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-primary" type="submit">
            Save letterhead
          </button>
        </div>
      </form>
    </div>
  );
}
