import { prisma } from "./prisma";
import { buildTicketPdf } from "./pdf-ticket";
import { sendTicketEmail } from "./mail";
import { sendCrmWebhook } from "./crm";
import { getPublicAppBaseUrl } from "./request-origin";
import { linesSummaryRu } from "./slot-pricing";

export async function fulfillPaidOrder(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { customer: true, slot: true, ticket: true },
    });
    if (!order || !order.ticket) {
      throw new Error("ORDER_NOT_FOUND");
    }
    if (order.status === "PAID") {
      return;
    }
    // CANCELLED после ленивого TTL — редкий поздний вебхук bePaid всё равно должен выдать билет.
    if (order.status !== "PENDING" && order.status !== "CANCELLED") {
      throw new Error("ORDER_BAD_STATE");
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: "PAID", paidAt: new Date() },
    });
  });

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, slot: true, ticket: true, lines: true },
  });
  if (!full?.ticket) return;

  const linesSummary =
    full.lines.length > 0 ? linesSummaryRu(full.lines) : undefined;

  const base = getPublicAppBaseUrl();
  const qrUrl = `${base}/staff/quick?t=${full.ticket.publicToken}`;
  const downloadUrl = `${base}/api/tickets/${full.ticket.publicToken}/pdf`;

  const pdfBytes = await buildTicketPdf({
    title: full.slot.title,
    customerName: full.customer.name,
    startsAt: full.slot.startsAt,
    amountCents: full.amountCents,
    currency: full.currency,
    orderId: full.id,
    qrUrl,
    linesSummary,
    admissionCount: full.ticket.admissionCount,
  });

  await sendTicketEmail({
    to: full.customer.email,
    customerName: full.customer.name,
    pdfBuffer: Buffer.from(pdfBytes),
    downloadUrl,
  });

  await sendCrmWebhook({
    event: "ticket_paid",
    customerName: full.customer.name,
    email: full.customer.email,
    phone: full.customer.phone,
    amountCents: full.amountCents,
    currency: full.currency,
    orderId: full.id,
    ticketToken: full.ticket.publicToken,
    slotTitle: full.slot.title,
    slotStartsAt: full.slot.startsAt.toISOString(),
    usedAt: full.ticket.usedAt?.toISOString() ?? null,
    linesSummary: linesSummary ?? null,
    admissionCount: full.ticket.admissionCount,
  });
}
