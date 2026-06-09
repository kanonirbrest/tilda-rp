import { PrismaClient } from "@prisma/client";
import { applyDevelopmentProductionDatabaseUrl } from "../src/lib/resolve-database-url";
import { formatDisplayDateTime } from "../src/lib/format-display-datetime";
import { pendingOrderTtlMinutes } from "../src/lib/expire-pending-orders";

applyDevelopmentProductionDatabaseUrl();

const orderId = process.argv[2]?.trim();
if (!orderId) {
  console.error("Usage: npx tsx scripts/inspect-order.ts <orderId>");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim() && !process.env.PRODUCTION_DATABASE_URL?.trim()) {
  console.error("Задайте DATABASE_URL или PRODUCTION_DATABASE_URL");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      slot: true,
      lines: true,
      promoCode: { select: { code: true } },
      tickets: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          tier: true,
          publicToken: true,
          usedAt: true,
          refundedAt: true,
        },
      },
    },
  });

  if (!order) {
    console.log(JSON.stringify({ found: false, orderId }, null, 2));
    return;
  }

  const ttlMin = pendingOrderTtlMinutes();
  const cancelAfter = new Date(order.createdAt.getTime() + ttlMin * 60 * 1000);
  const reachedBepaid = Boolean(order.bepaidUid || order.bepaidPaymentUid);

  const receipt = order.bepaidUid
    ? await prisma.webhookReceipt.findFirst({
        where: { provider: "bepaid", externalId: order.bepaidUid },
        select: { createdAt: true },
      })
    : null;

  console.log(
    JSON.stringify(
      {
        found: true,
        id: order.id,
        status: order.status,
        createdAt: formatDisplayDateTime(order.createdAt.toISOString()),
        createdAtIso: order.createdAt.toISOString(),
        paidAt: order.paidAt ? formatDisplayDateTime(order.paidAt.toISOString()) : null,
        cancelledAfterApprox: formatDisplayDateTime(cancelAfter.toISOString()),
        pendingTtlMinutes: ttlMin,
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        amountCents: order.amountCents,
        currency: order.currency,
        bepaidUid: order.bepaidUid,
        bepaidPaymentUid: order.bepaidPaymentUid,
        reachedBepaidCheckout: reachedBepaid,
        webhookReceiptForBepaidUid: receipt?.createdAt
          ? formatDisplayDateTime(receipt.createdAt.toISOString())
          : null,
        promoCode: order.promoCode?.code ?? order.clubPromoCode ?? null,
        customer: {
          name: order.customer.name,
          email: order.customer.email,
          phone: order.customer.phone,
        },
        slot: {
          id: order.slot.id,
          kind: order.slot.kind,
          title: order.slot.title,
          startsAt: formatDisplayDateTime(order.slot.startsAt.toISOString()),
        },
        lines: order.lines.map((l) => ({
          tier: l.tier,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
        })),
        tickets: order.tickets.map((t) => ({
          tier: t.tier,
          usedAt: t.usedAt ? formatDisplayDateTime(t.usedAt.toISOString()) : null,
          refundedAt: t.refundedAt ? formatDisplayDateTime(t.refundedAt.toISOString()) : null,
        })),
        diagnosis:
          order.status === "CANCELLED" && !order.paidAt
            ? reachedBepaid
              ? "checkout_ok_bepaid_created_payment_not_completed_within_ttl"
              : "checkout_created_bepaid_payment_not_created_or_no_uid"
            : order.status,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
