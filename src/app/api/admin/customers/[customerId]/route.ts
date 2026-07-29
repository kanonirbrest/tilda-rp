import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { formatDisplayDateTime } from "@/lib/format-display-datetime";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

/**
 * Карточка пользователя + история заказов для /users.
 * Источник: анкета (нет заказов) / билеты; «из бота» — если в заказе есть clubPromoTelegramUserId.
 */
export async function GET(req: Request, ctx: { params: Promise<{ customerId: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { customerId } = await ctx.params;
  if (!customerId?.trim()) {
    return jsonWithCors(req, { message: "Не указан customerId" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          slot: { select: { id: true, kind: true, title: true, startsAt: true } },
          lines: { select: { tier: true, quantity: true, unitPriceCents: true } },
          tickets: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              tier: true,
              admissionCount: true,
              seatLabel: true,
              usedAt: true,
              refundedAt: true,
            },
          },
          promoCode: { select: { code: true } },
        },
      },
    },
  });

  if (!customer) {
    return jsonWithCors(req, { message: "Пользователь не найден" }, { status: 404 });
  }

  const botTelegramIds = [
    ...new Set(
      customer.orders
        .map((o) => o.clubPromoTelegramUserId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const fromBot = botTelegramIds.length > 0;
  const source = customer.orders.length === 0 ? "anketa" : "tickets";

  return jsonWithCors(req, {
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      createdAt: formatDisplayDateTime(customer.createdAt.toISOString()),
      createdAtIso: customer.createdAt.toISOString(),
      ordersCount: customer.orders.length,
      source,
      fromBot,
      botTelegramUserIds: botTelegramIds,
    },
    orders: customer.orders.map((o) => ({
      id: o.id,
      status: o.status,
      createdAt: formatDisplayDateTime(o.createdAt.toISOString()),
      paidAt: o.paidAt != null ? formatDisplayDateTime(o.paidAt.toISOString()) : null,
      amountCents: o.amountCents,
      discountCents: o.discountCents,
      refundedCents: o.refundedCents,
      currency: o.currency,
      promoCode: o.promoCode?.code ?? o.clubPromoCode ?? null,
      clubPromoTelegramUserId: o.clubPromoTelegramUserId ?? null,
      fromBot: Boolean(o.clubPromoTelegramUserId?.trim()),
      slot: {
        id: o.slot.id,
        kind: o.slot.kind,
        title: o.slot.title,
        startsAt: formatDisplayDateTime(o.slot.startsAt.toISOString()),
      },
      lines: o.lines.map((l) => ({
        tier: l.tier,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
      tickets: o.tickets.map((t) => ({
        id: t.id,
        tier: t.tier,
        admissionCount: t.admissionCount,
        seatLabel: t.seatLabel,
        usedAt: t.usedAt != null ? formatDisplayDateTime(t.usedAt.toISOString()) : null,
        refundedAt: t.refundedAt != null ? formatDisplayDateTime(t.refundedAt.toISOString()) : null,
      })),
    })),
  });
}
