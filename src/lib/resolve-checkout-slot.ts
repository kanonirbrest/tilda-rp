import type { Slot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getExhibitionTimezone, normalizeTimeInput, wallDateAndTimeToUtc } from "@/lib/exhibition-time";

export async function resolveCheckoutSlot(params: {
  slotId?: string | null;
  date?: string | null;
  time?: string | null;
}): Promise<
  { ok: true; slot: Slot } | { ok: false; code: "SLOT_NOT_FOUND" | "DATE_REQUIRED" | "TIME_REQUIRED" | "AMBIGUOUS" }
> {
  const sid = params.slotId?.trim();
  if (sid) {
    const slot = await prisma.slot.findFirst({ where: { id: sid, active: true } });
    if (!slot) return { ok: false, code: "SLOT_NOT_FOUND" };
    return { ok: true, slot };
  }

  const date = params.date?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, code: "DATE_REQUIRED" };
  }

  const timeNorm = params.time?.trim() ? normalizeTimeInput(params.time) : null;
  if (!timeNorm) {
    return { ok: false, code: "TIME_REQUIRED" };
  }

  const tz = getExhibitionTimezone();
  const target = wallDateAndTimeToUtc(date, timeNorm, tz);
  if (!target) {
    return { ok: false, code: "DATE_REQUIRED" };
  }

  const t = target.getTime();
  const windowMs = 90_000;
  const matched = await prisma.slot.findMany({
    where: {
      active: true,
      startsAt: {
        gte: new Date(t - windowMs),
        lte: new Date(t + windowMs),
      },
    },
  });

  if (matched.length === 0) return { ok: false, code: "SLOT_NOT_FOUND" };
  if (matched.length > 1) return { ok: false, code: "AMBIGUOUS" };
  return { ok: true, slot: matched[0]! };
}
