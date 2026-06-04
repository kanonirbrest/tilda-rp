import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireStalePendingOrders } from "@/lib/expire-pending-orders";
import {
  dateKeyInTz,
  getExhibitionTimezone,
  isWallCalendarDayBeforeToday,
  isWallSessionTimeBeforeNow,
  timeKeyInTz,
} from "@/lib/exhibition-time";
import { jsonPublicApiError } from "@/lib/public-api-error";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { normalizeSlotKind } from "@/lib/slot-kind";
import { slotOrderLineStatsMap } from "@/lib/slot-order-line-stats";

type DayAgg = {
  bookable: boolean;
  /** ISO UTC — начало последнего по времени сеанса в этот календарный день */
  lastSlotStartsAt: Date | null;
};

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/** Сводка по календарным дням: доступность и текст подсказки только если билетов на день нет. */
export async function GET(req: Request) {
  try {
    await expireStalePendingOrders();
    const { searchParams } = new URL(req.url);
    const slotKind = normalizeSlotKind(searchParams.get("kind"));
    const hidePastTimes =
      searchParams.get("hidePastTimes") === "1" ||
      searchParams.get("hidePastTimes")?.toLowerCase() === "true";
    const now = new Date();

    const slots = await prisma.slot.findMany({
      where: { active: true, kind: slotKind },
      orderBy: { startsAt: "asc" },
      select: { id: true, capacity: true, startsAt: true },
    });

    const tz = getExhibitionTimezone();
    const stats = await slotOrderLineStatsMap(slots.map((s) => s.id));

    const byDay = new Map<string, DayAgg>();

    function ensure(dk: string): DayAgg {
      let a = byDay.get(dk);
      if (!a) {
        a = { bookable: false, lastSlotStartsAt: null };
        byDay.set(dk, a);
      }
      return a;
    }

    for (const s of slots) {
      const dk = dateKeyInTz(s.startsAt, tz);
      if (hidePastTimes) {
        if (isWallCalendarDayBeforeToday(dk, tz, now)) continue;
        if (isWallSessionTimeBeforeNow(dk, timeKeyInTz(s.startsAt, tz), tz, now)) continue;
      }
      const st = stats.get(s.id)!;
      const reserved = st.soldPaid + st.pendingReserved;
      const agg = ensure(dk);
      if (!agg.lastSlotStartsAt || s.startsAt > agg.lastSlotStartsAt) {
        agg.lastSlotStartsAt = s.startsAt;
      }

      if (s.capacity == null) {
        agg.bookable = true;
      } else if (s.capacity - reserved > 0) {
        agg.bookable = true;
      }
    }

    const days: Record<string, { bookable: boolean; hover: string; lastSlotStartsAt?: string }> =
      {};

    for (const [date, agg] of byDay) {
      const hover = agg.bookable ? "" : "На этот день билетов нет";
      days[date] = {
        bookable: agg.bookable,
        hover,
        ...(agg.lastSlotStartsAt ? { lastSlotStartsAt: agg.lastSlotStartsAt.toISOString() } : {}),
      };
    }

    return jsonPublicReadResponse(req, { timezone: tz, kind: slotKind, days }, 200);
  } catch (err) {
    return jsonPublicApiError(req, err);
  }
}
