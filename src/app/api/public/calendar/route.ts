import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireStalePendingOrders } from "@/lib/expire-pending-orders";
import { dateKeyInTz, getExhibitionTimezone } from "@/lib/exhibition-time";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { normalizeSlotKind } from "@/lib/slot-kind";
import { slotOrderLineStatsMap } from "@/lib/slot-order-line-stats";

type DayAgg = {
  bookable: boolean;
};

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/** Сводка по календарным дням: доступность и текст подсказки только если билетов на день нет. */
export async function GET(req: Request) {
  await expireStalePendingOrders();
  const { searchParams } = new URL(req.url);
  const slotKind = normalizeSlotKind(searchParams.get("kind"));

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
      a = { bookable: false };
      byDay.set(dk, a);
    }
    return a;
  }

  for (const s of slots) {
    const dk = dateKeyInTz(s.startsAt, tz);
    const st = stats.get(s.id)!;
    const reserved = st.soldPaid + st.pendingReserved;
    const agg = ensure(dk);

    if (s.capacity == null) {
      agg.bookable = true;
    } else if (s.capacity - reserved > 0) {
      agg.bookable = true;
    }
  }

  const days: Record<string, { bookable: boolean; hover: string }> = {};

  for (const [date, agg] of byDay) {
    const hover = agg.bookable ? "" : "На этот день билетов нет";
    days[date] = { bookable: agg.bookable, hover };
  }

  return jsonPublicReadResponse(req, { timezone: tz, kind: slotKind, days }, 200);
}
