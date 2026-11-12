import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fulfillPaidOrder } from "@/lib/fulfill-order";
import { createPublicTicketToken } from "@/lib/ticket-token";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";
import { unitPriceCents } from "@/lib/slot-pricing";

export type DomInviteContact = {
  name: string;
  email?: string;
  phone?: string;
  /** download — PDF на компьютер, без письма. email — письмо с билетом. */
  deliver: "email" | "download";
};

/** На сеансе не осталось мест под лимит capacity. */
export class DomInviteCapacityError extends Error {
  constructor() {
    super("На сеансе не осталось мест");
    this.name = "DomInviteCapacityError";
  }
}

/**
 * Выдаёт пригласительный (взрослый) без оплаты: заказ на 0 ₽ с флагом complimentary и один билет.
 * Учитывает общий лимит мест сеанса (как checkout), схема мест не нужна.
 * Письмо уходит только если deliver = email.
 */
export async function issueDomRozhdestvaInvite(
  slotId: string,
  contact: DomInviteContact,
): Promise<{ orderId: string; publicToken: string }> {
  const slot = await prisma.slot.findUnique({ where: { id: slotId } });
  if (!slot || slot.kind !== DOM_ROZHDESTVA_SLOT_KIND) {
    throw new Error("Сеанс не найден");
  }

  const name = contact.name.replace(/\s+/g, " ").trim();
  const email = contact.email?.trim().toLowerCase() ?? "";
  const phone = contact.phone?.replace(/\s+/g, " ").trim() || "не указан";
  const sendEmail = contact.deliver === "email";
  const priceCents = unitPriceCents(slot, "ADULT");

  const orderId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "Slot" WHERE id = ${slot.id} FOR UPDATE`);
    const locked = await tx.slot.findUniqueOrThrow({ where: { id: slot.id } });

    if (locked.capacity != null) {
      const agg = await tx.orderLine.aggregate({
        where: {
          order: {
            slotId: slot.id,
            status: { in: ["PENDING", "PAID"] },
          },
        },
        _sum: { quantity: true },
      });
      const reserved = agg._sum.quantity ?? 0;
      if (reserved + 1 > locked.capacity) {
        throw new DomInviteCapacityError();
      }
    }

    const storedEmail = email || `invite.${createPublicTicketToken().slice(0, 12)}@no-mail.invalid`;
    const existing = email
      ? await tx.customer.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      : null;
    const customer =
      existing ??
      (await tx.customer.create({
        data: { name, email: storedEmail, phone },
        select: { id: true },
      }));

    const order = await tx.order.create({
      data: {
        slotId: slot.id,
        customerId: customer.id,
        subtotalCents: priceCents,
        discountCents: priceCents,
        amountCents: 0,
        currency: slot.currency,
        status: "PENDING",
        complimentary: true,
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
    await tx.ticket.create({
      data: {
        orderId: order.id,
        publicToken: createPublicTicketToken(),
        tier: "ADULT",
        admissionCount: 1,
      },
    });

    return order.id;
  });

  await fulfillPaidOrder(orderId, { notify: sendEmail });
  const ticket = await prisma.ticket.findFirst({
    where: { orderId },
    select: { publicToken: true },
  });
  if (!ticket) throw new Error("Билет не создан");
  return { orderId, publicToken: ticket.publicToken };
}
