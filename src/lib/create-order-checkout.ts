import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createPublicTicketToken } from "@/lib/ticket-token";
import { createBepaidPayment } from "@/lib/bepaid";
import { fulfillPaidOrder } from "@/lib/fulfill-order";
import {
  computePromoAmounts,
  isPromoActiveBySchedule,
  normalizePromoCode,
  promoAppliesToSlotKind,
  PromoApplyError,
} from "@/lib/promo-code";
import {
  expandLineTiers,
  totalAdmission,
  totalCentsForLines,
  unitPriceCents,
  type LineInput,
} from "@/lib/slot-pricing";
import { expireStalePendingOrders } from "@/lib/expire-pending-orders";

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
  /** Строка с сайта / Тильды; пусто — без скидки */
  promoCode?: string | null;
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
  /** Для ответа API: INVALID_PROMO, PROMO_INACTIVE, … */
  error?: string;
};

/**
 * Создание заказа и редирект на success или bePaid. Общая логика для POST /api/orders и GET /pay.
 * Лимит мест: сумма quantity по OrderLine заказов со статусом PENDING и PAID для этого слота.
 * Просроченные PENDING (см. PENDING_ORDER_TTL_MINUTES) переводятся в CANCELLED лениво при этом запросе.
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
    await expireStalePendingOrders();

    const slot = await prisma.slot.findFirst({
      where: { id: input.slotId, active: true },
    });
    if (!slot) {
      return { ok: false, status: 404, message: "Сеанс не найден" };
    }

    const subtotalCents = totalCentsForLines(slot, lines);
    if (subtotalCents <= 0) {
      return { ok: false, status: 400, message: "Некорректное количество билетов" };
    }

    const admissions = totalAdmission(lines);
    const skipPayment = process.env.DEV_SKIP_PAYMENT === "true";

    let chargedAmountCents = subtotalCents;

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

      let discountCents = 0;
      let amountCents = subtotalCents;
      let promoCodeId: string | null = null;

      const rawPromo = input.promoCode?.trim();
      if (rawPromo) {
        const norm = normalizePromoCode(rawPromo);
        const promo = await tx.promoCode.findUnique({ where: { code: norm } });
        if (!promo) {
          throw new PromoApplyError("Промокод не найден", "INVALID_PROMO");
        }
        await tx.$executeRaw(
          Prisma.sql`SELECT id FROM "PromoCode" WHERE id = ${promo.id} FOR UPDATE`,
        );
        const now = new Date();
        if (!isPromoActiveBySchedule(promo, now)) {
          throw new PromoApplyError(
            "Промокод недействителен или срок действия истёк",
            "PROMO_INACTIVE",
          );
        }
        if (!promoAppliesToSlotKind(promo, slot.kind)) {
          throw new PromoApplyError(
            "Промокод не действует для этого канала продажи",
            "PROMO_WRONG_CHANNEL",
          );
        }
        if (promo.maxUses != null) {
          const reservedPromo = await tx.order.count({
            where: {
              promoCodeId: promo.id,
              status: { in: ["PENDING", "PAID"] },
            },
          });
          if (reservedPromo >= promo.maxUses) {
            throw new PromoApplyError(
              "Лимит использований этого промокода исчерпан",
              "PROMO_EXHAUSTED",
            );
          }
        }
        const applied = computePromoAmounts(subtotalCents, promo);
        discountCents = applied.discountCents;
        amountCents = applied.amountCents;
        if (amountCents < 1 && !skipPayment) {
          throw new PromoApplyError(
            "После скидки сумма слишком мала для онлайн-оплаты. Измените состав заказа или промокод.",
            "PROMO_ZERO_PAYMENT",
          );
        }
        promoCodeId = promo.id;
      }

      chargedAmountCents = amountCents;

      const customer = await tx.customer.create({
        data: { name, email: email.trim().toLowerCase(), phone },
      });
      const o = await tx.order.create({
        data: {
          slotId: slot.id,
          customerId: customer.id,
          subtotalCents,
          discountCents,
          amountCents,
          currency: slot.currency,
          status: "PENDING",
          promoCodeId,
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
      const tierUnits = expandLineTiers(lines);
      if (tierUnits.length !== admissions) {
        throw new Error("INVARIANT_TICKET_TIERS");
      }
      for (let i = 0; i < admissions; i++) {
        await tx.ticket.create({
          data: {
            orderId: o.id,
            publicToken: createPublicTicketToken(),
            tier: tierUnits[i]!,
            admissionCount: 1,
          },
        });
      }
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
        amountCents: chargedAmountCents,
        subtotalCents,
        currency: slot.currency,
        publicBaseUrl,
      });
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
      console.info("[checkout] bePaid ok, заказ обновлён bepaidUid", {
        orderId,
        bepaidUidLen: pay.bepaidUid.length,
        bepaidUidHead: pay.bepaidUid.slice(0, 8),
        bepaidUidTail: pay.bepaidUid.slice(-8),
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
    if (e instanceof PromoApplyError) {
      return {
        ok: false,
        status: 400,
        message: e.message,
        error: e.code,
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
