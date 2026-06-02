"use client";

import { useMemo, useState } from "react";
import {
  calcChildSupport,
  calcAlimony,
  type MarriageTerm,
} from "@/lib/florida-support";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// Parse a possibly-empty/invalid currency input to a non-negative number.
function num(v: string): number {
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const TERM_LABEL: Record<MarriageTerm, string> = {
  short: "Short-term (under 10 years)",
  moderate: "Moderate-term (10–20 years)",
  long: "Long-term (20+ years)",
};

export default function CalculatorClient() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Florida support calculator</h1>
        <p className="mt-1 text-sm text-slate-600">
          Estimates child support (Fla. Stat. § 61.30) and durational alimony
          (§ 61.08, as amended by SB 1416). For case planning only.
        </p>
      </div>

      <Disclaimer />

      <ChildSupport />
      <Alimony />
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <strong>Estimate only — not legal advice.</strong> These figures are a
      planning aid, not a guideline worksheet. A court may deviate from the
      guidelines, incomes and deductions must be independently verified, and the
      statutes change. Always confirm against the current text of Fla. Stat.
      §§ 61.30 and 61.08 and prepare the official worksheet before relying on any
      number.
    </div>
  );
}

function ChildSupport() {
  const [children, setChildren] = useState(1);
  const [nameA, setNameA] = useState("Parent A");
  const [nameB, setNameB] = useState("Parent B");
  const [netA, setNetA] = useState("");
  const [netB, setNetB] = useState("");
  const [childCare, setChildCare] = useState("");
  const [insurance, setInsurance] = useState("");
  const [childCarePayer, setChildCarePayer] = useState<"A" | "B">("A");
  const [insurancePayer, setInsurancePayer] = useState<"A" | "B">("A");
  const [overnightsA, setOvernightsA] = useState(73);

  const result = useMemo(() => {
    const cc = num(childCare);
    const ins = num(insurance);
    return calcChildSupport({
      children,
      netIncomeA: num(netA),
      netIncomeB: num(netB),
      childCare: cc,
      healthInsurance: ins,
      prepaidA:
        (childCarePayer === "A" ? cc : 0) + (insurancePayer === "A" ? ins : 0),
      prepaidB:
        (childCarePayer === "B" ? cc : 0) + (insurancePayer === "B" ? ins : 0),
      overnightsA,
    });
  }, [
    children,
    netA,
    netB,
    childCare,
    insurance,
    childCarePayer,
    insurancePayer,
    overnightsA,
  ]);

  const payorName = result.payor === "A" ? nameA : result.payor === "B" ? nameB : "";
  const payeeName = result.payor === "A" ? nameB : result.payor === "B" ? nameA : "";

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Child support</h2>
      <p className="mt-1 text-xs text-slate-500">
        Income shares model. Enter each parent&apos;s monthly <em>net</em> income
        (gross income less the deductions allowed by § 61.30(3): income &amp;
        FICA taxes, mandatory union dues and retirement, health insurance for the
        parent, and court-ordered support actually paid for other children).
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Number of children</label>
          <select
            className="input"
            value={children}
            onChange={(e) => setChildren(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div />

        <ParentColumn
          name={nameA}
          setName={setNameA}
          net={netA}
          setNet={setNetA}
        />
        <ParentColumn
          name={nameB}
          setName={setNameB}
          net={netB}
          setNet={setNetB}
        />

        <div>
          <label className="label">Monthly child-care cost</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="$0"
            value={childCare}
            onChange={(e) => setChildCare(e.target.value)}
          />
          <PayerToggle value={childCarePayer} onChange={setChildCarePayer} a={nameA} b={nameB} />
        </div>
        <div>
          <label className="label">Monthly child health insurance</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="$0"
            value={insurance}
            onChange={(e) => setInsurance(e.target.value)}
          />
          <PayerToggle value={insurancePayer} onChange={setInsurancePayer} a={nameA} b={nameB} />
        </div>

        <div className="sm:col-span-2">
          <label className="label">
            {nameA}&apos;s overnights per year: {overnightsA} &nbsp;·&nbsp; {nameB}:{" "}
            {365 - overnightsA}
          </label>
          <input
            type="range"
            min={0}
            max={365}
            value={overnightsA}
            onChange={(e) => setOvernightsA(Number(e.target.value))}
            className="w-full accent-slate-800"
          />
          <p className="mt-1 text-xs text-slate-500">
            At least 20% (73) overnights with each parent triggers the
            substantial-time-sharing gross-up in § 61.30(11)(b).
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-slate-50 p-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Metric label="Combined net income" value={usd(result.combinedNet)} />
          <Metric
            label="Income share"
            value={`${pct(result.shareA)} / ${pct(result.shareB)}`}
          />
          <Metric label="Basic obligation" value={usd(result.basic)} />
          <Metric label="Total w/ add-ons" value={usd(result.totalObligation)} />
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          {result.transfer > 0 ? (
            <p className="text-base">
              Estimated transfer:{" "}
              <span className="font-semibold">{usd(result.transfer)}/mo</span>{" "}
              from <span className="font-medium">{payorName}</span> to{" "}
              <span className="font-medium">{payeeName}</span>.
            </p>
          ) : (
            <p className="text-base text-slate-600">
              No net transfer at these inputs (enter both incomes to compute).
            </p>
          )}
          {result.grossUp && (
            <p className="mt-1 text-xs text-slate-500">
              Substantial-time-sharing gross-up applied (each parent ≥ 20% of
              overnights).
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ParentColumn({
  name,
  setName,
  net,
  setNet,
}: {
  name: string;
  setName: (v: string) => void;
  net: string;
  setNet: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <input
        className="mb-2 w-full border-b border-transparent bg-transparent text-sm font-medium focus:border-slate-300 focus:outline-none"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Parent name"
      />
      <label className="label">Monthly net income</label>
      <input
        className="input"
        inputMode="decimal"
        placeholder="$0"
        value={net}
        onChange={(e) => setNet(e.target.value)}
      />
    </div>
  );
}

function PayerToggle({
  value,
  onChange,
  a,
  b,
}: {
  value: "A" | "B";
  onChange: (v: "A" | "B") => void;
  a: string;
  b: string;
}) {
  return (
    <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
      <span>Paid by:</span>
      {(["A", "B"] as const).map((v) => (
        <label key={v} className="flex items-center gap-1">
          <input
            type="radio"
            checked={value === v}
            onChange={() => onChange(v)}
            className="accent-slate-800"
          />
          {v === "A" ? a : b}
        </label>
      ))}
    </div>
  );
}

function Alimony() {
  const [years, setYears] = useState("");
  const [payor, setPayor] = useState("");
  const [payee, setPayee] = useState("");
  const [need, setNeed] = useState("");

  const result = useMemo(
    () =>
      calcAlimony({
        marriageYears: num(years),
        netIncomePayor: num(payor),
        netIncomePayee: num(payee),
        reasonableNeed: need.trim() === "" ? null : num(need),
      }),
    [years, payor, payee, need]
  );

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Alimony (durational)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Post-SB 1416: permanent alimony is no longer available. Durational
        alimony length is capped by marriage length; the amount may not exceed
        the lesser of the obligee&apos;s reasonable need or 35% of the difference
        in the parties&apos; net incomes (§ 61.08(8)).
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Length of marriage (years)</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0"
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Obligee&apos;s reasonable need (monthly, optional)</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="$0"
            value={need}
            onChange={(e) => setNeed(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Higher-earning spouse — monthly net</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="$0"
            value={payor}
            onChange={(e) => setPayor(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Lower-earning spouse — monthly net</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="$0"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <Metric label="Marriage term" value={TERM_LABEL[result.term]} />
          <Metric label="Net income difference" value={usd(result.incomeDifference)} />
          <Metric label="35% amount cap" value={`${usd(result.amountCap35)}/mo`} />
          <Metric
            label="Max durational length"
            value={
              result.durationalAvailable
                ? `${result.maxDurationalYears.toFixed(1)} yrs (${pct(result.lengthCapPct)})`
                : "N/A"
            }
          />
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4 space-y-1">
          {result.durationalAvailable ? (
            <p className="text-base">
              Estimated durational amount:{" "}
              <span className="font-semibold">
                {usd(result.estimatedMonthlyAmount)}/mo
              </span>
              {result.capIsBinding ? (
                <span className="text-xs text-slate-500"> (35% cap is binding)</span>
              ) : (
                <span className="text-xs text-slate-500"> (reasonable need is binding)</span>
              )}
            </p>
          ) : (
            <p className="text-base text-amber-800">
              Durational alimony is not available for a marriage under 3 years.
              Consider bridge-the-gap or rehabilitative alimony.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Other forms remain available: bridge-the-gap (max{" "}
            {result.bridgeTheGapMaxYears} yrs) and rehabilitative (max{" "}
            {result.rehabilitativeMaxYears} yrs, requires a defined plan).
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}
