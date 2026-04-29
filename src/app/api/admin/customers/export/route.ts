import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, requireAdmin } from "@/lib/admin-api";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function iso(d: Date | null): string {
  return d ? d.toISOString() : "";
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

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
          slot: { select: { title: true } },
          _count: { select: { tickets: true } },
        },
      },
    },
  });

  const header = [
    "id",
    "name",
    "email",
    "phone",
    "customer_created_at",
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
  ];

  const rows: string[][] = [header];

  for (const c of customers) {
    let ordersPaid = 0;
    let ordersPending = 0;
    let ordersFailed = 0;
    let ordersCancelled = 0;
    let ordersRefunded = 0;
    let netPaidCents = 0;
    let refundedCentsTotal = 0;
    let ticketsInPaidOrders = 0;

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

    rows.push([
      c.id,
      c.name,
      c.email,
      c.phone,
      iso(c.createdAt),
      String(c.orders.length),
      String(ordersPaid),
      String(ordersPending),
      String(ordersFailed),
      String(ordersCancelled),
      String(ordersRefunded),
      String(ticketsInPaidOrders),
      String(netPaidCents),
      String(refundedCentsTotal),
      iso(firstOrderAt),
      iso(lastOrderAt),
      iso(lastPaidAt),
      lastSlotTitle,
    ].map((cell) => csvEscape(cell)));
  }

  const body =
    "\uFEFF" +
    rows.map((line) => line.join(",")).join("\r\n") +
    "\r\n";

  const day = new Date().toISOString().slice(0, 10);
  const filename = `customers-export-${day}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      ...adminCorsHeaders(req),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
