import { buildTicketPdf } from "./pdf-ticket";
import { isOutboundMailConfigured, sendTicketEmail } from "./mail";
import { getPublicAppBaseUrl } from "./request-origin";
import { paidCentsForOrderTicketAtIndex } from "./ticket-refund-alloc";
import { BELYE_NOCHI_18_SLOT_KIND } from "./slot-kind";
import { tierTicketSingularRu } from "./slot-pricing";
import { isNeboGiftOpenDateSlot } from "./nebo-reka/ensure-gift-slot";
import { prisma } from "./prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SendOrderTicketsError extends Error {
  readonly code: "NOT_FOUND" | "NOT_PAID" | "NO_TICKETS" | "BAD_EMAIL" | "PDF_FAILED";
  readonly status: number;

  constructor(code: SendOrderTicketsError["code"], message: string, status: number) {
    super(message);
    this.name = "SendOrderTicketsError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Собирает PDF действующих билетов оплаченного заказа и отправляет то же письмо,
 * что уходит покупателю после оплаты. Возвращённые билеты не вкладываются.
 * `sent: false` — почта на сервере не настроена, письмо не уходило.
 */
export async function sendOrderTicketsEmail(
  orderId: string,
  to: string,
): Promise<{ ticketCount: number; sent: boolean; to: string }> {
  const email = to.trim();
  if (!EMAIL_RE.test(email) || email.length > 320) {
    throw new SendOrderTicketsError("BAD_EMAIL", "Укажите корректный email.", 400);
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

  if (!full) {
    throw new SendOrderTicketsError("NOT_FOUND", "Заказ не найден.", 404);
  }
  if (full.status !== "PAID") {
    throw new SendOrderTicketsError(
      "NOT_PAID",
      "Письмо с билетами можно отправить только по оплаченному заказу.",
      400,
    );
  }

  const tickets = full.tickets;
  const active = tickets.map((t, i) => ({ t, i })).filter(({ t }) => t.refundedAt == null);
  if (active.length === 0) {
    throw new SendOrderTicketsError("NO_TICKETS", "В заказе нет действующих билетов.", 400);
  }

  if (!isOutboundMailConfigured()) {
    console.info("[tickets-email] почта не настроена, письмо не отправлено", { orderId: full.id });
    return { ticketCount: active.length, sent: false, to: email };
  }

  const base = getPublicAppBaseUrl();
  const downloadUrls = active.map(({ t }) => `${base}/api/tickets/${t.publicToken}/pdf`);
  const multiPdf = tickets.length > 1;
  const pdfAttachments: { filename: string; content: Buffer }[] = [];

  for (const { t, i } of active) {
    const qrUrl = `${base}/staff/quick?t=${t.publicToken}`;
    const giftOpenDate = isNeboGiftOpenDateSlot(full.slot);
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildTicketPdf({
        title: giftOpenDate ? "Небо.Река" : full.slot.title,
        startsAt: full.slot.startsAt,
        amountCents: paidCentsForOrderTicketAtIndex(full, i, tickets.length),
        currency: full.currency,
        orderId: full.id,
        qrUrl,
        ticketTierLabel:
          t.seatLabel ??
          (full.slot.kind === BELYE_NOCHI_18_SLOT_KIND ?
            undefined
          : t.tier ? tierTicketSingularRu(t.tier) : undefined),
        admissionCount: multiPdf ? 1 : t.admissionCount,
        ticketOrdinal: multiPdf ? { index: i + 1, total: tickets.length } : undefined,
        slotKind: full.slot.kind,
        giftOpenDate,
      });
    } catch (err) {
      console.error("[tickets-email] pdf", {
        orderId: full.id,
        message: err instanceof Error ? err.message : String(err),
      });
      throw new SendOrderTicketsError(
        "PDF_FAILED",
        "Не удалось собрать PDF билета. Повторите позже.",
        503,
      );
    }
    pdfAttachments.push({
      filename: multiPdf ? `ticket-${i + 1}-of-${tickets.length}.pdf` : "ticket.pdf",
      content: Buffer.from(pdfBytes),
    });
  }

  await sendTicketEmail({
    to: email,
    customerName: full.customer.name,
    pdfAttachments,
    downloadUrls,
    slotKind: full.slot.kind,
  });

  return { ticketCount: active.length, sent: true, to: email };
}
