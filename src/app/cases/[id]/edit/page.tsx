import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";

async function updateCase(caseId: string, formData: FormData) {
  "use server";
  await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  if (!title || !clientId) return;
  await db.case.update({
    where: { id: caseId },
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
  redirect(`/cases/${caseId}`);
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

export default async function EditCasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [c, clients] = await Promise.all([
    db.case.findUnique({ where: { id } }),
    db.client.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!c) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit case</h1>
        <Link className="btn-ghost" href={`/cases/${c.id}`}>Cancel</Link>
      </div>
      <form action={updateCase.bind(null, c.id)} className="card space-y-4 p-6">
        <div>
          <label className="label">Title</label>
          <input className="input" name="title" required defaultValue={c.title} />
        </div>
        <div>
          <label className="label">Client</label>
          <select className="input" name="clientId" defaultValue={c.clientId} required>
            {clients.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Case number</label>
            <input className="input" name="caseNumber" defaultValue={c.caseNumber ?? ""} />
          </div>
          <div>
            <label className="label">Practice area</label>
            <input className="input" name="practiceArea" defaultValue={c.practiceArea ?? ""} />
          </div>
        </div>
        <div>
          <label className="label">Court</label>
          <input className="input" name="court" defaultValue={c.court ?? ""} />
        </div>
        <div>
          <label className="label">Opposing party</label>
          <input className="input" name="opposing" defaultValue={c.opposing ?? ""} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-[100px]"
            name="description"
            defaultValue={c.description ?? ""}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-primary" type="submit">Save changes</button>
        </div>
      </form>
    </div>
  );
}
