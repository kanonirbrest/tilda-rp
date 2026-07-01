import { prisma } from "@/lib/prisma";
import { GARDENS_OF_DREAMS_SLOT_KIND } from "@/lib/slot-kind";
import { normalizePromoCode } from "@/lib/promo-code";

export const GARDENS_DREAM5_PROMO_CODE = "DREAM5";

/** 100% скидка на «Сады сновидений» — только этот код допускает оплату 0 BYN. */
export const GARDENS_COMPLIMENTARY_PROMO_CODE = "SNVID100";

const MINSK_OFFSET = "+03:00";

/** Границы текущих суток по Europe/Minsk (UTC+3). */
function minskDayBounds(now = new Date()): { validFrom: Date; validUntil: Date } {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Europe/Minsk" });
  return {
    validFrom: new Date(`${day}T00:00:00.000${MINSK_OFFSET}`),
    validUntil: new Date(`${day}T23:59:59.999${MINSK_OFFSET}`),
  };
}

export function isGardensComplimentaryPromoCode(raw: string): boolean {
  return normalizePromoCode(raw) === GARDENS_COMPLIMENTARY_PROMO_CODE;
}

/** Разрешает checkout с amountCents = 0 (без bePaid). */
export function promoAllowsZeroPayment(raw: string): boolean {
  return isGardensComplimentaryPromoCode(raw);
}

/** −5% на корзину «Сады сновидений», действует в текущие сутки (Минск), без лимита использований. */
export async function ensureDream5Promo(): Promise<void> {
  const { validFrom, validUntil } = minskDayBounds();
  await prisma.promoCode.upsert({
    where: { code: GARDENS_DREAM5_PROMO_CODE },
    create: {
      code: GARDENS_DREAM5_PROMO_CODE,
      active: true,
      slotKind: GARDENS_OF_DREAMS_SLOT_KIND,
      discountKind: "PERCENT",
      discountValue: 5,
      maxUses: null,
      validFrom,
      validUntil,
    },
    update: {
      active: true,
      slotKind: GARDENS_OF_DREAMS_SLOT_KIND,
      discountKind: "PERCENT",
      discountValue: 5,
      maxUses: null,
      validFrom,
      validUntil,
    },
  });
}

/** 100% на «Сады сновидений» — билет сразу после оформления, без bePaid. */
export async function ensureGardensComplimentaryPromo(): Promise<void> {
  await prisma.promoCode.upsert({
    where: { code: GARDENS_COMPLIMENTARY_PROMO_CODE },
    create: {
      code: GARDENS_COMPLIMENTARY_PROMO_CODE,
      active: true,
      slotKind: GARDENS_OF_DREAMS_SLOT_KIND,
      discountKind: "PERCENT",
      discountValue: 100,
      maxUses: null,
      validFrom: new Date("2026-01-01T00:00:00.000+03:00"),
      validUntil: new Date("2026-12-31T23:59:59.999+03:00"),
    },
    update: {
      active: true,
      slotKind: GARDENS_OF_DREAMS_SLOT_KIND,
      discountKind: "PERCENT",
      discountValue: 100,
      maxUses: null,
      validFrom: new Date("2026-01-01T00:00:00.000+03:00"),
      validUntil: new Date("2026-12-31T23:59:59.999+03:00"),
    },
  });
}

/** Все встроенные промо «Сады сновидений» (upsert при quote/checkout). */
export async function ensureGardensPromos(): Promise<void> {
  await ensureDream5Promo();
  await ensureGardensComplimentaryPromo();
}
