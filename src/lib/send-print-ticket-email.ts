import { prisma } from "@/lib/prisma";
import { isOutboundMailConfigured, sendTicketEmail } from "@/lib/mail";
import { renderDomRozhdestvaTicketPdf } from "@/lib/ticket-pdf-dom-rozhdestva";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";
import {
  dateKeyInTz,
  formatDateKeyRu,
  getExhibitionTimezone,
  timeKeyInTz,
} from "@/lib/exhibition-time";
import { formatPrintTicketToken, printTicketQrUrl } from "@/lib/print-ticket-token";
import { printTicketTierLabelRu } from "@/lib/print-tickets";

export async function sendPrintTicketReservationEmail(
  orderId: string,
  baseUrl: string,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, slot: true, tickets: true },
  });
  const ticket = order?.tickets[0];
  if (!order || !ticket || order.status !== "PAID") return;

  const tz = getExhibitionTimezone();
  const dateKey = dateKeyInTz(order.slot.startsAt, tz);
  const dateLabel = formatDateKeyRu(dateKey);
  const timeLabel = timeKeyInTz(order.slot.startsAt, tz);
  const displayCode = formatPrintTicketToken(ticket.publicToken);
  const qrUrl = printTicketQrUrl(baseUrl, ticket.publicToken);
  const downloadUrl = `${baseUrl.replace(/\/$/, "")}/api/tickets/${encodeURIComponent(ticket.publicToken)}/pdf`;

  const pdfBytes = await renderDomRozhdestvaTicketPdf({
    title: order.slot.title,
    startsAt: order.slot.startsAt,
    amountCents: 0,
    currency: order.currency,
    orderId: displayCode,
    qrUrl,
    ticketTierLabel: printTicketTierLabelRu(ticket.tier),
    admissionCount: 1,
    slotKind: DOM_ROZHDESTVA_SLOT_KIND,
  });

  if (!isOutboundMailConfigured()) {
    console.info("[print-ticket] почта не настроена, письмо не отправлено", {
      to: order.customer.email,
      dateLabel,
      timeLabel,
    });
    return;
  }

  await sendTicketEmail({
    to: order.customer.email,
    customerName: order.customer.name,
    pdfAttachments: [{ filename: `ticket-${displayCode}.pdf`, content: Buffer.from(pdfBytes) }],
    downloadUrls: [downloadUrl],
    slotKind: DOM_ROZHDESTVA_SLOT_KIND,
    printReservation: { dateLabel, timeLabel, displayCode },
  });
}
