import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { format, isPast } from "date-fns";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";

async function addNote(caseId: string, formData: FormData) {
  "use server";
  await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await db.note.create({ data: { caseId, body } });
  revalidatePath(`/cases/${caseId}`);
}

async function addTask(caseId: string, formData: FormData) {
  "use server";
  await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const due = String(formData.get("dueAt") ?? "").trim();
  await db.task.create({
    data: {
      caseId,
      title,
      dueAt: due ? new Date(due) : null,
    },
  });
  revalidatePath(`/cases/${caseId}`);
}

async function toggleTask(taskId: string, caseId: string) {
  "use server";
  await requireUser();
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) return;
  await db.task.update({
    where: { id: taskId },
    data: { done: !t.done, completedAt: !t.done ? new Date() : null },
  });
  revalidatePath(`/cases/${caseId}`);
}

async function addDeadline(caseId: string, formData: FormData) {
  "use server";
  await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const due = String(formData.get("dueAt") ?? "").trim();
  if (!title || !due) return;
  await db.deadline.create({
    data: { caseId, title, dueAt: new Date(due), kind: emptyToNull(formData.get("kind")) },
  });
  revalidatePath(`/cases/${caseId}`);
}

async function setStatus(caseId: string, status: string) {
  "use server";
  await requireUser();
  await db.case.update({
    where: { id: caseId },
    data: { status, closedAt: status === "closed" ? new Date() : null },
  });
  revalidatePath(`/cases/${caseId}`);
}

async function deleteCase(caseId: string) {
  "use server";
  await requireUser();
  await db.case.delete({ where: { id: caseId } });
  redirect("/cases");
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

export default async function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const c = await db.case.findUnique({
    where: { id },
    include: {
      client: true,
      notes: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: [{ done: "asc" }, { dueAt: "asc" }] },
      deadlines: { orderBy: { dueAt: "asc" } },
      emails: { orderBy: { sentAt: "desc" }, take: 20 },
      events: { orderBy: { startAt: "asc" }, take: 20 },
    },
  });
  if (!c) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            <Link href={`/clients/${c.client.id}`} className="hover:underline">
              {c.client.name}
            </Link>
          </div>
          <h1 className="text-2xl font-semibold">{c.title}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {[c.caseNumber, c.court, c.practiceArea].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`badge ${
              c.status === "open"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {c.status}
          </span>
          {c.status === "open" ? (
            <form action={setStatus.bind(null, c.id, "closed")}>
              <button className="btn-outline" type="submit">Close case</button>
            </form>
          ) : (
            <form action={setStatus.bind(null, c.id, "open")}>
              <button className="btn-outline" type="submit">Reopen</button>
            </form>
          )}
        </div>
      </div>

      {c.description && (
        <div className="card p-4 text-sm">
          <div className="label">Description</div>
          <div className="whitespace-pre-wrap">{c.description}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">Deadlines</h2>
          <form action={addDeadline.bind(null, c.id)} className="mb-4 space-y-2">
            <input className="input" name="title" placeholder="Deadline title" required />
            <div className="flex gap-2">
              <input className="input" name="dueAt" type="datetime-local" required />
              <input className="input" name="kind" placeholder="Type (filing, hearing…)" />
            </div>
            <button className="btn-primary" type="submit">Add deadline</button>
          </form>
          {c.deadlines.length === 0 ? (
            <p className="text-sm text-slate-500">No deadlines.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {c.deadlines.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{d.title}</div>
                    {d.kind && <div className="text-xs text-slate-500">{d.kind}</div>}
                  </div>
                  <div className={isPast(d.dueAt) ? "text-red-600" : "text-slate-700"}>
                    {format(d.dueAt, "MMM d, yyyy h:mm a")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">Tasks</h2>
          <form action={addTask.bind(null, c.id)} className="mb-4 space-y-2">
            <input className="input" name="title" placeholder="Task title" required />
            <input className="input" name="dueAt" type="date" />
            <button className="btn-primary" type="submit">Add task</button>
          </form>
          {c.tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {c.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <form action={toggleTask.bind(null, t.id, c.id)} className="flex items-center gap-2">
                    <button
                      type="submit"
                      className={`h-4 w-4 rounded border ${
                        t.done ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                      }`}
                      aria-label="toggle task"
                    />
                    <span className={t.done ? "text-slate-400 line-through" : ""}>{t.title}</span>
                  </form>
                  {t.dueAt && (
                    <span className="text-xs text-slate-500">
                      {format(t.dueAt, "MMM d")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Case log</h2>
        <form action={addNote.bind(null, c.id)} className="mb-4 space-y-2">
          <textarea className="input min-h-[80px]" name="body" placeholder="Add a note…" required />
          <button className="btn-primary" type="submit">Add note</button>
        </form>
        {c.notes.length === 0 ? (
          <p className="text-sm text-slate-500">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {c.notes.map((n) => (
              <li key={n.id} className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="mb-1 text-xs text-slate-500">
                  {format(n.createdAt, "MMM d, yyyy h:mm a")}
                </div>
                <div className="whitespace-pre-wrap">{n.body}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {c.client.email && (
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Linked emails</h2>
            <form action={`/api/gmail/sync?caseId=${c.id}`} method="post">
              <button className="btn-outline" type="submit">Sync from Gmail</button>
            </form>
          </div>
          {c.emails.length === 0 ? (
            <p className="text-sm text-slate-500">
              No emails linked. Click "Sync from Gmail" to fetch messages to/from{" "}
              <code>{c.client.email}</code>.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {c.emails.map((e) => (
                <li key={e.id} className="py-2 text-sm">
                  <div className="font-medium">{e.subject || "(no subject)"}</div>
                  <div className="text-xs text-slate-500">
                    {e.fromAddr} → {e.toAddr}
                    {e.sentAt && ` · ${format(e.sentAt, "MMM d, yyyy")}`}
                  </div>
                  {e.snippet && <div className="mt-1 text-slate-600">{e.snippet}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {c.events.length > 0 && (
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">Linked calendar events</h2>
          <ul className="divide-y divide-slate-100">
            {c.events.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <div className="font-medium">{e.summary || "(untitled)"}</div>
                <div className="text-xs text-slate-500">
                  {e.startAt && format(e.startAt, "MMM d, yyyy h:mm a")}
                  {e.location && ` · ${e.location}`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex justify-end pt-4">
        <form action={deleteCase.bind(null, c.id)}>
          <button
            className="btn-ghost text-red-600 hover:bg-red-50"
            type="submit"
          >
            Delete case
          </button>
        </form>
      </div>
    </div>
  );
}
