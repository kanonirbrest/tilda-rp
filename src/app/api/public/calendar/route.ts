import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireStalePendingOrders } from "@/lib/expire-pending-orders";
import { dateKeyInTz, getExhibitionTimezone } from "@/lib/exhibition-time";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";

async function slotStatsMap(slotIds: string[]) {
  const map = new Map<string, { soldPaid: number; pendingReserved: number }>();
  for (const id of slotIds) map.set(id, { soldPaid: 0, pendingReserved: 0 });
  if (slotIds.length === 0) return map;

  const rows = await prisma.orderLine.findMany({
    where: {
      order: {
        slotId: { in: slotIds },
        status: { in: ["PAID", "PENDING"] },
      },
    },
    select: {
      quantity: true,
      order: { select: { status: true, slotId: true } },
    },
  });
  for (const row of rows) {
    const sid = row.order.slotId;
    const m = map.get(sid);
    if (!m) continue;
    if (row.order.status === "PAID") m.soldPaid += row.quantity;
    else m.pendingReserved += row.quantity;
  }
  return map;
}

type DayAgg = {
  finiteLeft: number;
  finiteTotal: number;
  anyUnlimited: boolean;
  bookable: boolean;
};

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/** Сводка по календарным дням: доступность и текст для подсказки (остаток билетов). */
export async function GET(req: Request) {
  await expireStalePendingOrders();

  const slots = await prisma.slot.findMany({
    where: { active: true },
    orderBy: { startsAt: "asc" },
    select: { id: true, capacity: true, startsAt: true },
  });

  const tz = getExhibitionTimezone();
  const stats = await slotStatsMap(slots.map((s) => s.id));

  const byDay = new Map<string, DayAgg>();

  function ensure(dk: string): DayAgg {
    let a = byDay.get(dk);
    if (!a) {
      a = { finiteLeft: 0, finiteTotal: 0, anyUnlimited: false, bookable: false };
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
      agg.anyUnlimited = true;
      agg.bookable = true;
    } else {
      agg.finiteTotal += s.capacity;
      agg.finiteLeft += Math.max(0, s.capacity - reserved);
      if (s.capacity - reserved > 0) agg.bookable = true;
    }
  }

  const days: Record<string, { bookable: boolean; hover: string }> = {};

  for (const [date, agg] of byDay) {
    let hover: string;
    if (!agg.bookable) {
      hover = "Нет доступных билетов на эту дату";
    } else if (agg.finiteTotal > 0) {
      hover = `Осталось ${agg.finiteLeft} из ${agg.finiteTotal}`;
      if (agg.anyUnlimited) hover += " · также есть сеансы без лимита мест";
    } else {
      hover = "Места доступны";
    }
    days[date] = { bookable: agg.bookable, hover };
  }

  return jsonPublicReadResponse(req, { timezone: tz, days }, 200);
}
