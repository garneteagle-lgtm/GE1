import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";

async function updateClient(clientId: string, formData: FormData) {
  "use server";
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await db.client.update({
    where: { id: clientId },
    data: {
      name,
      email: emptyToNull(formData.get("email")),
      phone: emptyToNull(formData.get("phone")),
      address: emptyToNull(formData.get("address")),
      notes: emptyToNull(formData.get("notes")),
      defaultRate: emptyToFloat(formData.get("defaultRate")),
    },
  });
  redirect(`/clients/${clientId}`);
}

async function deleteClient(clientId: string) {
  "use server";
  await requireUser();
  await db.client.delete({ where: { id: clientId } });
  redirect("/clients");
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

function emptyToFloat(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (s.length === 0) return null;
  const n = parseFloat(s);
  return isFinite(n) && n >= 0 ? n : null;
}

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const client = await db.client.findUnique({ where: { id } });
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit client</h1>
        <Link className="btn-ghost" href={`/clients/${client.id}`}>Cancel</Link>
      </div>
      <form action={updateClient.bind(null, client.id)} className="card space-y-4 p-6">
        <div>
          <label className="label">Name</label>
          <input className="input" name="name" required defaultValue={client.name} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input className="input" name="email" type="email" defaultValue={client.email ?? ""} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" name="phone" defaultValue={client.phone ?? ""} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Address</label>
            <input className="input" name="address" defaultValue={client.address ?? ""} />
          </div>
          <div>
            <label className="label">Default hourly rate ($)</label>
            <input
              className="input"
              name="defaultRate"
              type="number"
              step="1"
              min="0"
              defaultValue={client.defaultRate ?? ""}
              placeholder="350"
            />
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[80px]" name="notes" defaultValue={client.notes ?? ""} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-primary" type="submit">Save changes</button>
        </div>
      </form>

      <form action={deleteClient.bind(null, client.id)} className="card p-6">
        <h2 className="mb-2 text-sm font-semibold">Danger zone</h2>
        <p className="mb-3 text-xs text-slate-500">
          Deleting a client also deletes all their cases, notes, tasks, deadlines, and documents.
        </p>
        <button className="btn-ghost text-red-600 hover:bg-red-50" type="submit">
          Delete client and all their cases
        </button>
      </form>
    </div>
  );
}
