import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

async function createCase(formData: FormData) {
  "use server";
  await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  if (!title || !clientId) return;
  const created = await db.case.create({
    data: {
      title,
      clientId,
      caseNumber: emptyToNull(formData.get("caseNumber")),
      court: emptyToNull(formData.get("court")),
      practiceArea: emptyToNull(formData.get("practiceArea")),
      opposing: emptyToNull(formData.get("opposing")),
      description: emptyToNull(formData.get("description")),
    },
  });
  redirect(`/cases/${created.id}`);
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requireUser();
  const { clientId } = await searchParams;
  const clients = await db.client.findMany({ orderBy: { name: "asc" } });

  if (clients.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">New case</h1>
        <p className="text-sm text-slate-600">
          You need to add a client first.{" "}
          <a className="text-ink underline" href="/clients/new">
            Create a client
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New case</h1>
      <form action={createCase} className="card space-y-4 p-6">
        <div>
          <label className="label">Title</label>
          <input className="input" name="title" required autoFocus />
        </div>
        <div>
          <label className="label">Client</label>
          <select className="input" name="clientId" defaultValue={clientId || ""} required>
            <option value="">— Select client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Case number</label>
            <input className="input" name="caseNumber" />
          </div>
          <div>
            <label className="label">Practice area</label>
            <input className="input" name="practiceArea" placeholder="Family, Civil, Criminal…" />
          </div>
        </div>
        <div>
          <label className="label">Court</label>
          <input className="input" name="court" />
        </div>
        <div>
          <label className="label">Opposing party</label>
          <input className="input" name="opposing" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[100px]" name="description" />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-primary" type="submit">Create case</button>
        </div>
      </form>
    </div>
  );
}
