import type { Order, Prisma, Ticket } from "@prisma/client";
import { finalizeDeiClubPromoRedemption } from "./resolve-order-promo";
import { prisma } from "./prisma";
import { buildTicketPdf } from "./pdf-ticket";
import { sendTicketEmail } from "./mail";
import { sendCrmWebhook } from "./crm";
import { getPublicAppBaseUrl } from "./request-origin";
import { formatMinorUnits } from "./money";
import { paidCentsForOrderTicketAtIndex } from "./ticket-refund-alloc";
import { BELYE_NOCHI_18_SLOT_KIND } from "./slot-kind";
import { linesSummaryRu, tierTicketSingularRu } from "./slot-pricing";
import { isNeboGiftOpenDateSlot } from "./nebo-reka/ensure-gift-slot";
import { refundBepaidPayment } from "./bepaid";
import {
  lockSeatKeysInTransaction,
  seatReservationStillHoldsSeat,
} from "./seat-reservation-lock";

/** Поздняя оплата отменённого заказа, а места уже проданы другому. */
class SeatsLostError extends Error {
  readonly seatKeys: string[];

  constructor(seatKeys: string[]) {
    super("SEATS_LOST");
    this.name = "SeatsLostError";
    this.seatKeys = seatKeys;
  }
}

type OrderWithTickets = Order & { tickets: Ticket[] };

/**
 * Отменённый заказ (бронь уже снята по таймеру) можно оплатить задним числом,
 * только если места ещё свободны. Иначе билет не активируется.
 */
async function reclaimSeatsForLatePayment(
  tx: Prisma.TransactionClient,
  order: OrderWithTickets,
): Promise<void> {
  const tickets = [...order.tickets].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const seatKeys = tickets
    .map((ticket) => ticket.seatKey?.trim())
    .filter((key): key is string => Boolean(key));
  if (seatKeys.length === 0) return;

  await lockSeatKeysInTransaction(tx, order.slotId, seatKeys);

  const rows = await tx.seatReservation.findMany({
    where: { slotId: order.slotId, seatKey: { in: seatKeys } },
    select: {
      id: true,
      seatKey: true,
      orderId: true,
      order: {
        select: {
          status: true,
          tickets: { select: { seatKey: true, refundedAt: true } },
        },
      },
    },
  });

  const blocking: string[] = [];
  const dropIds: string[] = [];
  const alreadyOurs = new Set<string>();
  for (const row of rows) {
    const holds =
      (row.order.status === "PENDING" || row.order.status === "PAID") &&
      seatReservationStillHoldsSeat(row);
    if (holds && row.orderId === order.id) {
      alreadyOurs.add(row.seatKey);
      continue;
    }
    if (holds) {
      blocking.push(row.seatKey);
      continue;
    }
    dropIds.push(row.id);
  }
  if (blocking.length > 0) {
    throw new SeatsLostError([...new Set(blocking)]);
  }
  if (dropIds.length > 0) {
    await tx.seatReservation.deleteMany({ where: { id: { in: dropIds } } });
  }

  const lines = await tx.orderLine.findMany({
    where: { orderId: order.id },
    orderBy: { id: "asc" },
  });

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]!;
    const seatKey = ticket.seatKey?.trim();
    if (!seatKey || alreadyOurs.has(seatKey)) continue;
    try {
      await tx.seatReservation.create({
        data: {
          slotId: order.slotId,
          orderId: order.id,
          seatKey,
          seatLabel: ticket.seatLabel?.trim() || seatKey,
          priceCents: lines[i]?.unitPriceCents ?? 0,
        },
      });
    } catch (err) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
        throw new SeatsLostError([seatKey]);
      }
      throw err;
    }
  }
}

/**
 * Деньги пришли, когда места уже куплены другим заказом.
 * Заказ остаётся недействительным для входа. Если bePaid доступен — полный возврат.
 */
async function compensateLostSeats(orderId: string, seatKeys: string[]): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      amountCents: true,
      refundedCents: true,
      bepaidPaymentUid: true,
      bepaidUid: true,
    },
  });
  if (!order || order.status === "REFUNDED" || order.status === "PAID") return;

  const refundAmount = order.amountCents - order.refundedCents;
  const parentUid = order.bepaidPaymentUid ?? order.bepaidUid;
  console.error("[fulfill] поздняя оплата, места уже проданы", {
    orderId,
    seatKeys,
    refundAmount,
    hasPaymentUid: Boolean(parentUid),
  });

  if (refundAmount < 1 || !parentUid) {
    console.error("[fulfill] автоматический возврат невозможен, заказ оставлен CANCELLED", {
      orderId,
      seatKeys,
    });
    return;
  }

  const refund = await refundBepaidPayment({
    parentUid,
    amountCents: refundAmount,
    reason: "Места уже проданы: оплата пришла после снятия брони",
  });
  if (!refund.ok) {
    console.error("[fulfill] возврат bePaid не прошёл, заказ оставлен CANCELLED", {
      orderId,
      seatKeys,
      message: refund.message,
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const marked = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["CANCELLED", "FAILED"] } },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        refundedCents: order.refundedCents + refundAmount,
      },
    });
    if (marked.count === 0) return;
    await tx.ticket.updateMany({
      where: { orderId: order.id, refundedAt: null },
      data: { refundedAt: new Date() },
    });
    await tx.seatReservation.deleteMany({ where: { orderId: order.id } });
  });
}

export async function fulfillPaidOrder(
  orderId: string,
  options?: { notify?: boolean },
): Promise<void> {
  let transitioned: { alreadyPaid: boolean };
  try {
    transitioned = await prisma.$transaction(async (tx) => {
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
      if (order.status !== "PENDING" && order.status !== "CANCELLED") {
        throw new Error("ORDER_BAD_STATE");
      }

      if (order.status === "CANCELLED") {
        await reclaimSeatsForLatePayment(tx, order);
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: "PAID", paidAt: new Date() },
      });
      return { alreadyPaid: false as const };
    });
  } catch (err) {
    if (err instanceof SeatsLostError) {
      await compensateLostSeats(orderId, err.seatKeys);
      return;
    }
    throw err;
  }

  if (transitioned.alreadyPaid || options?.notify === false) {
    return;
  }

  await finalizeDeiClubPromoRedemption(orderId);

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
    const giftOpenDate = isNeboGiftOpenDateSlot(full.slot);
    const pdfBytes = await buildTicketPdf({
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
      ticketOrdinal: multiPdf
        ? { index: i + 1, total: tickets.length }
        : undefined,
      slotKind: full.slot.kind,
      giftOpenDate,
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
