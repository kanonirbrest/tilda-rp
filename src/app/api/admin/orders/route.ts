import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { dateKeyInTz, getExhibitionTimezone, wallDayUtcRange } from "@/lib/exhibition-time";
import { formatDisplayDateTime } from "@/lib/format-display-datetime";
import { parseOptionalSlotKind } from "@/lib/slot-kind";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

type VisitState = "na" | "not_visited" | "partial" | "visited";

function visitMeta(
  status: OrderStatus,
  tickets: { usedAt: Date | null; refundedAt: Date | null }[],
): { visitState: VisitState; visitedAt: string | null } {
  if (status !== "PAID") {
    return { visitState: "na", visitedAt: null };
  }
  const active = tickets.filter((t) => t.refundedAt == null);
  if (active.length === 0) {
    return { visitState: "na", visitedAt: null };
  }
  const used = active.filter((t) => t.usedAt != null);
  if (used.length === 0) {
    return { visitState: "not_visited", visitedAt: null };
  }
  if (used.length === active.length) {
    const maxMs = Math.max(...used.map((t) => t.usedAt!.getTime()));
    return { visitState: "visited", visitedAt: formatDisplayDateTime(new Date(maxMs).toISOString()) };
  }
  return { visitState: "partial", visitedAt: null };
}

async function orderFilterFacets(
  tz: string,
  slotKind: string | null,
): Promise<{ kinds: string[]; dates: string[] }> {
  const [allKindsSlots, dateSlots] = await Promise.all([
    prisma.slot.findMany({
      where: { orders: { some: {} } },
      select: { kind: true },
      distinct: ["kind"],
    }),
    prisma.slot.findMany({
      where: {
        orders: { some: {} },
        ...(slotKind ? { kind: slotKind } : {}),
      },
      select: { startsAt: true },
    }),
  ]);
  const dates = new Set<string>();
  for (const s of dateSlots) {
    dates.add(dateKeyInTz(s.startsAt, tz));
  }
  return {
    kinds: allKindsSlots.map((s) => s.kind).sort(),
    dates: [...dates].sort().reverse(),
  };
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const limit = Math.min(2000, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "500", 10) || 500));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const slotKind = parseOptionalSlotKind(url.searchParams.get("kind"));
  const dateYmd = url.searchParams.get("date")?.trim() || "";
  const tz = getExhibitionTimezone();

  const slotWhere: Prisma.SlotWhereInput = {};
  if (slotKind) slotWhere.kind = slotKind;
  if (dateYmd) {
    const range = wallDayUtcRange(dateYmd, tz);
    if (!range) {
      return jsonWithCors(
        req,
        { error: "INVALID_DATE", hint: "date должен быть YYYY-MM-DD" },
        { status: 400 },
      );
    }
    slotWhere.startsAt = { gte: range.start, lte: range.end };
  }

  const where: Prisma.OrderWhereInput =
    Object.keys(slotWhere).length > 0 ? { slot: slotWhere } : {};

  const [total, rows, facets] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        slot: true,
        lines: true,
        promoCode: { select: { code: true } },
        tickets: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            publicToken: true,
            usedAt: true,
            refundedAt: true,
            admissionCount: true,
            tier: true,
            seatKey: true,
            seatLabel: true,
          },
        },
      },
    }),
    orderFilterFacets(tz, slotKind),
  ]);

  const bepaidRefundAvailable = Boolean(
    process.env.BEPAID_SHOP_ID?.trim() && process.env.BEPAID_SECRET_KEY?.trim(),
  );

  const orders = rows.map((o) => {
    const { visitState, visitedAt } = visitMeta(o.status, o.tickets);
    return {
      id: o.id,
      status: o.status,
      createdAt: formatDisplayDateTime(o.createdAt.toISOString()),
      paidAt: o.paidAt != null ? formatDisplayDateTime(o.paidAt.toISOString()) : null,
      refundedAt: o.refundedAt != null ? formatDisplayDateTime(o.refundedAt.toISOString()) : null,
      hasBepaidReference: Boolean(o.bepaidPaymentUid || o.bepaidUid),
      subtotalCents: o.subtotalCents,
      discountCents: o.discountCents,
      amountCents: o.amountCents,
      refundedCents: o.refundedCents,
      currency: o.currency,
      promoCode: o.promoCode?.code ?? o.clubPromoCode ?? null,
      clubPromoTelegramUserId: o.clubPromoTelegramUserId ?? null,
      visitState,
      visitedAt,
      tickets: o.tickets.map((t) => ({
        id: t.id,
        publicToken: t.publicToken,
        tier: t.tier,
        admissionCount: t.admissionCount,
        seatKey: t.seatKey,
        seatLabel: t.seatLabel,
        usedAt: t.usedAt != null ? formatDisplayDateTime(t.usedAt.toISOString()) : null,
        refundedAt: t.refundedAt != null ? formatDisplayDateTime(t.refundedAt.toISOString()) : null,
      })),
      customer: {
        name: o.customer.name,
        email: o.customer.email,
        phone: o.customer.phone,
      },
      slot: {
        id: o.slot.id,
        kind: o.slot.kind,
        title: o.slot.title,
        startsAt: formatDisplayDateTime(o.slot.startsAt.toISOString()),
        /** Календарный день сеанса в поясе выставки (для фильтра «на дату»). */
        dateKey: dateKeyInTz(o.slot.startsAt, tz),
      },
      lines: o.lines.map((l) => ({
        tier: l.tier,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
    };
  });

  return jsonWithCors(req, {
    total,
    limit,
    offset,
    truncated: offset + orders.length < total,
    bepaidRefundAvailable,
    facets,
    orders,
  });
}
