import type { TicketTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { paidActiveTicketsWhereForDay } from "@/lib/admin-day-ticket-filter";
import { getExhibitionTimezone, timeKeyInTz, wallDayUtcRange } from "@/lib/exhibition-time";

export type TierSoldCounts = {
  adult: number;
  child: number;
  concession: number;
  /** Старые билеты без tier в БД. */
  unknown: number;
  total: number;
};

export type SalesStatsBySlot = {
  slotId: string;
  title: string;
  timeKey: string;
  adult: number;
  child: number;
  concession: number;
  unknown: number;
  total: number;
};

export type SalesStatsResult = {
  timezone: string;
  date: string;
  slotId: string | null;
  sold: TierSoldCounts;
  bySlot: SalesStatsBySlot[];
};

function emptyTierCounts(): TierSoldCounts {
  return { adult: 0, child: 0, concession: 0, unknown: 0, total: 0 };
}

function addTier(counts: TierSoldCounts, tier: TicketTier | null) {
  counts.total += 1;
  if (tier === "ADULT") counts.adult += 1;
  else if (tier === "CHILD") counts.child += 1;
  else if (tier === "CONCESSION") counts.concession += 1;
  else counts.unknown += 1;
}

type SalesTicketRow = {
  tier: TicketTier | null;
  order: {
    slotId: string;
    slot: { title: string; startsAt: Date };
  };
};

function accumulateSalesSlot(
  map: Map<string, SalesStatsBySlot & { startsAt: Date }>,
  t: SalesTicketRow,
) {
  const sid = t.order.slotId;
  let row = map.get(sid);
  if (!row) {
    row = {
      slotId: sid,
      title: t.order.slot.title,
      timeKey: "",
      startsAt: t.order.slot.startsAt,
      adult: 0,
      child: 0,
      concession: 0,
      unknown: 0,
      total: 0,
    };
    map.set(sid, row);
  }
  row.total += 1;
  if (t.tier === "ADULT") row.adult += 1;
  else if (t.tier === "CHILD") row.child += 1;
  else if (t.tier === "CONCESSION") row.concession += 1;
  else row.unknown += 1;
}

export async function querySalesStats(params: {
  dateYmd: string;
  slotId?: string | null;
}): Promise<SalesStatsResult | { error: "INVALID_DATE" }> {
  const tz = getExhibitionTimezone();
  const range = wallDayUtcRange(params.dateYmd, tz);
  if (!range) return { error: "INVALID_DATE" };

  const slotId = params.slotId?.trim() || null;
  const tickets = await prisma.ticket.findMany({
    where: paidActiveTicketsWhereForDay(range, slotId),
    select: {
      tier: true,
      order: {
        select: {
          slotId: true,
          slot: { select: { title: true, startsAt: true } },
        },
      },
    },
  });

  const sold = emptyTierCounts();
  const slotMap = new Map<string, SalesStatsBySlot & { startsAt: Date }>();

  for (const t of tickets) {
    addTier(sold, t.tier);
    if (!slotId) accumulateSalesSlot(slotMap, t);
  }

  const bySlot = [...slotMap.values()]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((row) => ({
      slotId: row.slotId,
      title: row.title,
      timeKey: timeKeyInTz(row.startsAt, tz),
      adult: row.adult,
      child: row.child,
      concession: row.concession,
      unknown: row.unknown,
      total: row.total,
    }));

  return {
    timezone: tz,
    date: params.dateYmd,
    slotId,
    sold,
    bySlot,
  };
}
