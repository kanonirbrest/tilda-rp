import { prisma } from "@/lib/prisma";
import { GARDENS_OF_DREAMS_SLOT_KIND } from "@/lib/slot-kind";

export const GARDENS_DREAM5_PROMO_CODE = "DREAM5";

const MINSK_OFFSET = "+03:00";

/** Границы текущих суток по Europe/Minsk (UTC+3). */
function minskDayBounds(now = new Date()): { validFrom: Date; validUntil: Date } {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Europe/Minsk" });
  return {
    validFrom: new Date(`${day}T00:00:00.000${MINSK_OFFSET}`),
    validUntil: new Date(`${day}T23:59:59.999${MINSK_OFFSET}`),
  };
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
