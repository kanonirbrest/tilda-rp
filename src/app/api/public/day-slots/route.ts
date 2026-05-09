import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireStalePendingOrders } from "@/lib/expire-pending-orders";
import { getExhibitionTimezone, timeKeyInTz, wallDayUtcRange } from "@/lib/exhibition-time";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import {
  formatNightSessionRangeForUi,
  parseNightOfMuseumsTimeRangeFromTitle,
} from "@/lib/night-of-museums-session";
import { NIGHT_OF_MUSEUMS_SLOT_KIND, normalizeSlotKind } from "@/lib/slot-kind";
import { slotOrderLineStatsMap } from "@/lib/slot-order-line-stats";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/**
 * Список времён (HH:MM в часовом поясе выставки), на которые есть хотя бы один
 * активный слот с оставшимися местами (или без лимита мест).
 */
export async function GET(req: Request) {
  await expireStalePendingOrders();

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date")?.trim() ?? "";
  const slotKind = normalizeSlotKind(searchParams.get("kind"));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonPublicReadResponse(
      req,
      { error: "DATE_REQUIRED", hint: "Укажите date в формате YYYY-MM-DD" },
      400,
    );
  }

  const tz = getExhibitionTimezone();
  const range = wallDayUtcRange(date, tz);
  if (!range) {
    return jsonPublicReadResponse(req, { error: "DATE_INVALID", hint: "Некорректная дата" }, 400);
  }

  const slots = await prisma.slot.findMany({
    where: {
      active: true,
      kind: slotKind,
      startsAt: { gte: range.start, lte: range.end },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, capacity: true, startsAt: true, title: true },
  });

  const stats = await slotOrderLineStatsMap(slots.map((s) => s.id));
  const seen = new Set<string>();
  const times: string[] = [];
  /** Для NIGHT_OF_MUSEUMS: HH:MM начала → подпись диапазона из title слота («21:00 - 00:00»). */
  const sessionLabels: Record<string, string> = {};

  for (const s of slots) {
    const st = stats.get(s.id)!;
    const reserved = st.soldPaid + st.pendingReserved;
    const bookable = s.capacity == null || s.capacity - reserved > 0;
    if (!bookable) continue;

    const tk = timeKeyInTz(s.startsAt, tz);
    if (seen.has(tk)) continue;
    seen.add(tk);
    times.push(tk);

    if (slotKind === NIGHT_OF_MUSEUMS_SLOT_KIND) {
      const parsed = parseNightOfMuseumsTimeRangeFromTitle(s.title);
      if (parsed) sessionLabels[tk] = formatNightSessionRangeForUi(parsed);
    }
  }

  const payload: {
    timezone: string;
    date: string;
    kind: string;
    times: string[];
    sessionLabels?: Record<string, string>;
  } = { timezone: tz, date, kind: slotKind, times };
  if (slotKind === NIGHT_OF_MUSEUMS_SLOT_KIND && Object.keys(sessionLabels).length > 0) {
    payload.sessionLabels = sessionLabels;
  }

  return jsonPublicReadResponse(req, payload, 200);
}
