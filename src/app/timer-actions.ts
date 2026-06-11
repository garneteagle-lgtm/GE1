"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";

/** Resolve the effective hourly rate for a case (case override → client default → 0). */
async function rateForCase(caseId: string): Promise<number> {
  const c = await db.case.findUnique({
    where: { id: caseId },
    select: { rate: true, client: { select: { defaultRate: true } } },
  });
  return c?.rate ?? c?.client?.defaultRate ?? 0;
}

/** Start a timer on a case. Only one timer runs at a time — any other running
 *  timer is stopped first and its elapsed time saved. */
export async function startTimer(caseId: string) {
  await requireUser();
  await stopAllRunning();
  await db.timeEntry.create({
    data: {
      caseId,
      running: true,
      startedAt: new Date(),
      rate: await rateForCase(caseId),
    },
  });
  revalidatePath("/", "layout");
}

/** Stop the running timer, saving elapsed minutes and an optional description. */
export async function stopTimer(formData: FormData) {
  await requireUser();
  const description = String(formData.get("description") ?? "").trim();
  await stopAllRunning(description);
  revalidatePath("/", "layout");
}

/** Discard the running timer without saving an entry. */
export async function cancelTimer() {
  await requireUser();
  await db.timeEntry.deleteMany({ where: { running: true } });
  revalidatePath("/", "layout");
}

async function stopAllRunning(description?: string) {
  const running = await db.timeEntry.findMany({ where: { running: true } });
  const now = Date.now();
  for (const e of running) {
    const start = e.startedAt ? new Date(e.startedAt).getTime() : now;
    const minutes = Math.max(0, Math.round((now - start) / 60000));
    if (minutes === 0 && !description) {
      // Stopped within the first minute with nothing logged — discard it.
      await db.timeEntry.delete({ where: { id: e.id } });
      continue;
    }
    await db.timeEntry.update({
      where: { id: e.id },
      data: {
        running: false,
        minutes,
        workedAt: e.startedAt ?? new Date(),
        ...(description ? { description } : {}),
      },
    });
  }
}
