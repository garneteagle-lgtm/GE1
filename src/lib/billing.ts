// Pure helpers for billable-hours math and formatting.
// Legal time is billed in tenths of an hour (6-minute increments), rounded up,
// with a 0.1h (6 min) minimum for any entry that has time on it.

/** Round a duration in minutes up to the nearest tenth of an hour. */
export function billableHours(minutes: number): number {
  if (minutes <= 0) return 0;
  const tenths = Math.max(1, Math.ceil(minutes / 6));
  return tenths / 10;
}

/** Billable dollar amount for an entry, after tenth-of-an-hour rounding. */
export function entryAmount(minutes: number, rate: number): number {
  return Math.round(billableHours(minutes) * rate * 100) / 100;
}

/** "1.5 h" style label from raw minutes (rounded to billable tenths). */
export function formatHours(minutes: number): string {
  return `${billableHours(minutes).toFixed(1)} h`;
}

/** Live elapsed minutes for a running timer. */
export function elapsedMinutes(startedAt: Date | string, now: number = Date.now()): number {
  const start = new Date(startedAt).getTime();
  return Math.max(0, (now - start) / 60000);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(amount: number): string {
  return usd.format(amount || 0);
}

/** Parse a free-form hours input ("1.5", "0.2", ".5") into whole minutes. */
export function hoursToMinutes(hours: string | number): number {
  const h = typeof hours === "number" ? hours : parseFloat(String(hours));
  if (!isFinite(h) || h <= 0) return 0;
  return Math.round(h * 60);
}

export type EntryLike = { minutes: number; rate: number; billable: boolean; billed: boolean };

/** Totals across a set of entries, split into billed / unbilled / non-billable. */
export function summarize(entries: EntryLike[]) {
  let totalMinutes = 0;
  let billableMinutes = 0;
  let billedAmount = 0;
  let unbilledAmount = 0;
  for (const e of entries) {
    totalMinutes += e.minutes;
    if (!e.billable) continue;
    billableMinutes += e.minutes;
    const amt = entryAmount(e.minutes, e.rate);
    if (e.billed) billedAmount += amt;
    else unbilledAmount += amt;
  }
  return {
    totalMinutes,
    billableMinutes,
    billedAmount: Math.round(billedAmount * 100) / 100,
    unbilledAmount: Math.round(unbilledAmount * 100) / 100,
    totalAmount: Math.round((billedAmount + unbilledAmount) * 100) / 100,
  };
}
