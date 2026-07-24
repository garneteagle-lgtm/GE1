"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { Letterhead } from "@/lib/letterhead";

type ClientLite = { id: string; name: string; address: string | null };

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

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "";
}

export default function LetterEditor({
  letterhead,
  clients,
}: {
  letterhead: Letterhead;
  clients: ClientLite[];
}) {
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [dateStr, setDateStr] = useState(() => format(new Date(), "MMMM d, yyyy"));
  const [reLine, setReLine] = useState("");
  const [salutation, setSalutation] = useState("");
  const [body, setBody] = useState("");
  const [closing, setClosing] = useState("Sincerely,");
  const [signName, setSignName] = useState(
    letterhead.signName || letterhead.attorneyName,
  );
  const [signTitle, setSignTitle] = useState(letterhead.signTitle || "Attorney at Law");

  const paragraphs = useMemo(() => toParagraphs(body), [body]);
  const effectiveSalutation =
    salutation.trim() ||
    (recipientName.trim() ? `Dear ${recipientName.trim()}:` : "To whom it may concern:");

  function onPickClient(id: string) {
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    setRecipientName(c.name);
    setRecipientAddress(c.address ?? "");
    setSalutation(`Dear ${firstNameOf(c.name)}:`);
  }

  const contactLine = [
    letterhead.phone && `Tel: ${letterhead.phone}`,
    letterhead.fax && `Fax: ${letterhead.fax}`,
    letterhead.email,
    letterhead.website,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      {/* -------- Editor (screen only) -------- */}
      <div className="no-print card space-y-4 p-5">
        {clients.length > 0 && (
          <div>
            <label className="label">Prefill recipient from a client</label>
            <select
              className="input"
              defaultValue=""
              onChange={(e) => onPickClient(e.target.value)}
            >
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
          <input
            className="input"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Recipient name</label>
          <input
            className="input"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <label className="label">Recipient address</label>
          <textarea
            className="input min-h-[70px]"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder={"456 Oak Avenue\nSpringfield, IL 62704"}
          />
        </div>

        <div>
          <label className="label">Re:</label>
          <input
            className="input"
            value={reLine}
            onChange={(e) => setReLine(e.target.value)}
            placeholder="Subject / matter reference"
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
            <input
              className="input"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Signature title</label>
            <input
              className="input"
              value={signTitle}
              onChange={(e) => setSignTitle(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Signature name</label>
          <input
            className="input"
            value={signName}
            onChange={(e) => setSignName(e.target.value)}
          />
        </div>

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
        <article className="letter-sheet font-serif text-[12pt] leading-relaxed text-black">
          {/* Letterhead */}
          <header className="mb-8 border-b-2 border-slate-800 pb-4 text-center">
            <div className="text-[20pt] font-bold tracking-wide">
              {letterhead.firmName || "Your Firm Name"}
            </div>
            {letterhead.tagline && (
              <div className="mt-0.5 text-[11pt] italic text-slate-700">
                {letterhead.tagline}
              </div>
            )}
            {letterhead.addressLines && (
              <div className="mt-2 text-[10pt] text-slate-700">
                <Lines text={letterhead.addressLines} />
              </div>
            )}
            {contactLine && (
              <div className="mt-1 text-[10pt] text-slate-700">{contactLine}</div>
            )}
          </header>

          {/* Date */}
          <div className="mb-6">{dateStr}</div>

          {/* Recipient */}
          {(recipientName || recipientAddress) && (
            <div className="mb-6">
              {recipientName && <div>{recipientName}</div>}
              {recipientAddress && <Lines text={recipientAddress} />}
            </div>
          )}

          {/* Re line */}
          {reLine.trim() && (
            <div className="mb-6 font-semibold">
              Re:&nbsp;&nbsp;{reLine.trim()}
            </div>
          )}

          {/* Salutation */}
          <div className="mb-4">{effectiveSalutation}</div>

          {/* Body */}
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p key={i} className="mb-4 whitespace-pre-wrap text-justify">
                {p}
              </p>
            ))
          ) : (
            <p className="mb-4 italic text-slate-400">
              Your letter text will appear here as you type.
            </p>
          )}

          {/* Signature block */}
          <div className="mt-8">
            <div>{closing}</div>
            <div className="h-16" />
            {signName && <div className="font-semibold">{signName}</div>}
            {signTitle && <div>{signTitle}</div>}
            {letterhead.barNumber && (
              <div className="text-[10pt] text-slate-600">
                Bar No. {letterhead.barNumber}
              </div>
            )}
          </div>

          {/* Footer */}
          {letterhead.footer && (
            <footer className="mt-10 border-t border-slate-300 pt-2 text-center text-[9pt] text-slate-600">
              {letterhead.footer}
            </footer>
          )}
        </article>
      </div>
    </div>
  );
}
