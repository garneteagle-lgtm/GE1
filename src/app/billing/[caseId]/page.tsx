import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { billableHours, entryAmount, formatMoney, summarize } from "@/lib/billing";
import { PrintButton } from "./print-button";

async function markAllBilled(caseId: string) {
  "use server";
  await requireUser();
  await db.timeEntry.updateMany({
    where: { caseId, billable: true, billed: false, running: false },
    data: { billed: true, billedAt: new Date() },
  });
  revalidatePath(`/billing/${caseId}`);
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/billing");
}

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const user = await requireUser();
  const { caseId } = await params;
  const { all } = await searchParams;
  const showAll = all === "1";

  const c = await db.case.findUnique({
    where: { id: caseId },
    include: {
      client: true,
      timeEntries: {
        where: { running: false, billable: true, ...(showAll ? {} : { billed: false }) },
        orderBy: { workedAt: "asc" },
      },
    },
  });
  if (!c) notFound();

  const totals = summarize(c.timeEntries);
  const statementTotal = showAll ? totals.totalAmount : totals.unbilledAmount;
  const hasUnbilled = c.timeEntries.some((e) => !e.billed);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/cases/${c.id}`} className="btn-ghost">
          ← Back to case
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/billing/${c.id}${showAll ? "" : "?all=1"}`}
            className="btn-ghost"
          >
            {showAll ? "Show unbilled only" : "Show all entries"}
          </Link>
          <PrintButton />
          {hasUnbilled && (
            <form action={markAllBilled.bind(null, c.id)}>
              <button className="btn-primary" type="submit">
                Mark all as billed
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="card space-y-6 p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Statement of Services</h1>
            <div className="mt-1 text-sm text-slate-500">
              {showAll ? "All recorded time" : "Unbilled time"} · {format(new Date(), "MMMM d, yyyy")}
            </div>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div className="font-medium text-slate-800">{user.name || "Attorney at Law"}</div>
            {user.email && <div>{user.email}</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 border-y border-slate-200 py-4 text-sm">
          <div>
            <div className="label">Client</div>
            <div className="font-medium">{c.client.name}</div>
            {c.client.email && <div className="text-slate-600">{c.client.email}</div>}
            {c.client.address && (
              <div className="whitespace-pre-wrap text-slate-600">{c.client.address}</div>
            )}
          </div>
          <div>
            <div className="label">Matter</div>
            <div className="font-medium">{c.title}</div>
            {c.caseNumber && <div className="text-slate-600">No. {c.caseNumber}</div>}
            {c.court && <div className="text-slate-600">{c.court}</div>}
          </div>
        </div>

        {c.timeEntries.length === 0 ? (
          <p className="text-sm text-slate-500">
            {showAll ? "No time recorded for this matter." : "Nothing outstanding — all time has been billed."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 pr-3 text-right font-medium">Hours</th>
                <th className="py-2 pr-3 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {c.timeEntries.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3 align-top whitespace-nowrap text-slate-600">
                    {format(e.workedAt, "MMM d, yyyy")}
                  </td>
                  <td className="py-2 pr-3 align-top">
                    {e.description || "(no description)"}
                    {showAll && e.billed && (
                      <span className="ml-2 text-xs text-emerald-600">billed</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right align-top tabular-nums">
                    {billableHours(e.minutes).toFixed(1)}
                  </td>
                  <td className="py-2 pr-3 text-right align-top tabular-nums text-slate-600">
                    {formatMoney(e.rate)}
                  </td>
                  <td className="py-2 text-right align-top tabular-nums">
                    {formatMoney(entryAmount(e.minutes, e.rate))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td colSpan={2} className="py-3 text-sm text-slate-500">
                  {billableHours(totals.billableMinutes).toFixed(1)} billable hours
                </td>
                <td colSpan={2} className="py-3 pr-3 text-right font-medium">
                  Total due
                </td>
                <td className="py-3 text-right text-lg font-semibold tabular-nums">
                  {formatMoney(statementTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
