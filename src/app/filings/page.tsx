import Link from "next/link";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";

async function assignCase(filingId: string, formData: FormData) {
  "use server";
  await requireUser();
  const caseId = String(formData.get("caseId") ?? "");
  await db.filing.update({ where: { id: filingId }, data: { caseId: caseId || null } });
  revalidatePath("/filings");
}

async function markReviewed(filingId: string) {
  "use server";
  await requireUser();
  await db.filing.update({ where: { id: filingId }, data: { reviewedAt: new Date() } });
  revalidatePath("/filings");
  revalidatePath("/");
}

export default async function FilingsPage() {
  await requireUser();

  const [filings, cases] = await Promise.all([
    db.filing.findMany({
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: { case: { include: { client: true } } },
    }),
    db.case.findMany({
      where: { status: "open" },
      orderBy: { title: "asc" },
      include: { client: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Court filings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Filing notices forwarded from Apple Mail. Matched to a case by case number; assign any
          unmatched ones by hand.
        </p>
      </div>

      <div className="card divide-y divide-slate-100">
        {filings.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No filings yet. See “Court filing alerts” in the README to set up the Apple Mail rule.
          </p>
        ) : (
          filings.map((f) => (
            <div key={f.id} className="flex items-start justify-between gap-4 px-6 py-3 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {!f.reviewedAt && <span className="badge bg-amber-100 text-amber-800">new</span>}
                  <span className="font-medium">{f.docketText || f.subject || "(no subject)"}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {format(f.receivedAt, "MMM d, yyyy h:mm a")}
                  {f.caseNumber && ` · ${f.caseNumber}`}
                  {f.docNumber && ` · Doc #${f.docNumber}`}
                  {f.case && (
                    <>
                      {" · "}
                      <Link className="hover:underline" href={`/cases/${f.case.id}`}>
                        {f.case.title}
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <form action={assignCase.bind(null, f.id)} className="flex items-center gap-2">
                  <select className="input w-56" name="caseId" defaultValue={f.caseId ?? ""}>
                    <option value="">— Not linked —</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.client.name})
                      </option>
                    ))}
                  </select>
                  <button className="btn-outline" type="submit">Save</button>
                </form>
                {!f.reviewedAt && (
                  <form action={markReviewed.bind(null, f.id)}>
                    <button className="btn-ghost" type="submit">Mark reviewed</button>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
