import { type OrderStatus, type TicketTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reportTicketsWhereForDay } from "@/lib/admin-day-ticket-filter";
import { dateKeyInTz, getExhibitionTimezone, timeKeyInTz, wallDaysUtcRange } from "@/lib/exhibition-time";

/** Верхняя граница отчёта, чтобы не выгружать всю историю одним запросом. */
const STATS_RANGE_MAX_DAYS = 366;

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
  /** Календарный день сеанса в поясе выставки. */
  dateKey: string;
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

/** Деньги по оплаченным заказам периода. Считается по заказу, а не по строке типа билета. */
export type SalesRevenue = {
  currency: string;
  /** Сумма оплат (PAID и REFUNDED), до вычета возвратов. */
  paidCents: number;
  /** Уже возвращено покупателям. */
  refundedCents: number;
  /** paidCents − refundedCents: сколько осталось с продаж. */
  netCents: number;
};

export type SalesStatsResult = {
  timezone: string;
  /** Начало периода. Совпадает с dateFrom. */
  date: string;
  dateFrom: string;
  dateTo: string;
  slotId: string | null;
  slotKind: string | null;
  sold: TierSoldCounts;
  bySlot: SalesStatsBySlot[];
  report: SalesReport;
  revenue: SalesRevenue[];
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
      dateKey: "",
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
  /** Один день. Используется, если не заданы fromYmd/toYmd. */
  dateYmd?: string | null;
  fromYmd?: string | null;
  toYmd?: string | null;
  slotId?: string | null;
  slotKind?: string | null;
}): Promise<SalesStatsResult | { error: "INVALID_DATE" | "RANGE_TOO_LONG" }> {
  const tz = getExhibitionTimezone();
  const fromYmd = params.fromYmd?.trim() || params.dateYmd?.trim() || "";
  const toYmd = params.toYmd?.trim() || fromYmd;
  const range = fromYmd ? wallDaysUtcRange(fromYmd, toYmd, tz) : null;
  if (!range) return { error: "INVALID_DATE" };
  if (range.dayCount > STATS_RANGE_MAX_DAYS) return { error: "RANGE_TOO_LONG" };

  const slotId = params.slotId?.trim() || null;
  const slotKind = params.slotKind?.trim() || null;

  const paidStatuses: OrderStatus[] = ["PAID", "REFUNDED"];
  const orderWhere = {
    status: { in: paidStatuses },
    slot: {
      startsAt: { gte: range.start, lte: range.end },
      ...(slotKind ? { kind: slotKind } : {}),
      ...(slotId ? { id: slotId } : {}),
    },
  };

  const [tickets, slots, paidOrders] = await Promise.all([
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
    prisma.order.findMany({
      where: orderWhere,
      select: { amountCents: true, refundedCents: true, currency: true },
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
      dateKey: dateKeyInTz(row.startsAt, tz),
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

  const revenueByCurrency = new Map<string, { paidCents: number; refundedCents: number }>();
  for (const order of paidOrders) {
    const currency = order.currency?.trim() || "BYN";
    const bucket = revenueByCurrency.get(currency) ?? { paidCents: 0, refundedCents: 0 };
    bucket.paidCents += order.amountCents;
    bucket.refundedCents += Math.max(0, order.refundedCents);
    revenueByCurrency.set(currency, bucket);
  }
  const revenue: SalesRevenue[] =
    revenueByCurrency.size > 0 ?
      [...revenueByCurrency.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([currency, bucket]) => ({
          currency,
          paidCents: bucket.paidCents,
          refundedCents: bucket.refundedCents,
          netCents: Math.max(0, bucket.paidCents - bucket.refundedCents),
        }))
    : [{ currency: "BYN", paidCents: 0, refundedCents: 0, netCents: 0 }];

  return {
    timezone: tz,
    date: range.from,
    dateFrom: range.from,
    dateTo: range.to,
    slotId,
    slotKind,
    sold,
    bySlot,
    revenue,
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
