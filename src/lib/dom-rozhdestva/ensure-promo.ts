import { prisma } from "@/lib/prisma";
import { normalizePromoCode } from "@/lib/promo-code";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";

/** 100% на «Дом Рождества» — билет без оплаты, без лимита использований. */
export const DOM_ROZHDESTVA_FREE_PROMO_CODE = "DR-FREE-TEST";

export function isDomRozhdestvaFreePromoCode(raw: string): boolean {
  return normalizePromoCode(raw) === DOM_ROZHDESTVA_FREE_PROMO_CODE;
}

/**
 * Создаёт встроенный промокод Дома Рождества, если его ещё нет.
 * Существующую запись не перезаписываем — так её можно отключить или изменить в админке.
 */
export async function ensureDomRozhdestvaFreePromo(): Promise<void> {
  const existing = await prisma.promoCode.findUnique({
    where: { code: DOM_ROZHDESTVA_FREE_PROMO_CODE },
    select: { id: true },
  });
  if (existing) return;

  await prisma.promoCode.create({
    data: {
      code: DOM_ROZHDESTVA_FREE_PROMO_CODE,
      active: true,
      slotKind: DOM_ROZHDESTVA_SLOT_KIND,
      discountKind: "PERCENT",
      discountValue: 100,
      maxUses: null,
      validFrom: null,
      validUntil: new Date("2027-01-17T23:59:59.999+03:00"),
    },
  });
}
