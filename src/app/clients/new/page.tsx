import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

async function createClient(formData: FormData) {
  "use server";
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const client = await db.client.create({
    data: {
      name,
      email: emptyToNull(formData.get("email")),
      phone: emptyToNull(formData.get("phone")),
      address: emptyToNull(formData.get("address")),
      notes: emptyToNull(formData.get("notes")),
      defaultRate: emptyToFloat(formData.get("defaultRate")),
    },
  });
  redirect(`/clients/${client.id}`);
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

export default async function NewClientPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New client</h1>
      <form action={createClient} className="card space-y-4 p-6">
        <div>
          <label className="label">Name</label>
          <input className="input" name="name" required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input className="input" name="email" type="email" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" name="phone" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Address</label>
            <input className="input" name="address" />
          </div>
          <div>
            <label className="label">Default hourly rate ($)</label>
            <input className="input" name="defaultRate" type="number" step="1" min="0" placeholder="350" />
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[80px]" name="notes" />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-primary" type="submit">Create client</button>
        </div>
      </form>
    </div>
  );
}
