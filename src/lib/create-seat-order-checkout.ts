import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createPublicTicketToken } from "@/lib/ticket-token";
import { createBepaidPayment } from "@/lib/bepaid";
import { fulfillPaidOrder } from "@/lib/fulfill-order";
import { applyPromoAtCheckout } from "@/lib/resolve-order-promo";
import { getGardensSeat } from "@/lib/gardens-of-dreams/seat-map";
import { ensureGardensSlots } from "@/lib/gardens-of-dreams/ensure-slots";
import { ensureDream5Promo } from "@/lib/gardens-of-dreams/ensure-promo";
import { GARDENS_OF_DREAMS_SLOT_KIND } from "@/lib/slot-kind";
import {
  expireStalePendingOrdersAndReleaseSeats,
  releaseSeatLocksInTransaction,
} from "@/lib/expire-pending-orders";
import {
  mapSeatCheckoutException,
  SeatUnavailableError,
} from "@/lib/seat-checkout-errors";
import type { CreateOrderCheckoutErr, CreateOrderCheckoutOk } from "@/lib/create-order-checkout";

export { SeatUnavailableError };

export type CreateSeatOrderCheckoutInput = {
  slotId: string;
  name: string;
  email: string;
  phone: string;
  seatKeys: string[];
  promoCode?: string | null;
};

async function findOccupiedSeatKeysForCheckout(
  tx: Prisma.TransactionClient,
  slotId: string,
  seatKeys: string[],
): Promise<string[]> {
  const rows = await tx.seatReservation.findMany({
    where: {
      slotId,
      seatKey: { in: seatKeys },
      order: { status: { in: ["PENDING", "PAID"] } },
    },
    select: { seatKey: true },
  });
  return rows.map((r) => r.seatKey);
}

export async function createSeatOrderCheckout(
  input: CreateSeatOrderCheckoutInput,
  publicBaseUrl: string,
): Promise<CreateOrderCheckoutOk | CreateOrderCheckoutErr> {
  const uniqueKeys = [...new Set(input.seatKeys.map((k) => k.trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return { ok: false, status: 400, message: "Выберите хотя бы одно место" };
  }

  const seats = uniqueKeys.map((key) => {
    const seat = getGardensSeat(key);
    if (!seat?.selectable) return null;
    return seat;
  });
  if (seats.some((s) => s == null)) {
    return { ok: false, status: 400, message: "Некорректный выбор мест" };
  }
  const resolvedSeats = seats as NonNullable<(typeof seats)[number]>[];

  const { name, email, phone } = input;
  const subtotalCents = resolvedSeats.reduce((sum, s) => sum + s.priceCents, 0);
  const skipPayment = process.env.DEV_SKIP_PAYMENT === "true";

  try {
    await expireStalePendingOrdersAndReleaseSeats();
    await ensureGardensSlots();
    await ensureDream5Promo();

    const slot = await prisma.slot.findFirst({
      where: { id: input.slotId, active: true, kind: GARDENS_OF_DREAMS_SLOT_KIND },
    });
    if (!slot) {
      return { ok: false, status: 404, message: "Сеанс не найден" };
    }

    let chargedAmountCents = subtotalCents;

    const orderId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "Slot" WHERE id = ${slot.id} FOR UPDATE`);

      await releaseSeatLocksInTransaction(tx, slot.id, uniqueKeys);

      const occupied = await findOccupiedSeatKeysForCheckout(tx, slot.id, uniqueKeys);
      if (occupied.length > 0) {
        throw new SeatUnavailableError(occupied);
      }

      const rawPromo = input.promoCode?.trim();
      const promoApplied = rawPromo
        ? await applyPromoAtCheckout(tx, {
            promoRaw: rawPromo,
            subtotalCents,
            slot,
            skipPayment,
          })
        : {
            discountCents: 0,
            amountCents: subtotalCents,
            promoCodeId: null,
            clubPromoCode: null,
            clubPromoTelegramUserId: null,
          };

      const { discountCents, amountCents, promoCodeId, clubPromoCode, clubPromoTelegramUserId } =
        promoApplied;
      chargedAmountCents = amountCents;

      const customer = await tx.customer.create({
        data: { name, email: email.trim().toLowerCase(), phone },
      });

      const order = await tx.order.create({
        data: {
          slotId: slot.id,
          customerId: customer.id,
          subtotalCents,
          discountCents,
          amountCents,
          currency: slot.currency,
          status: "PENDING",
          promoCodeId,
          clubPromoCode,
          clubPromoTelegramUserId,
        },
      });

      for (const seat of resolvedSeats) {
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
      }

      return order.id;
    });

    if (skipPayment) {
      await fulfillPaidOrder(orderId);
      return {
        ok: true,
        orderId,
        redirectUrl: `/success?orderId=${encodeURIComponent(orderId)}`,
      };
    }

    try {
      const pay = await createBepaidPayment({
        orderId,
        amountCents: chargedAmountCents,
        currency: slot.currency,
        description: `${slot.title} — ${slot.startsAt.toISOString()}`,
        customerEmail: email.trim(),
        customerName: name,
        publicBaseUrl,
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { bepaidUid: pay.bepaidUid },
      });
      return { ok: true, orderId, redirectUrl: pay.redirectUrl };
    } catch (e) {
      if (e instanceof Error && e.message === "BEPAID_NOT_CONFIGURED") {
        return {
          ok: false,
          status: 503,
          message: "Оплата не настроена",
          hint: "Укажите BEPAID_SHOP_ID и BEPAID_SECRET_KEY или DEV_SKIP_PAYMENT=true",
        };
      }
      return { ok: false, status: 502, message: "Не удалось создать платёж", hint: "Не удалось перейти к оплате. Попробуйте ещё раз через минуту.", error: "PAYMENT_CREATE_FAILED" };
    }
  } catch (e) {
    return mapSeatCheckoutException(e);
  }
}
