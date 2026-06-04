import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { addressLines, serviceBlock } from "@/lib/sunbiz";
import { CopyButton } from "./CopyButton";

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const e = await db.entity.findUnique({ where: { id } });
  if (!e) notFound();

  const raLines = addressLines({
    addr1: e.raAddr1,
    city: e.raCity,
    state: e.raState,
    zip: e.raZip,
  });
  const princLines = addressLines({
    addr1: e.princAddr1,
    addr2: e.princAddr2,
    city: e.princCity,
    state: e.princState,
    zip: e.princZip,
    country: e.princCountry,
  });
  const mailLines = addressLines({
    addr1: e.mailAddr1,
    addr2: e.mailAddr2,
    city: e.mailCity,
    state: e.mailState,
    zip: e.mailZip,
    country: e.mailCountry,
  });

  return (
    <div className="space-y-6">
      <Link href="/entities" className="text-sm text-slate-500 hover:underline">
        ← Back to lookup
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{e.legalName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            FL Document #{e.documentNumber}
            {e.filingType ? ` · ${e.filingType}` : ""}
          </p>
        </div>
        <span
          className={`badge ${
            e.status === "Active" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {e.status ?? "Unknown status"}
        </span>
      </div>

      {/* Service of process — the heart of the page */}
      <section className="card border-ink/20 p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Service of process</h2>
          <CopyButton text={serviceBlock(e)} />
        </div>
        <p className="mb-4 text-sm text-slate-600">Serve the registered agent below.</p>
        {e.raName ? (
          <div className="rounded-md bg-slate-50 p-4 text-sm">
            <div className="font-medium">
              {e.raName}
              {e.raType ? <span className="ml-2 text-xs text-slate-500">({e.raType})</span> : null}
            </div>
            {raLines.length > 0 ? (
              <div className="mt-1 text-slate-700">
                {raLines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-slate-500">No agent address on file.</div>
            )}
          </div>
        ) : (
          <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
            No registered agent on file. If the agent has resigned or the entity is inactive, you
            may need to serve the Florida Secretary of State as substitute agent, or serve an
            officer/director. Verify on sunbiz.org before relying on this.
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Detail title="Principal address" lines={princLines} />
        <Detail title="Mailing address" lines={mailLines} />
      </div>

      <section className="card p-6">
        <h2 className="mb-3 text-lg font-semibold">Registry details</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Document number" value={e.documentNumber} />
          <Row label="FEI / EIN" value={e.feiNumber} />
          <Row label="Filing type" value={e.filingType} />
          <Row label="Status" value={e.status} />
          <Row label="Date filed" value={e.fileDate} />
          <Row
            label="Data synced"
            value={e.lastSyncedAt.toLocaleDateString("en-US")}
          />
        </dl>
        <p className="mt-4 text-xs text-slate-400">
          Source: Florida Division of Corporations bulk data (sunbiz.org). Addresses and agent
          details can lag the live record — confirm on sunbiz.org before effecting service.
        </p>
      </section>
    </div>
  );
}

function Detail({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="card p-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
      {lines.length > 0 ? (
        <div className="text-sm text-slate-800">
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Not on file.</p>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{value || "—"}</dd>
    </div>
  );
}
