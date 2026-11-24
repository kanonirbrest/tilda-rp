import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CapacityExceededError } from "@/lib/create-order-checkout";
import { findOrCreateCustomerByEmail } from "@/lib/customer-upsert";
import { applyMarketingConsentAtCheckout } from "@/lib/marketing-consent";
import { fulfillPaidOrder } from "@/lib/fulfill-order";
import { resolveCheckoutSlot } from "@/lib/resolve-checkout-slot";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";
import { unitPriceCents } from "@/lib/slot-pricing";
import { PrintTicketError, findTicketByScannedToken } from "@/lib/print-tickets";
import { getPublicAppBaseUrl } from "@/lib/request-origin";
import { sendPrintTicketReservationEmail } from "@/lib/send-print-ticket-email";

export class PrintRegistrationClosedError extends Error {
  constructor() {
    super("На этот сеанс регистрация по печатным билетам закрыта.");
    this.name = "PrintRegistrationClosedError";
  }
}

export async function registerPrintTicket(input: {
  token: string;
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  marketingConsent?: boolean;
  baseUrl?: string;
}): Promise<{ ticketId: string; orderId: string }> {
  const ticket = await findTicketByScannedToken(input.token);
  if (!ticket || ticket.source !== "PRINT") {
    throw new PrintTicketError("NOT_FOUND", "Билет не найден. Проверьте уникальный код.");
  }
  if (ticket.usedAt) {
    throw new PrintTicketError("ALREADY_USED", "Этот билет уже использован на входе.");
  }
  if (ticket.refundedAt) {
    throw new PrintTicketError("NOT_FOUND", "Билет недействителен.");
  }
  if (ticket.order && ticket.order.status === "PAID") {
    throw new PrintTicketError("ALREADY_REGISTERED", "Билет уже зарегистрирован на сеанс.");
  }

  const resolved = await resolveCheckoutSlot({
    date: input.date,
    time: input.time,
    slotKind: DOM_ROZHDESTVA_SLOT_KIND,
  });
  if (!resolved.ok) {
    throw new PrintTicketError("NOT_FOUND", "Сеанс не найден. Выберите другую дату или время.");
  }
  const slot = resolved.slot;
  if (!slot.registrationOpen) {
    throw new PrintRegistrationClosedError();
  }

  const priceCents = unitPriceCents(slot, "ADULT");
  const name = input.name.replace(/\s+/g, " ").trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.replace(/\s+/g, " ").trim();

  const orderId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "Ticket" WHERE id = ${ticket.id} FOR UPDATE`);
    const lockedTicket = await tx.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { order: true },
    });
    if (lockedTicket.usedAt || lockedTicket.refundedAt) {
      throw new PrintTicketError("ALREADY_USED", "Этот билет уже использован на входе.");
    }
    if (lockedTicket.orderId && lockedTicket.order?.status === "PAID") {
      throw new PrintTicketError("ALREADY_REGISTERED", "Билет уже зарегистрирован на сеанс.");
    }

    await tx.$executeRaw(Prisma.sql`SELECT id FROM "Slot" WHERE id = ${slot.id} FOR UPDATE`);
    const lockedSlot = await tx.slot.findUniqueOrThrow({ where: { id: slot.id } });
    if (!lockedSlot.active || !lockedSlot.registrationOpen) {
      throw new PrintRegistrationClosedError();
    }
    if (lockedSlot.capacity != null) {
      const agg = await tx.orderLine.aggregate({
        where: {
          order: {
            slotId: lockedSlot.id,
            status: { in: ["PENDING", "PAID"] },
          },
        },
        _sum: { quantity: true },
      });
      const reserved = agg._sum.quantity ?? 0;
      if (reserved + 1 > lockedSlot.capacity) {
        throw new CapacityExceededError();
      }
    }

    const customer = await findOrCreateCustomerByEmail(tx, { name, email, phone });
    const marketingConsentAt = input.marketingConsent ? new Date() : null;
    if (marketingConsentAt) {
      await applyMarketingConsentAtCheckout(tx, customer.id, true, marketingConsentAt);
    }

    const order = await tx.order.create({
      data: {
        slotId: lockedSlot.id,
        customerId: customer.id,
        subtotalCents: priceCents,
        discountCents: priceCents,
        amountCents: 0,
        currency: lockedSlot.currency,
        status: "PENDING",
        complimentary: true,
        ...(marketingConsentAt ? { marketingConsentAt } : {}),
      },
    });
    await tx.orderLine.create({
      data: {
        orderId: order.id,
        tier: "ADULT",
        quantity: 1,
        unitPriceCents: priceCents,
      },
    });
    await tx.ticket.update({
      where: { id: lockedTicket.id },
      data: { orderId: order.id, tier: "ADULT" },
    });
    return order.id;
  });

  await fulfillPaidOrder(orderId, { notify: false });
  try {
    await sendPrintTicketReservationEmail(orderId, input.baseUrl ?? getPublicAppBaseUrl());
  } catch (err) {
    console.error("[print-ticket] письмо после регистрации", err);
  }
  return { ticketId: ticket.id, orderId };
}
