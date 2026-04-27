import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

type VisitState = "na" | "not_visited" | "partial" | "visited";

function visitMeta(
  status: OrderStatus,
  tickets: { usedAt: Date | null }[],
): { visitState: VisitState; visitedAt: string | null } {
  if (status !== "PAID") {
    return { visitState: "na", visitedAt: null };
  }
  if (tickets.length === 0) {
    return { visitState: "not_visited", visitedAt: null };
  }
  const used = tickets.filter((t) => t.usedAt != null);
  if (used.length === 0) {
    return { visitState: "not_visited", visitedAt: null };
  }
  if (used.length === tickets.length) {
    const maxMs = Math.max(...used.map((t) => t.usedAt!.getTime()));
    return { visitState: "visited", visitedAt: new Date(maxMs).toISOString() };
  }
  return { visitState: "partial", visitedAt: null };
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "200", 10) || 200));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  const [total, rows] = await Promise.all([
    prisma.order.count(),
    prisma.order.findMany({
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
          select: { id: true, usedAt: true, admissionCount: true, tier: true },
        },
      },
    }),
  ]);

  const orders = rows.map((o) => {
    const { visitState, visitedAt } = visitMeta(o.status, o.tickets);
    return {
      id: o.id,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
      subtotalCents: o.subtotalCents,
      discountCents: o.discountCents,
      amountCents: o.amountCents,
      currency: o.currency,
      promoCode: o.promoCode?.code ?? null,
      visitState,
      visitedAt,
      tickets: o.tickets.map((t) => ({
        id: t.id,
        tier: t.tier,
        admissionCount: t.admissionCount,
        usedAt: t.usedAt?.toISOString() ?? null,
      })),
      customer: {
        name: o.customer.name,
        email: o.customer.email,
        phone: o.customer.phone,
      },
      slot: {
        id: o.slot.id,
        title: o.slot.title,
        startsAt: o.slot.startsAt.toISOString(),
      },
      lines: o.lines.map((l) => ({
        tier: l.tier,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
    };
  });

  return jsonWithCors(req, { total, limit, offset, orders });
}
