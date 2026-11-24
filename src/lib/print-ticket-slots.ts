import { prisma } from "@/lib/prisma";
import {
  dateKeyInTz,
  getExhibitionTimezone,
  isWallCalendarDayBeforeToday,
  isWallSessionTimeBeforeNow,
  timeKeyInTz,
  wallDayUtcRange,
} from "@/lib/exhibition-time";
import { ensureDomRozhdestvaSlots } from "@/lib/dom-rozhdestva/ensure-slots";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";
import { slotOrderLineStatsMap } from "@/lib/slot-order-line-stats";

/** Календарь и времена для регистрации печатного билета. Онлайн-продажу не трогает. */
export async function listPrintRegistrationDays(): Promise<{
  timezone: string;
  days: Record<string, { bookable: boolean; hover: string }>;
}> {
  await ensureDomRozhdestvaSlots();
  const tz = getExhibitionTimezone();
  const now = new Date();
  const slots = await prisma.slot.findMany({
    where: {
      active: true,
      kind: DOM_ROZHDESTVA_SLOT_KIND,
      giftOpenDate: false,
      registrationOpen: true,
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, capacity: true, startsAt: true },
  });
  const stats = await slotOrderLineStatsMap(slots.map((s) => s.id));
  const days: Record<string, { bookable: boolean; hover: string }> = {};

  for (const s of slots) {
    const dk = dateKeyInTz(s.startsAt, tz);
    if (isWallCalendarDayBeforeToday(dk, tz, now)) continue;
    if (isWallSessionTimeBeforeNow(dk, timeKeyInTz(s.startsAt, tz), tz, now)) continue;
    const st = stats.get(s.id)!;
    const reserved = st.soldPaid + st.pendingReserved;
    const bookable = s.capacity == null || s.capacity - reserved > 0;
    const prev = days[dk];
    if (!prev) {
      days[dk] = { bookable, hover: bookable ? "" : "На этот день билетов нет" };
    } else if (bookable) {
      prev.bookable = true;
      prev.hover = "";
    }
  }
  return { timezone: tz, days };
}

export async function listPrintRegistrationTimes(date: string): Promise<{
  timezone: string;
  date: string;
  times: string[];
}> {
  await ensureDomRozhdestvaSlots();
  const tz = getExhibitionTimezone();
  if (isWallCalendarDayBeforeToday(date, tz)) {
    return { timezone: tz, date, times: [] };
  }
  const range = wallDayUtcRange(date, tz);
  if (!range) return { timezone: tz, date, times: [] };

  const slots = await prisma.slot.findMany({
    where: {
      active: true,
      kind: DOM_ROZHDESTVA_SLOT_KIND,
      giftOpenDate: false,
      registrationOpen: true,
      startsAt: { gte: range.start, lte: range.end },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, capacity: true, startsAt: true },
  });
  const stats = await slotOrderLineStatsMap(slots.map((s) => s.id));
  const times: string[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    const st = stats.get(s.id)!;
    const reserved = st.soldPaid + st.pendingReserved;
    if (s.capacity != null && s.capacity - reserved <= 0) continue;
    const tk = timeKeyInTz(s.startsAt, tz);
    if (seen.has(tk)) continue;
    if (isWallSessionTimeBeforeNow(date, tk, tz)) continue;
    seen.add(tk);
    times.push(tk);
  }
  return { timezone: tz, date, times };
}
