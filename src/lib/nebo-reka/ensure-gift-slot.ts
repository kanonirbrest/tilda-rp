import type { Slot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getExhibitionTimezone, wallDateAndTimeToUtc } from "@/lib/exhibition-time";
import { NEBO_REKA_SLOT_KIND } from "@/lib/slot-kind";

export const NEBO_GIFT_OPEN_DATE_TITLE = "Небо.Река — подарочный билет";

/** Служебная дата слота (не сеанс): не должна попадать в месяцы витрины. */
const GIFT_SLOT_DATE = "2099-01-01";
const GIFT_SLOT_TIME = "12:00";

const FALLBACK_ADULT_CENTS = 40_00;
const FALLBACK_CHILD_CENTS = 20_00;
const FALLBACK_CONCESSION_CENTS = 20_00;

export function isNeboGiftOpenDateSlot(
  slot: Pick<Slot, "giftOpenDate" | "kind">,
): boolean {
  return slot.giftOpenDate === true && slot.kind === NEBO_REKA_SLOT_KIND;
}

/** Создаёт/возвращает служебный слот для подарочных билетов с открытой датой. */
export async function ensureNeboGiftOpenDateSlot(): Promise<Slot> {
  const existing = await prisma.slot.findFirst({
    where: { kind: NEBO_REKA_SLOT_KIND, giftOpenDate: true, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    if (existing.title !== NEBO_GIFT_OPEN_DATE_TITLE) {
      return prisma.slot.update({
        where: { id: existing.id },
        data: { title: NEBO_GIFT_OPEN_DATE_TITLE },
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

  const priceAdultCents = ref?.priceAdultCents ?? ref?.priceCents ?? FALLBACK_ADULT_CENTS;
  const priceChildCents = ref?.priceChildCents ?? FALLBACK_CHILD_CENTS;
  const priceConcessionCents = ref?.priceConcessionCents ?? FALLBACK_CONCESSION_CENTS;

  return prisma.slot.create({
    data: {
      kind: NEBO_REKA_SLOT_KIND,
      title: NEBO_GIFT_OPEN_DATE_TITLE,
      startsAt,
      priceCents: priceAdultCents,
      priceAdultCents,
      priceChildCents,
      priceConcessionCents,
      capacity: null,
      currency: ref?.currency ?? "BYN",
      active: true,
      giftOpenDate: true,
    },
  });
}
