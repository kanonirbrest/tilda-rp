import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createPublicTicketToken } from "@/lib/ticket-token";
import { createBepaidPayment } from "@/lib/bepaid";
import { fulfillPaidOrder } from "@/lib/fulfill-order";
import {
  totalAdmission,
  totalCentsForLines,
  unitPriceCents,
  type LineInput,
} from "@/lib/slot-pricing";

export class CapacityExceededError extends Error {
  constructor() {
    super("CAPACITY_EXCEEDED");
    this.name = "CapacityExceededError";
  }
}

export type CreateOrderCheckoutInput = {
  slotId: string;
  name: string;
  email: string;
  phone: string;
  lines: LineInput[];
};

export type CreateOrderCheckoutOk = {
  ok: true;
  redirectUrl: string;
  orderId: string;
};

export type CreateOrderCheckoutErr = {
  ok: false;
  status: number;
  message: string;
  hint?: string;
};

/**
 * Создание заказа и редирект на success или bePaid. Общая логика для POST /api/orders и GET /pay.
 * Лимит мест: сумма quantity по OrderLine заказов со статусом PENDING и PAID для этого слота.
 * PENDING удерживает место до оплаты или отмены (зависшие заказы можно чистить отдельно).
 */
export async function createOrderCheckout(
  input: CreateOrderCheckoutInput,
  publicBaseUrl: string,
): Promise<CreateOrderCheckoutOk | CreateOrderCheckoutErr> {
  let lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) {
    lines = [{ tier: "ADULT", quantity: 1 }];
  }

  const { name, email, phone } = input;

  try {
    const slot = await prisma.slot.findFirst({
      where: { id: input.slotId, active: true },
    });
    if (!slot) {
      return { ok: false, status: 404, message: "Сеанс не найден" };
    }

    const amountCents = totalCentsForLines(slot, lines);
    if (amountCents <= 0) {
      return { ok: false, status: 400, message: "Некорректное количество билетов" };
    }

    const admissions = totalAdmission(lines);
    const skipPayment = process.env.DEV_SKIP_PAYMENT === "true";

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
        if (reserved + admissions > locked.capacity) {
          throw new CapacityExceededError();
        }
      }

      const customer = await tx.customer.create({
        data: { name, email: email.trim().toLowerCase(), phone },
      });
      const o = await tx.order.create({
        data: {
          slotId: slot.id,
          customerId: customer.id,
          amountCents,
          currency: slot.currency,
          status: "PENDING",
        },
      });
      for (const l of lines) {
        await tx.orderLine.create({
          data: {
            orderId: o.id,
            tier: l.tier,
            quantity: l.quantity,
            unitPriceCents: unitPriceCents(slot, l.tier),
          },
        });
      }
      await tx.ticket.create({
        data: {
          orderId: o.id,
          publicToken: createPublicTicketToken(),
          admissionCount: admissions,
        },
      });
      return o.id;
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
      console.info("[checkout] вызов bePaid", {
        orderId,
        slotId: slot.id,
        amountCents,
        currency: slot.currency,
        publicBaseUrl,
      });
      const pay = await createBepaidPayment({
        orderId,
        amountCents,
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
      console.info("[checkout] bePaid ok, заказ обновлён bepaidUid", {
        orderId,
        bepaidUidLen: pay.bepaidUid.length,
      });
      return { ok: true, orderId, redirectUrl: pay.redirectUrl };
    } catch (e) {
      if (e instanceof Error && e.message === "BEPAID_NOT_CONFIGURED") {
        console.warn("[checkout] bePaid не сконфигурирован", { orderId });
        return {
          ok: false,
          status: 503,
          message: "Оплата не настроена",
          hint: "Укажите BEPAID_SHOP_ID и BEPAID_SECRET_KEY или DEV_SKIP_PAYMENT=true",
        };
      }
      console.error("[checkout] bePaid исключение", {
        orderId,
        name: e instanceof Error ? e.name : typeof e,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      return { ok: false, status: 502, message: "Не удалось создать платёж" };
    }
  } catch (e) {
    if (e instanceof CapacityExceededError) {
      return {
        ok: false,
        status: 409,
        message: "Недостаточно свободных мест на выбранный сеанс",
      };
    }
    console.error("createOrderCheckout", e);
    return {
      ok: false,
      status: 500,
      message: "Ошибка сервера при создании заказа",
    };
  }
}
