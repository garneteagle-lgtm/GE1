import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import {
  addressLines,
  serviceBlock,
  sunbizLiveUrl,
  decodeOfficerTitle,
  parseOfficersJson,
} from "@/lib/sunbiz";
import { CopyButton } from "./CopyButton";

async function linkToCase(entityId: string, formData: FormData) {
  "use server";
  await requireUser();
  const caseId = String(formData.get("caseId") ?? "");
  const role = String(formData.get("role") ?? "").trim() || null;
  if (!caseId) return;
  await db.caseEntity.upsert({
    where: { caseId_entityId: { caseId, entityId } },
    create: { caseId, entityId, role },
    update: { role },
  });
  revalidatePath(`/entities/${entityId}`);
  revalidatePath(`/cases/${caseId}`);
}

async function unlinkCase(linkId: string, entityId: string) {
  "use server";
  await requireUser();
  const link = await db.caseEntity.findUnique({ where: { id: linkId } });
  await db.caseEntity.delete({ where: { id: linkId } });
  revalidatePath(`/entities/${entityId}`);
  if (link) revalidatePath(`/cases/${link.caseId}`);
}

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [e, cases] = await Promise.all([
    db.entity.findUnique({
      where: { id },
      include: { caseLinks: { include: { case: { include: { client: true } } } } },
    }),
    db.case.findMany({ orderBy: { updatedAt: "desc" }, include: { client: true } }),
  ]);
  if (!e) notFound();

  const officers = parseOfficersJson(e.officersJson);
  const liveUrl = sunbizLiveUrl(e.documentNumber);

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

  const linkedCaseIds = new Set(e.caseLinks.map((l) => l.caseId));
  const linkableCases = cases.filter((c) => !linkedCaseIds.has(c.id));

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

      {/* Accuracy banner — this is locally-stored bulk data, verify before serving */}
      <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div>
          <span className="font-medium">Verify before serving.</span> This is from Florida&apos;s
          bulk data (synced {e.lastSyncedAt.toLocaleDateString("en-US")}
          {e.lastTxDate ? `; last state filing ${e.lastTxDate}` : ""}) and can lag the live record.
          Confirm the agent and address on the authoritative source first.
        </div>
        <a className="btn-primary shrink-0" href={liveUrl} target="_blank" rel="noreferrer">
          Verify live on Sunbiz ↗
        </a>
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

      {/* Officers & directors */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Officers &amp; directors</h2>
        <p className="mb-4 text-xs text-slate-500">
          Useful for individual service or identifying who to depose. Florida notes officer data may
          be limited by the file&apos;s space — confirm on the live record.
        </p>
        {officers.length === 0 ? (
          <p className="text-sm text-slate-400">None on file.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {officers.map((o, i) => {
              const lines = addressLines({
                addr1: o.addr1,
                city: o.city,
                state: o.state,
                zip: o.zip,
              });
              const title = decodeOfficerTitle(o.title);
              return (
                <li key={i} className="py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{o.name}</span>
                    {title && (
                      <span className="badge bg-slate-100 text-slate-600">{title}</span>
                    )}
                    {o.type && <span className="text-xs text-slate-400">{o.type}</span>}
                  </div>
                  {lines.length > 0 && (
                    <div className="mt-1 text-slate-600">{lines.join(", ")}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Link to a case */}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Cases</h2>
        {e.caseLinks.length > 0 && (
          <ul className="mb-4 divide-y divide-slate-100">
            {e.caseLinks.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <Link href={`/cases/${l.caseId}`} className="font-medium hover:underline">
                    {l.case.title}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {" "}
                    · {l.case.client.name}
                    {l.role ? ` · ${l.role}` : ""}
                  </span>
                </div>
                <form action={unlinkCase.bind(null, l.id, e.id)}>
                  <button className="btn-ghost text-red-600 hover:bg-red-50" type="submit">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {linkableCases.length > 0 ? (
          <form action={linkToCase.bind(null, e.id)} className="flex flex-wrap items-end gap-2">
            <div className="grow">
              <label className="label">Add to case</label>
              <select className="input" name="caseId" required defaultValue="">
                <option value="" disabled>
                  Select a case…
                </option>
                {linkableCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} — {c.client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grow">
              <label className="label">Role (optional)</label>
              <input className="input" name="role" placeholder="Defendant, subpoena target…" />
            </div>
            <button className="btn-primary" type="submit">
              Link
            </button>
          </form>
        ) : cases.length === 0 ? (
          <p className="text-sm text-slate-500">
            No cases yet. <Link className="underline" href="/cases/new">Create one</Link> to attach
            this entity.
          </p>
        ) : (
          <p className="text-sm text-slate-500">Linked to all existing cases.</p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="mb-3 text-lg font-semibold">Registry details</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Document number" value={e.documentNumber} />
          <Row label="FEI / EIN" value={e.feiNumber} />
          <Row label="Filing type" value={e.filingType} />
          <Row label="Status" value={e.status} />
          <Row label="Date filed" value={e.fileDate} />
          <Row label="Last state filing" value={e.lastTxDate} />
          <Row label="Data synced" value={e.lastSyncedAt.toLocaleDateString("en-US")} />
        </dl>
        <p className="mt-4 text-xs text-slate-400">
          Source: Florida Division of Corporations bulk data (sunbiz.org).{" "}
          <a className="underline" href={liveUrl} target="_blank" rel="noreferrer">
            View the live record
          </a>{" "}
          before effecting service.
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
