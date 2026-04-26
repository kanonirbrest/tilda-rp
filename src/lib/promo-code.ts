import type { PromoCode, PromoDiscountKind } from "@prisma/client";

export class PromoApplyError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_PROMO"
      | "PROMO_INACTIVE"
      | "PROMO_EXHAUSTED"
      | "PROMO_ZERO_PAYMENT",
  ) {
    super(message);
    this.name = "PromoApplyError";
  }
}

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function computePromoAmounts(
  subtotalCents: number,
  promo: Pick<PromoCode, "discountKind" | "discountValue">,
): { discountCents: number; amountCents: number } {
  if (subtotalCents <= 0) {
    return { discountCents: 0, amountCents: 0 };
  }
  let discount = 0;
  if (promo.discountKind === "PERCENT") {
    const p = Math.min(100, Math.max(0, promo.discountValue));
    discount = Math.floor((subtotalCents * p) / 100);
  } else {
    discount = Math.min(subtotalCents, Math.max(0, promo.discountValue));
  }
  const amountCents = Math.max(0, subtotalCents - discount);
  return { discountCents: subtotalCents - amountCents, amountCents };
}

export function isPromoActiveBySchedule(
  promo: Pick<PromoCode, "active" | "validFrom" | "validUntil">,
  now: Date,
): boolean {
  if (!promo.active) return false;
  if (promo.validFrom && now < promo.validFrom) return false;
  if (promo.validUntil && now > promo.validUntil) return false;
  return true;
}

export function describePromoDiscount(
  kind: PromoDiscountKind,
  value: number,
): string {
  if (kind === "PERCENT") return `−${value}%`;
  return `−${value} коп.`;
}
