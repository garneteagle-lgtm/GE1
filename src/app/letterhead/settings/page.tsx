import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { getLetterhead } from "@/lib/letterhead";

const FIELDS = [
  "firmName",
  "attorneyName",
  "tagline",
  "addressLines",
  "phone",
  "fax",
  "email",
  "website",
  "barNumber",
  "footer",
  "signName",
  "signTitle",
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
        This information appears at the top and bottom of every letter you generate. It is stored
        locally in your database.
      </p>

      <form action={saveLetterhead} className="card space-y-4 p-6">
        <div>
          <label className="label">Firm name</label>
          <input className="input" name="firmName" defaultValue={l.firmName} autoFocus />
        </div>
        <div>
          <label className="label">Attorney name</label>
          <input className="input" name="attorneyName" defaultValue={l.attorneyName} />
        </div>
        <div>
          <label className="label">Tagline / practice areas</label>
          <input
            className="input"
            name="tagline"
            defaultValue={l.tagline}
            placeholder="Attorney &amp; Counselor at Law"
          />
        </div>
        <div>
          <label className="label">Address</label>
          <textarea
            className="input min-h-[70px]"
            name="addressLines"
            defaultValue={l.addressLines}
            placeholder={"123 Main Street, Suite 400\nSpringfield, IL 62701"}
          />
          <p className="mt-1 text-xs text-slate-500">One line per row.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Phone</label>
            <input className="input" name="phone" defaultValue={l.phone} />
          </div>
          <div>
            <label className="label">Fax</label>
            <input className="input" name="fax" defaultValue={l.fax} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input className="input" name="email" defaultValue={l.email} />
          </div>
          <div>
            <label className="label">Website</label>
            <input className="input" name="website" defaultValue={l.website} />
          </div>
        </div>
        <div>
          <label className="label">Bar number</label>
          <input className="input" name="barNumber" defaultValue={l.barNumber} />
        </div>
        <div>
          <label className="label">Footer</label>
          <input
            className="input"
            name="footer"
            defaultValue={l.footer}
            placeholder="Privileged &amp; Confidential"
          />
        </div>

        <hr className="border-slate-200" />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Default signature block
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Signature name</label>
            <input
              className="input"
              name="signName"
              defaultValue={l.signName}
              placeholder="Same as attorney name"
            />
          </div>
          <div>
            <label className="label">Signature title</label>
            <input
              className="input"
              name="signTitle"
              defaultValue={l.signTitle}
              placeholder="Attorney at Law"
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
