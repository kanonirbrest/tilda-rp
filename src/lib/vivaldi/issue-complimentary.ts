import { prisma } from "@/lib/prisma";
import { fulfillPaidOrder } from "@/lib/fulfill-order";
import { SeatUnavailableError } from "@/lib/seat-checkout-errors";
import {
  findOccupiedSeatKeysForCheckout,
  lockSeatKeysInTransaction,
  purgeInactiveSeatReservationsInTransaction,
  seatReservationStillHoldsSeat,
} from "@/lib/seat-reservation-lock";
import { createPublicTicketToken } from "@/lib/ticket-token";
import { VIVALDI_CONCERT_SLOT_KIND } from "@/lib/slot-kind";
import { getVivaldiSeat } from "@/lib/vivaldi/seat-map";
import { vivaldiDateForStartsAt } from "@/lib/vivaldi/schedule";

export type ComplimentaryContact = {
  name: string;
  email: string;
  phone: string;
};

/** Места с оплаченным пригласительным, билет по которым ещё не возвращён. */
export async function findVivaldiComplimentarySeatKeys(slotId: string): Promise<string[]> {
  const rows = await prisma.seatReservation.findMany({
    where: {
      slotId,
      order: { complimentary: true, status: "PAID" },
    },
    select: {
      seatKey: true,
      order: {
        select: {
          tickets: { select: { seatKey: true, refundedAt: true } },
        },
      },
    },
  });
  return rows.filter(seatReservationStillHoldsSeat).map((row) => row.seatKey);
}

/**
 * Выдаёт пригласительный на одно место: заказ на 0, билет, письмо.
 * Место становится занятым и пропадает из продажи.
 */
export async function issueVivaldiComplimentarySeat(
  slotId: string,
  seatKey: string,
  contact: ComplimentaryContact,
): Promise<{ orderId: string; seatLabel: string }> {
  const slot = await prisma.slot.findUnique({ where: { id: slotId } });
  if (!slot || slot.kind !== VIVALDI_CONCERT_SLOT_KIND) {
    throw new Error("Сеанс не найден");
  }

  const date = vivaldiDateForStartsAt(slot.startsAt);
  const seat = getVivaldiSeat(seatKey, date);
  if (!seat?.selectable) {
    throw new Error("Это место нельзя выдать");
  }

  const name = contact.name.replace(/\s+/g, " ").trim();
  const email = contact.email.trim().toLowerCase();
  const phone = contact.phone.replace(/\s+/g, " ").trim();

  const orderId = await prisma.$transaction(async (tx) => {
    await lockSeatKeysInTransaction(tx, slot.id, [seat.key]);
    await purgeInactiveSeatReservationsInTransaction(tx, slot.id, [seat.key]);

    const taken = await findOccupiedSeatKeysForCheckout(tx, slot.id, [seat.key]);
    if (taken.length > 0) {
      throw new SeatUnavailableError(taken);
    }

    const existing = await tx.customer.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const customer =
      existing ??
      (await tx.customer.create({
        data: { name, email, phone },
        select: { id: true },
      }));

    const order = await tx.order.create({
      data: {
        slotId: slot.id,
        customerId: customer.id,
        subtotalCents: seat.priceCents,
        discountCents: seat.priceCents,
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
        unitPriceCents: seat.priceCents,
      },
    });
    await tx.seatReservation.create({
      data: {
        slotId: slot.id,
        orderId: order.id,
        seatKey: seat.key,
        seatLabel: seat.label,
        priceCents: seat.priceCents,
      },
    });
    await tx.ticket.create({
      data: {
        orderId: order.id,
        publicToken: createPublicTicketToken(),
        tier: "ADULT",
        admissionCount: 1,
        seatKey: seat.key,
        seatLabel: seat.label,
      },
    });

    return order.id;
  });

  await fulfillPaidOrder(orderId);
  return { orderId, seatLabel: seat.label };
}
