import { prisma } from "@/lib/prisma";
import { VIVALDI_CONCERT_SLOT_KIND } from "@/lib/slot-kind";

/** 100% на «Времена года» — билет сразу после оформления, без bePaid. */
export const VIVALDI_COMPLIMENTARY_PROMO_CODE = "VIVALDI100";

/** Создаёт или обновляет встроенный 100% промокод Вивальди. */
export async function ensureVivaldiComplimentaryPromo(): Promise<void> {
  await prisma.promoCode.upsert({
    where: { code: VIVALDI_COMPLIMENTARY_PROMO_CODE },
    create: {
      code: VIVALDI_COMPLIMENTARY_PROMO_CODE,
      active: true,
      slotKind: VIVALDI_CONCERT_SLOT_KIND,
      discountKind: "PERCENT",
      discountValue: 100,
      maxUses: null,
      validFrom: new Date("2026-01-01T00:00:00.000+03:00"),
      validUntil: new Date("2026-12-31T23:59:59.999+03:00"),
    },
    update: {
      active: true,
      slotKind: VIVALDI_CONCERT_SLOT_KIND,
      discountKind: "PERCENT",
      discountValue: 100,
      maxUses: null,
      validFrom: new Date("2026-01-01T00:00:00.000+03:00"),
      validUntil: new Date("2026-12-31T23:59:59.999+03:00"),
    },
  });
}
