import { prisma } from "@/lib/prisma";

export const CUSTOMERS_EXPORT_HEADER = [
  "customer_id",
  "name",
  "email",
  "phone",
  "customer_created_at",
  "source",
  "from_bot",
  "orders_total",
  "orders_paid",
  "orders_pending",
  "orders_failed",
  "orders_cancelled",
  "orders_refunded",
  "tickets_in_paid_orders",
  "net_paid_cents",
  "refunded_cents_total",
  "first_order_at",
  "last_order_at",
  "last_paid_at",
  "last_slot_title",
] as const;

export type CustomerExportCell = string | number;

function iso(d: Date | null): string {
  return d ? d.toISOString() : "";
}

/** Строки таблицы выгрузки покупателей (без заголовка). */
export async function buildCustomerExportRows(): Promise<CustomerExportCell[][]> {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      orders: {
        select: {
          status: true,
          amountCents: true,
          refundedCents: true,
          createdAt: true,
          paidAt: true,
          clubPromoTelegramUserId: true,
          slot: { select: { title: true } },
          _count: { select: { tickets: true } },
        },
      },
    },
  });

  const rows: CustomerExportCell[][] = [];

  for (const c of customers) {
    let ordersPaid = 0;
    let ordersPending = 0;
    let ordersFailed = 0;
    let ordersCancelled = 0;
    let ordersRefunded = 0;
    let netPaidCents = 0;
    let refundedCentsTotal = 0;
    let ticketsInPaidOrders = 0;
    let fromBot = false;

    let firstOrderAt: Date | null = null;
    let lastOrderAt: Date | null = null;
    let lastPaidAt: Date | null = null;
    let lastSlotTitle = "";

    const sortedForLast = [...c.orders].sort((a, b) => {
      const ap = a.paidAt?.getTime() ?? 0;
      const bp = b.paidAt?.getTime() ?? 0;
      if (bp !== ap) return bp - ap;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const lastOrder = sortedForLast[0];
    if (lastOrder?.slot?.title) lastSlotTitle = lastOrder.slot.title;

    for (const o of c.orders) {
      if (o.clubPromoTelegramUserId?.trim()) fromBot = true;
      if (!firstOrderAt || o.createdAt < firstOrderAt) firstOrderAt = o.createdAt;
      if (!lastOrderAt || o.createdAt > lastOrderAt) lastOrderAt = o.createdAt;

      switch (o.status) {
        case "PAID":
          ordersPaid += 1;
          netPaidCents += o.amountCents - o.refundedCents;
          refundedCentsTotal += o.refundedCents;
          ticketsInPaidOrders += o._count.tickets;
          if (!lastPaidAt || (o.paidAt && o.paidAt > lastPaidAt)) lastPaidAt = o.paidAt;
          break;
        case "PENDING":
          ordersPending += 1;
          break;
        case "FAILED":
          ordersFailed += 1;
          break;
        case "CANCELLED":
          ordersCancelled += 1;
          break;
        case "REFUNDED":
          ordersRefunded += 1;
          refundedCentsTotal += o.refundedCents;
          if (o.paidAt && (!lastPaidAt || o.paidAt > lastPaidAt)) lastPaidAt = o.paidAt;
          break;
        default:
          break;
      }
    }

    const source = c.orders.length === 0 ? "anketa" : "tickets";

    rows.push([
      c.id,
      c.name,
      c.email,
      c.phone,
      iso(c.createdAt),
      source,
      fromBot ? "yes" : "no",
      c.orders.length,
      ordersPaid,
      ordersPending,
      ordersFailed,
      ordersCancelled,
      ordersRefunded,
      ticketsInPaidOrders,
      netPaidCents,
      refundedCentsTotal,
      iso(firstOrderAt),
      iso(lastOrderAt),
      iso(lastPaidAt),
      lastSlotTitle,
    ]);
  }

  return rows;
}
