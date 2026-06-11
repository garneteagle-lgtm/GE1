import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { billableHours, formatMoney, summarize } from "@/lib/billing";

export default async function BillingPage() {
  await requireUser();

  const cases = await db.case.findMany({
    orderBy: { title: "asc" },
    include: {
      client: true,
      timeEntries: { where: { running: false } },
    },
  });

  const rows = cases
    .map((c) => {
      const totals = summarize(c.timeEntries);
      return { c, totals, entryCount: c.timeEntries.length };
    })
    .filter((r) => r.entryCount > 0)
    .sort((a, b) => b.totals.unbilledAmount - a.totals.unbilledAmount);

  const firm = rows.reduce(
    (acc, r) => {
      acc.unbilled += r.totals.unbilledAmount;
      acc.billed += r.totals.billedAmount;
      acc.minutes += r.totals.billableMinutes;
      return acc;
    },
    { unbilled: 0, billed: 0, minutes: 0 }
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Billing</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-amber-700">Unbilled</div>
          <div className="text-3xl font-semibold text-amber-900">{formatMoney(firm.unbilled)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Billed</div>
          <div className="text-3xl font-semibold text-emerald-900">{formatMoney(firm.billed)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Billable hours</div>
          <div className="text-3xl font-semibold">{billableHours(firm.minutes).toFixed(1)}</div>
        </div>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">By case</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No time logged yet. Open a case and start the timer or log time to see billing here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">Case</th>
                  <th className="py-2 pr-4 font-medium">Client</th>
                  <th className="py-2 pr-4 text-right font-medium">Hours</th>
                  <th className="py-2 pr-4 text-right font-medium">Unbilled</th>
                  <th className="py-2 pr-4 text-right font-medium">Billed</th>
                  <th className="py-2 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ c, totals }) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-4">
                      <Link href={`/cases/${c.id}`} className="font-medium hover:underline">
                        {c.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{c.client.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {billableHours(totals.billableMinutes).toFixed(1)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums font-medium text-amber-800">
                      {totals.unbilledAmount > 0 ? formatMoney(totals.unbilledAmount) : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-500">
                      {totals.billedAmount > 0 ? formatMoney(totals.billedAmount) : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/billing/${c.id}`} className="text-ink underline">
                        Statement
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
