import { prisma } from "@/lib/prisma";
import { GARDENS_OF_DREAMS_SLOT_KIND } from "@/lib/slot-kind";
import { normalizePromoCode } from "@/lib/promo-code";
import { isPromoCampaignExpired, promoCampaignValidUntilDate } from "@/lib/promo-campaign";

export const GARDENS_DREAM5_PROMO_CODE = "DREAM5";

/** 100% скидка на «Сады сновидений» — только этот код допускает оплату 0 BYN. */
export const GARDENS_COMPLIMENTARY_PROMO_CODE = "SNVID100";

export function isDream5PromoCampaignActive(now = new Date()): boolean {
  return !isPromoCampaignExpired(now);
}

export function isGardensComplimentaryPromoCode(raw: string): boolean {
  return normalizePromoCode(raw) === GARDENS_COMPLIMENTARY_PROMO_CODE;
}

/** Разрешает checkout с amountCents = 0 (без bePaid). */
export function promoAllowsZeroPayment(raw: string): boolean {
  return isGardensComplimentaryPromoCode(raw);
}

/**
 * −5% на «Сады сновидений» до PROMO_CAMPAIGN_VALID_UNTIL (по умолчанию 01.07.2026 включительно).
 * После окончания акции — active: false в БД.
 */
export async function ensureDream5Promo(): Promise<void> {
  if (!isDream5PromoCampaignActive()) {
    await prisma.promoCode.updateMany({
      where: { code: GARDENS_DREAM5_PROMO_CODE },
      data: { active: false },
    });
    return;
  }

  const validUntil = promoCampaignValidUntilDate();
  await prisma.promoCode.upsert({
    where: { code: GARDENS_DREAM5_PROMO_CODE },
    create: {
      code: GARDENS_DREAM5_PROMO_CODE,
      active: true,
      slotKind: GARDENS_OF_DREAMS_SLOT_KIND,
      discountKind: "PERCENT",
      discountValue: 5,
      maxUses: null,
      validFrom: null,
      validUntil,
    },
    update: {
      active: true,
      slotKind: GARDENS_OF_DREAMS_SLOT_KIND,
      discountKind: "PERCENT",
      discountValue: 5,
      maxUses: null,
      validFrom: null,
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
