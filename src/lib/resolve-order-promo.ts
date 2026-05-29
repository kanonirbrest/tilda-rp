import type { Slot } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  computeDeiClubPromoAmounts,
  isDeiClubNrPromoAttempt,
  previewDeiClubPromo,
  redeemDeiClubPromoCode,
} from "@/lib/dei-club-promo";
import {
  computePromoAmounts,
  isPromoActiveBySchedule,
  normalizePromoCode,
  promoAppliesToSlotKind,
  PromoApplyError,
} from "@/lib/promo-code";
import { prisma } from "@/lib/prisma";

export type ResolvedPromoQuote =
  | {
      applied: true;
      discountCents: number;
      amountCents: number;
      hint?: string;
    }
  | { applied: false; error: string; hint: string };

export type ResolvedPromoCheckout = {
  discountCents: number;
  amountCents: number;
  promoCodeId: string | null;
  clubPromoCode: string | null;
  clubPromoTelegramUserId: string | null;
};

/** Оценка промо для order-quote (без погашения NR-*). */
export async function resolvePromoForQuote(
  promoRaw: string,
  subtotalCents: number,
  slot: Pick<Slot, "kind">,
): Promise<ResolvedPromoQuote | null> {
  const norm = normalizePromoCode(promoRaw);
  if (!norm) return null;

  if (isDeiClubNrPromoAttempt(norm)) {
    const club = previewDeiClubPromo(norm, subtotalCents);
    if (!club.applied) {
      return { applied: false, error: club.error, hint: club.hint };
    }
    return {
      applied: true,
      discountCents: club.discountCents,
      amountCents: club.amountCents,
      hint: club.hint,
    };
  }

  const row = await prisma.promoCode.findUnique({ where: { code: norm } });
  if (!row) {
    return { applied: false, error: "INVALID_PROMO", hint: "Промокод не найден" };
  }
  const now = new Date();
  if (!isPromoActiveBySchedule(row, now)) {
    return {
      applied: false,
      error: "PROMO_INACTIVE",
      hint: "Промокод недействителен или срок действия истёк",
    };
  }
  if (!promoAppliesToSlotKind(row, slot.kind)) {
    return {
      applied: false,
      error: "PROMO_WRONG_CHANNEL",
      hint: "Промокод не действует для этого канала продажи",
    };
  }
  if (row.maxUses != null) {
    const used = await prisma.order.count({
      where: {
        promoCodeId: row.id,
        status: { in: ["PENDING", "PAID"] },
      },
    });
    if (used >= row.maxUses) {
      return {
        applied: false,
        error: "PROMO_EXHAUSTED",
        hint: "Лимит использований этого промокода исчерпан",
      };
    }
  }
  const { discountCents, amountCents } = computePromoAmounts(subtotalCents, row);
  if (amountCents < 1) {
    return {
      applied: false,
      error: "PROMO_ZERO_PAYMENT",
      hint: "После скидки сумма слишком мала для онлайн-оплаты",
    };
  }
  return { applied: true, discountCents, amountCents };
}

/**
 * Применение промо при создании заказа.
 * NR-*: redeem через API бота (одноразово). Остальные — локальная таблица PromoCode.
 */
export async function applyPromoAtCheckout(
  tx: Prisma.TransactionClient,
  params: {
    promoRaw: string;
    subtotalCents: number;
    slot: Pick<Slot, "kind">;
    skipPayment: boolean;
  },
): Promise<ResolvedPromoCheckout> {
  const norm = normalizePromoCode(params.promoRaw);
  if (!norm) {
    return {
      discountCents: 0,
      amountCents: params.subtotalCents,
      promoCodeId: null,
      clubPromoCode: null,
      clubPromoTelegramUserId: null,
    };
  }

  if (isDeiClubNrPromoAttempt(norm)) {
    const redeemed = await redeemDeiClubPromoCode(norm);
    if (!redeemed.ok) {
      const code =
        redeemed.error === "already_used" ? "PROMO_EXHAUSTED"
        : redeemed.error === "campaign_expired" || redeemed.error === "invalid_format" ?
          "PROMO_INACTIVE"
        : redeemed.error === "not_found" ? "INVALID_PROMO"
        : redeemed.status >= 500 ? "PROMO_UNAVAILABLE"
        : "INVALID_PROMO";
      const httpStatus =
        redeemed.status >= 500 ? 503
        : redeemed.status === 409 ? 400
        : 400;
      throw new PromoApplyError(redeemed.hint, code, httpStatus);
    }

    const { discountCents, amountCents } = computeDeiClubPromoAmounts(
      params.subtotalCents,
      redeemed.discountPercent,
    );
    if (amountCents < 1 && !params.skipPayment) {
      throw new PromoApplyError(
        "После скидки сумма слишком мала для онлайн-оплаты. Измените состав заказа или промокод.",
        "PROMO_ZERO_PAYMENT",
      );
    }

    console.info("[checkout] dei-club promo redeemed", {
      code: redeemed.code,
      userId: redeemed.userId,
      discountCents,
    });

    return {
      discountCents,
      amountCents,
      promoCodeId: null,
      clubPromoCode: redeemed.code,
      clubPromoTelegramUserId: String(redeemed.userId),
    };
  }

  const promo = await tx.promoCode.findUnique({ where: { code: norm } });
  if (!promo) {
    throw new PromoApplyError("Промокод не найден", "INVALID_PROMO");
  }
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "PromoCode" WHERE id = ${promo.id} FOR UPDATE`);

  const now = new Date();
  if (!isPromoActiveBySchedule(promo, now)) {
    throw new PromoApplyError(
      "Промокод недействителен или срок действия истёк",
      "PROMO_INACTIVE",
    );
  }
  if (!promoAppliesToSlotKind(promo, params.slot.kind)) {
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
  const applied = computePromoAmounts(params.subtotalCents, promo);
  if (applied.amountCents < 1 && !params.skipPayment) {
    throw new PromoApplyError(
      "После скидки сумма слишком мала для онлайн-оплаты. Измените состав заказа или промокод.",
      "PROMO_ZERO_PAYMENT",
    );
  }

  return {
    discountCents: applied.discountCents,
    amountCents: applied.amountCents,
    promoCodeId: promo.id,
    clubPromoCode: null,
    clubPromoTelegramUserId: null,
  };
}
