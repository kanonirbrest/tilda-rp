import type { Slot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getExhibitionTimezone, wallDateAndTimeToUtc } from "@/lib/exhibition-time";
import { NEBO_REKA_SLOT_KIND } from "@/lib/slot-kind";

export const NEBO_GIFT_OPEN_DATE_TITLE = "Небо.Река — подарочный билет";

/** Служебная дата слота (не сеанс): не должна попадать в месяцы витрины. */
const GIFT_SLOT_DATE = "2099-01-01";
const GIFT_SLOT_TIME = "12:00";

/**
 * Фикс. цены подарочного билета (как дефолты в админке Небо.Река).
 * Взрослый 58 BYN — обязателен для витрины «Купить в подарок».
 */
export const GIFT_ADULT_CENTS = 58_00;
export const GIFT_CHILD_CENTS = 30_00;
export const GIFT_CONCESSION_CENTS = 30_00;

export function isNeboGiftOpenDateSlot(
  slot: Pick<Slot, "giftOpenDate" | "kind">,
): boolean {
  return slot.giftOpenDate === true && slot.kind === NEBO_REKA_SLOT_KIND;
}

function giftPricesNeedSync(slot: Slot): boolean {
  return (
    slot.title !== NEBO_GIFT_OPEN_DATE_TITLE ||
    slot.priceCents !== GIFT_ADULT_CENTS ||
    slot.priceAdultCents !== GIFT_ADULT_CENTS ||
    slot.priceChildCents !== GIFT_CHILD_CENTS ||
    slot.priceConcessionCents !== GIFT_CONCESSION_CENTS
  );
}

const GIFT_PRICE_DATA = {
  title: NEBO_GIFT_OPEN_DATE_TITLE,
  priceCents: GIFT_ADULT_CENTS,
  priceAdultCents: GIFT_ADULT_CENTS,
  priceChildCents: GIFT_CHILD_CENTS,
  priceConcessionCents: GIFT_CONCESSION_CENTS,
} as const;

/** Создаёт/возвращает служебный слот для подарочных билетов с открытой датой. */
export async function ensureNeboGiftOpenDateSlot(): Promise<Slot> {
  const existing = await prisma.slot.findFirst({
    where: { kind: NEBO_REKA_SLOT_KIND, giftOpenDate: true, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    if (giftPricesNeedSync(existing)) {
      return prisma.slot.update({
        where: { id: existing.id },
        data: GIFT_PRICE_DATA,
      });
    }
    return existing;
  }

  const ref = await prisma.slot.findFirst({
    where: { kind: NEBO_REKA_SLOT_KIND, giftOpenDate: false, active: true },
    orderBy: { startsAt: "desc" },
  });

  const tz = getExhibitionTimezone();
  const startsAt = wallDateAndTimeToUtc(GIFT_SLOT_DATE, GIFT_SLOT_TIME, tz);
  if (!startsAt) {
    throw new Error("GIFT_SLOT_STARTS_AT");
  }

  return prisma.slot.create({
    data: {
      kind: NEBO_REKA_SLOT_KIND,
      startsAt,
      capacity: null,
      currency: ref?.currency ?? "BYN",
      active: true,
      giftOpenDate: true,
      ...GIFT_PRICE_DATA,
    },
  });
}
