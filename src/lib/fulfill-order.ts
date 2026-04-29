import { prisma } from "./prisma";
import { buildTicketPdf } from "./pdf-ticket";
import { sendTicketEmail } from "./mail";
import { sendCrmWebhook } from "./crm";
import { getPublicAppBaseUrl } from "./request-origin";
import { formatMinorUnits } from "./money";
import { paidCentsForOrderTicketAtIndex } from "./ticket-refund-alloc";
import { linesSummaryRu, tierTicketSingularRu } from "./slot-pricing";

export async function fulfillPaidOrder(orderId: string): Promise<void> {
  const transitioned = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { tickets: true },
    });
    if (!order || order.tickets.length === 0) {
      throw new Error("ORDER_NOT_FOUND");
    }
    if (order.status === "PAID") {
      return { alreadyPaid: true as const };
    }
    // CANCELLED после ленивого TTL — редкий поздний вебхук bePaid всё равно должен выдать билет.
    if (order.status !== "PENDING" && order.status !== "CANCELLED") {
      throw new Error("ORDER_BAD_STATE");
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: "PAID", paidAt: new Date() },
    });
    return { alreadyPaid: false as const };
  });

  if (transitioned.alreadyPaid) {
    return;
  }

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      slot: true,
      tickets: { orderBy: { createdAt: "asc" } },
      lines: true,
    },
  });
  if (!full?.tickets.length) return;

  const tickets = full.tickets;

  const base = getPublicAppBaseUrl();
  const downloadUrls = tickets.map(
    (t) => `${base}/api/tickets/${t.publicToken}/pdf`,
  );

  const multiPdf = tickets.length > 1;
  const pdfAttachments: { filename: string; content: Buffer }[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i]!;
    const qrUrl = `${base}/staff/quick?t=${t.publicToken}`;
    const pdfBytes = await buildTicketPdf({
      title: full.slot.title,
      customerName: full.customer.name,
      startsAt: full.slot.startsAt,
      amountCents: paidCentsForOrderTicketAtIndex(full, i, tickets.length),
      currency: full.currency,
      orderId: full.id,
      qrUrl,
      ticketTierLabel: t.tier ? tierTicketSingularRu(t.tier) : undefined,
      admissionCount: multiPdf ? 1 : t.admissionCount,
      ticketOrdinal: multiPdf
        ? { index: i + 1, total: tickets.length }
        : undefined,
    });
    pdfAttachments.push({
      filename: multiPdf
        ? `ticket-${i + 1}-of-${tickets.length}.pdf`
        : "ticket.pdf",
      content: Buffer.from(pdfBytes),
    });
  }

  const admissionTotal = tickets.reduce((s, x) => s + x.admissionCount, 0);
  const ticketTokens = tickets.map((x) => x.publicToken);

  /**
   * Почта и CRM не должны ронять вебхук bePaid: оплата уже зафиксирована как PAID.
   * Иначе 500 уведомления → повторы вебхука и ощущение «ошибки оплаты» у пользователя.
   */
  try {
    await sendTicketEmail({
      to: full.customer.email,
      customerName: full.customer.name,
      pdfAttachments,
      downloadUrls,
    });
  } catch (err) {
    console.error("[fulfill] sendTicketEmail", {
      orderId: full.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await sendCrmWebhook({
      event: "ticket_paid",
      customerName: full.customer.name,
      email: full.customer.email,
      phone: full.customer.phone,
      amountCents: full.amountCents,
      amountDisplay: formatMinorUnits(full.amountCents, full.currency),
      currency: full.currency,
      orderId: full.id,
      ticketToken: ticketTokens[0]!,
      ticketTokens: ticketTokens.length > 1 ? ticketTokens : undefined,
      slotTitle: full.slot.title,
      slotStartsAt: full.slot.startsAt.toISOString(),
      usedAt: null,
      linesSummary:
        full.lines.length > 0 ? linesSummaryRu(full.lines) : null,
      admissionCount: admissionTotal,
    });
  } catch (err) {
    console.error("[fulfill] sendCrmWebhook", {
      orderId: full.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
