"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { stopTimer, cancelTimer } from "./timer-actions";

type Running = {
  caseId: string;
  caseTitle: string;
  clientName: string;
  startedAt: string;
};

function hms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function TimerBanner({ running }: { running: Running | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;

  const elapsed = (now - new Date(running.startedAt).getTime()) / 1000;

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-amber-900">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" />
          </span>
          <span className="tabular-nums">{hms(elapsed)}</span>
        </span>
        <span className="text-amber-800">
          on{" "}
          <Link href={`/cases/${running.caseId}`} className="font-medium underline">
            {running.caseTitle}
          </Link>{" "}
          <span className="text-amber-600">· {running.clientName}</span>
        </span>
        <form action={stopTimer} className="ml-auto flex items-center gap-2">
          <input
            className="input h-8 w-64 py-1"
            name="description"
            placeholder="What did you work on?"
            autoComplete="off"
          />
          <button className="btn-primary h-8 py-1" type="submit">
            Stop &amp; save
          </button>
        </form>
        <form action={cancelTimer}>
          <button
            className="btn-ghost h-8 py-1 text-amber-800 hover:bg-amber-100"
            type="submit"
            title="Discard this timer"
          >
            Discard
          </button>
        </form>
      </div>
    </div>
  );
}
