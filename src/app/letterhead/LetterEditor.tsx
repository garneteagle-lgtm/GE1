"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { Letterhead } from "@/lib/letterhead";

type ClientLite = { id: string; name: string; address: string | null };

const DELIVERY_OPTIONS = [
  "",
  "VIA ELECTRONIC MAIL",
  "VIA U.S. MAIL",
  "VIA CERTIFIED MAIL",
  "VIA FACSIMILE",
  "HAND DELIVERED",
];

/** Split pasted text into paragraphs on blank lines, keeping inner line breaks. */
function toParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n[ \t]+/g, "\n").trim())
    .filter((p) => p.length > 0);
}

/** Render a multi-line string as separate lines. */
function Lines({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return (
    <>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </>
  );
}

export default function LetterEditor({
  letterhead,
  logo,
  clients,
}: {
  letterhead: Letterhead;
  logo: string;
  clients: ClientLite[];
}) {
  const [dateStr, setDateStr] = useState(() => format(new Date(), "MMMM d, yyyy"));
  const [delivery, setDelivery] = useState("VIA ELECTRONIC MAIL");
  const [recipient, setRecipient] = useState("");
  const [reLine, setReLine] = useState("");
  const [salutation, setSalutation] = useState("");
  const [body, setBody] = useState("");
  const [closing, setClosing] = useState(letterhead.closing);
  const [signName, setSignName] = useState(letterhead.signName);
  const [copyTo, setCopyTo] = useState("");
  const [enclosure, setEnclosure] = useState(false);

  const paragraphs = useMemo(() => toParagraphs(body), [body]);

  const firstRecipientName = recipient.split("\n")[0]?.trim() || "";
  const effectiveSalutation =
    salutation.trim() ||
    (firstRecipientName ? `Dear ${firstRecipientName},` : "To whom it may concern,");

  function onPickClient(id: string) {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    const block = c.address ? `${c.name}\n${c.address}` : c.name;
    setRecipient(block);
    const first = c.name.trim().split(/\s+/)[0] || "";
    setSalutation(`Dear ${first},`);
  }

  // Footer contact line: "PHONE 561-655-1901   FAX 561-655-3870   email"
  const contactBits: { label?: string; value: string }[] = [];
  if (letterhead.phone) contactBits.push({ label: "PHONE", value: letterhead.phone });
  if (letterhead.fax) contactBits.push({ label: "FAX", value: letterhead.fax });
  if (letterhead.email) contactBits.push({ value: letterhead.email });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      {/* -------- Editor (screen only) -------- */}
      <div className="no-print card space-y-4 p-5">
        {clients.length > 0 && (
          <div>
            <label className="label">Prefill recipient from a client</label>
            <select className="input" defaultValue="" onChange={(e) => onPickClient(e.target.value)}>
              <option value="">— Select a client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Date</label>
          <input className="input" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </div>

        <div>
          <label className="label">Delivery line</label>
          <input
            className="input"
            list="delivery-options"
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
            placeholder="e.g. VIA ELECTRONIC MAIL (optional)"
          />
          <datalist id="delivery-options">
            {DELIVERY_OPTIONS.filter(Boolean).map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="label">Recipient (name &amp; address)</label>
          <textarea
            className="input min-h-[70px]"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={"John Smith\n456 Oak Avenue\nWest Palm Beach, FL 33401"}
          />
        </div>

        <div>
          <label className="label">Re:</label>
          <input
            className="input"
            value={reLine}
            onChange={(e) => setReLine(e.target.value)}
            placeholder="Brooks v. Perdue, Case # 2025-017243-FC-04"
          />
        </div>

        <div>
          <label className="label">Salutation</label>
          <input
            className="input"
            value={salutation}
            onChange={(e) => setSalutation(e.target.value)}
            placeholder={effectiveSalutation}
          />
        </div>

        <div>
          <label className="label">Letter body — paste your text here</label>
          <textarea
            className="input min-h-[220px] font-mono text-xs"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Paste or type the letter text. Leave a blank line between paragraphs."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Closing</label>
            <input className="input" value={closing} onChange={(e) => setClosing(e.target.value)} />
          </div>
          <div>
            <label className="label">Signature name</label>
            <input
              className="input"
              value={signName}
              onChange={(e) => setSignName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Copy to (xc:)</label>
          <input
            className="input"
            value={copyTo}
            onChange={(e) => setCopyTo(e.target.value)}
            placeholder="Client (optional)"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enclosure}
            onChange={(e) => setEnclosure(e.target.checked)}
          />
          Note enclosure
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn-primary" type="button" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <span className="self-center text-xs text-slate-500">
            Use your browser&apos;s print dialog → &ldquo;Save as PDF&rdquo;.
          </span>
        </div>
      </div>

      {/* -------- Live preview / print sheet -------- */}
      <div className="overflow-x-auto">
        <article className="letter-sheet flex flex-col text-[12pt] leading-normal text-black">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logo}
              alt={letterhead.firmName || "Firm logo"}
              className="h-auto"
              style={{ maxWidth: "4in" }}
            />
          </div>

          {/* Body region grows so the footer sits at the bottom of the page */}
          <div className="flex-1">
            {/* Date — centered, bold */}
            <div className="mb-6 text-center font-bold">{dateStr}</div>

            {/* Delivery line — bold */}
            {delivery.trim() && <div className="mb-4 font-bold">{delivery.trim()}</div>}

            {/* Recipient */}
            {recipient.trim() && (
              <div className="mb-4">
                <Lines text={recipient} />
              </div>
            )}

            {/* Re: line */}
            {reLine.trim() && (
              <div className="mb-4">
                <span className="font-bold">Re:</span>&nbsp;&nbsp;{reLine.trim()}
              </div>
            )}

            {/* Salutation */}
            <div className="mb-4">{effectiveSalutation}</div>

            {/* Body */}
            {paragraphs.length > 0 ? (
              paragraphs.map((p, i) => (
                <p key={i} className="mb-4 whitespace-pre-wrap">
                  {p}
                </p>
              ))
            ) : (
              <p className="mb-4 italic text-slate-400">
                Your letter text will appear here as you type.
              </p>
            )}

            {/* Signature block — centered */}
            <div className="mt-6 text-center">
              <div>{closing}</div>
              <div className="h-16" />
              {signName && <div>{signName}</div>}
            </div>

            {/* Copy / enclosure notations */}
            {(copyTo.trim() || enclosure) && (
              <div className="mt-8">
                {copyTo.trim() && <div>xc:&nbsp;&nbsp;{copyTo.trim()}</div>}
                {enclosure && <div>Enclosure</div>}
              </div>
            )}
          </div>

          {/* Footer bar */}
          {(letterhead.footerAddress || contactBits.length > 0) && (
            <footer className="mt-10 text-center text-[10pt] uppercase leading-snug">
              {letterhead.footerAddress && <div>{letterhead.footerAddress}</div>}
              {contactBits.length > 0 && (
                <div>
                  {contactBits.map((b, i) => (
                    <span key={i}>
                      {i > 0 && <span>&nbsp;&nbsp;&nbsp;&nbsp;</span>}
                      {b.label && (
                        <span style={{ color: letterhead.accentColor }}>{b.label}&nbsp;</span>
                      )}
                      {b.value}
                    </span>
                  ))}
                </div>
              )}
            </footer>
          )}
        </article>
      </div>
    </div>
  );
}
