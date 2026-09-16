import type { OrderStatus, TicketTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reportTicketsWhereForDay } from "@/lib/admin-day-ticket-filter";
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

/** Строка отчёта: тип билета или промокод. */
export type SalesReportRow = {
  key: string;
  label: string;
  kind: "tier" | "promo";
  /** Лимит именно этой строки (у промокода — maxUses); null — отдельного лимита нет. */
  quota: number | null;
  reserved: number;
  sold: number;
  refunded: number;
};

export type SalesReport = {
  /** Типы билетов, затем промокоды. Промокоды — разрез продаж, а не дополнение к типам. */
  rows: SalesReportRow[];
  totals: {
    /** Сумма capacity сеансов дня; null — ни у одного сеанса лимита нет. */
    quota: number | null;
    /** Среди сеансов дня есть хотя бы один без лимита мест. */
    quotaHasUnlimited: boolean;
    reserved: number;
    sold: number;
    refunded: number;
  };
};

export type SalesStatsResult = {
  timezone: string;
  date: string;
  slotId: string | null;
  slotKind: string | null;
  sold: TierSoldCounts;
  bySlot: SalesStatsBySlot[];
  report: SalesReport;
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

type ReportCell = { reserved: number; sold: number; refunded: number };

function emptyCell(): ReportCell {
  return { reserved: 0, sold: 0, refunded: 0 };
}

function bumpCell(cell: ReportCell, status: OrderStatus, refunded: boolean) {
  if (refunded) cell.refunded += 1;
  else if (status === "PAID") cell.sold += 1;
  else if (status === "PENDING") cell.reserved += 1;
}

const TIER_ROWS: { key: string; label: string; tier: TicketTier | null }[] = [
  { key: "tier:ADULT", label: "Взрослый", tier: "ADULT" },
  { key: "tier:CHILD", label: "Детский", tier: "CHILD" },
  { key: "tier:CONCESSION", label: "Льготный", tier: "CONCESSION" },
];

function tierKey(tier: TicketTier | null): string {
  return tier ? `tier:${tier}` : "tier:UNKNOWN";
}

export async function querySalesStats(params: {
  dateYmd: string;
  slotId?: string | null;
  slotKind?: string | null;
}): Promise<SalesStatsResult | { error: "INVALID_DATE" }> {
  const tz = getExhibitionTimezone();
  const range = wallDayUtcRange(params.dateYmd, tz);
  if (!range) return { error: "INVALID_DATE" };

  const slotId = params.slotId?.trim() || null;
  const slotKind = params.slotKind?.trim() || null;

  const [tickets, slots] = await Promise.all([
    prisma.ticket.findMany({
      where: reportTicketsWhereForDay(range, slotId, slotKind),
      select: {
        tier: true,
        refundedAt: true,
        order: {
          select: {
            status: true,
            slotId: true,
            slot: { select: { title: true, startsAt: true } },
            clubPromoCode: true,
            promoCode: { select: { code: true, maxUses: true } },
          },
        },
      },
    }),
    prisma.slot.findMany({
      where: {
        startsAt: { gte: range.start, lte: range.end },
        ...(slotKind ? { kind: slotKind } : {}),
        ...(slotId ? { id: slotId } : {}),
      },
      select: { capacity: true },
    }),
  ]);

  const sold = emptyTierCounts();
  const slotMap = new Map<string, SalesStatsBySlot & { startsAt: Date }>();
  const tierCells = new Map<string, ReportCell>();
  const promoCells = new Map<string, ReportCell & { label: string; quota: number | null }>();

  for (const t of tickets) {
    const status = t.order.status;
    const refunded = t.refundedAt != null;

    const tKey = tierKey(t.tier);
    let tierCell = tierCells.get(tKey);
    if (!tierCell) {
      tierCell = emptyCell();
      tierCells.set(tKey, tierCell);
    }
    bumpCell(tierCell, status, refunded);

    const promoLabel = t.order.promoCode?.code ?? t.order.clubPromoCode;
    if (promoLabel) {
      let promoCell = promoCells.get(promoLabel);
      if (!promoCell) {
        promoCell = {
          ...emptyCell(),
          label: promoLabel,
          quota: t.order.promoCode?.maxUses ?? null,
        };
        promoCells.set(promoLabel, promoCell);
      }
      bumpCell(promoCell, status, refunded);
    }

    if (status === "PAID" && !refunded) {
      addTier(sold, t.tier);
      if (!slotId) accumulateSalesSlot(slotMap, t);
    }
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

  const rows: SalesReportRow[] = TIER_ROWS.map((r) => {
    const cell = tierCells.get(r.key) ?? emptyCell();
    return { key: r.key, label: r.label, kind: "tier" as const, quota: null, ...cell };
  });

  const unknownCell = tierCells.get("tier:UNKNOWN");
  if (unknownCell) {
    rows.push({
      key: "tier:UNKNOWN",
      label: "Без типа",
      kind: "tier",
      quota: null,
      ...unknownCell,
    });
  }

  for (const [code, cell] of [...promoCells.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "ru"),
  )) {
    rows.push({
      key: `promo:${code}`,
      label: cell.label,
      kind: "promo",
      quota: cell.quota,
      reserved: cell.reserved,
      sold: cell.sold,
      refunded: cell.refunded,
    });
  }

  let quotaSum = 0;
  let quotaHasUnlimited = false;
  let quotaHasLimit = false;
  for (const s of slots) {
    if (s.capacity == null) quotaHasUnlimited = true;
    else {
      quotaHasLimit = true;
      quotaSum += s.capacity;
    }
  }

  const totals = rows
    .filter((r) => r.kind === "tier")
    .reduce(
      (acc, r) => ({
        reserved: acc.reserved + r.reserved,
        sold: acc.sold + r.sold,
        refunded: acc.refunded + r.refunded,
      }),
      { reserved: 0, sold: 0, refunded: 0 },
    );

  return {
    timezone: tz,
    date: params.dateYmd,
    slotId,
    slotKind,
    sold,
    bySlot,
    report: {
      rows,
      totals: {
        quota: quotaHasLimit ? quotaSum : null,
        quotaHasUnlimited,
        ...totals,
      },
    },
  };
}
