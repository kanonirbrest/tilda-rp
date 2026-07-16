import type { Slot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dateKeyInTz,
  getExhibitionTimezone,
  timeKeyInTz,
  wallDateAndTimeToUtc,
} from "@/lib/exhibition-time";
import {
  countGardensSelectableSeatsWithOverrides,
  getSelectableGardensSeatsWithOverrides,
  type GardensSeatMapVariant,
  GARDENS_PREMIUM_CENTS,
} from "@/lib/gardens-of-dreams/seat-map";
import {
  parseGardensSeatSaleOverrides,
  type GardensSeatSaleOverrides,
} from "@/lib/gardens-of-dreams/seat-sale-overrides";
import { seatReservationStillHoldsSeat } from "@/lib/seat-reservation-lock";
import {
  GARDENS_LEGACY_JULY_21_DATE,
  GARDENS_PERFORMANCE_JULY_20,
  GARDENS_PERFORMANCE_SCHEDULE,
  formatGardensPerformanceTitle,
  gardensScheduleMeta,
  getGardensSeatMapVariantForSchedule,
} from "@/lib/gardens-of-dreams/schedule";
import { GARDENS_OF_DREAMS_SLOT_KIND } from "@/lib/slot-kind";

const MATCH_WINDOW_MS = 90_000;

export const GARDENS_SELECTABLE_SEAT_COUNT = countGardensSelectableSeatsWithOverrides("default");

export function gardensSeatSaleOverridesForSlot(
  slot: Pick<Slot, "seatSaleOverrides">,
): GardensSeatSaleOverrides {
  return parseGardensSeatSaleOverrides(slot.seatSaleOverrides);
}

async function findGardensSlotByStartsAt(startsAt: Date): Promise<Slot | null> {
  const t = startsAt.getTime();
  const matched = await prisma.slot.findMany({
    where: {
      active: true,
      kind: GARDENS_OF_DREAMS_SLOT_KIND,
      startsAt: {
        gte: new Date(t - MATCH_WINDOW_MS),
        lte: new Date(t + MATCH_WINDOW_MS),
      },
    },
    take: 2,
  });
  if (matched.length === 1) return matched[0]!;
  if (matched.length > 1) {
    return matched.find((s) => s.startsAt.getTime() === t) ?? matched[0]!;
  }
  return null;
}

/**
 * Перенос второго показа с 21.07 на 20.07: тот же slotId, заказы и билеты сохраняются.
 * Срабатывает один раз, если слот на новую дату ещё не создан.
 */
async function migrateGardensJuly21SlotToJuly20(
  tz: string,
  newStartsAt: Date,
  newTitle: string,
): Promise<Slot | null> {
  const existingAtNew = await findGardensSlotByStartsAt(newStartsAt);
  if (existingAtNew) return null;

  const legacyStartsAt = wallDateAndTimeToUtc(
    GARDENS_LEGACY_JULY_21_DATE,
    GARDENS_PERFORMANCE_JULY_20.time,
    tz,
  );
  if (!legacyStartsAt) return null;

  const legacy = await findGardensSlotByStartsAt(legacyStartsAt);
  if (!legacy) return null;

  return prisma.slot.update({
    where: { id: legacy.id },
    data: { startsAt: newStartsAt, title: newTitle },
  });
}

/** Создаёт в БД слоты по GARDENS_PERFORMANCE_SCHEDULE, если их ещё нет. */
export async function ensureGardensSlots(): Promise<Slot[]> {
  const tz = getExhibitionTimezone();
  const out: Slot[] = [];

  for (const entry of GARDENS_PERFORMANCE_SCHEDULE) {
    const startsAt = wallDateAndTimeToUtc(entry.date, entry.time, tz);
    if (!startsAt) continue;

    const title = formatGardensPerformanceTitle(entry);

    if (entry.date === GARDENS_PERFORMANCE_JULY_20.date) {
      const migrated = await migrateGardensJuly21SlotToJuly20(tz, startsAt, title);
      if (migrated) {
        out.push(migrated);
        continue;
      }
    }

    const existing = await findGardensSlotByStartsAt(startsAt);
    if (existing) {
      if (existing.title !== title) {
        const updated = await prisma.slot.update({
          where: { id: existing.id },
          data: { title },
        });
        out.push(updated);
      } else {
        out.push(existing);
      }
      continue;
    }

    const slot = await prisma.slot.create({
      data: {
        kind: GARDENS_OF_DREAMS_SLOT_KIND,
        title,
        startsAt,
        priceCents: GARDENS_PREMIUM_CENTS,
        capacity: null,
        currency: "BYN",
        active: true,
      },
    });
    out.push(slot);
  }

  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function gardensSeatMapVariantForSlot(slot: Pick<Slot, "startsAt">): GardensSeatMapVariant {
  const tz = getExhibitionTimezone();
  const date = dateKeyInTz(slot.startsAt, tz);
  const time = timeKeyInTz(slot.startsAt, tz);
  return getGardensSeatMapVariantForSchedule(date, time);
}

export async function countGardensOccupiedSeats(
  slotId: string,
  variant: GardensSeatMapVariant,
  overrides?: GardensSeatSaleOverrides | null,
): Promise<number> {
  return (await findGardensOccupiedSeatKeys(slotId, variant, overrides)).length;
}

export async function countGardensFreeSeats(
  slotId: string,
  variant: GardensSeatMapVariant,
  overrides?: GardensSeatSaleOverrides | null,
): Promise<number> {
  const occupied = await countGardensOccupiedSeats(slotId, variant, overrides);
  return Math.max(0, countGardensSelectableSeatsWithOverrides(variant, overrides) - occupied);
}

export async function isGardensSlotBookable(
  slot: Pick<Slot, "id" | "startsAt" | "seatSaleOverrides">,
): Promise<boolean> {
  const variant = gardensSeatMapVariantForSlot(slot);
  const overrides = gardensSeatSaleOverridesForSlot(slot);
  return (await countGardensFreeSeats(slot.id, variant, overrides)) > 0;
}

export type GardensSessionPublic = {
  slotId: string;
  date: string;
  time: string;
  title: string;
  entryTime?: string;
  showDurationMinutes?: number;
  freeSeats: number;
  bookable: boolean;
};

export async function listGardensSessionsPublic(options?: {
  hidePast?: boolean;
  /** YYYY-MM-DD — только сеанс на эту дату (для отдельных витрин). */
  date?: string;
}): Promise<{ timezone: string; sessions: GardensSessionPublic[] }> {
  const hidePast = options?.hidePast !== false;
  const filterDate = options?.date?.trim();
  const tz = getExhibitionTimezone();
  const now = new Date();
  const slots = await ensureGardensSlots();
  const sessions: GardensSessionPublic[] = [];

  for (const slot of slots) {
    const date = dateKeyInTz(slot.startsAt, tz);
    const time = timeKeyInTz(slot.startsAt, tz);
    if (filterDate && date !== filterDate) continue;
    if (hidePast && slot.startsAt < now) continue;

    const variant = getGardensSeatMapVariantForSchedule(date, time);
    const overrides = gardensSeatSaleOverridesForSlot(slot);
    const freeSeats = await countGardensFreeSeats(slot.id, variant, overrides);
    const meta = gardensScheduleMeta(date, time);
    sessions.push({
      slotId: slot.id,
      date,
      time,
      title: slot.title,
      entryTime: meta.entryTime,
      showDurationMinutes: meta.showDurationMinutes,
      freeSeats,
      bookable: freeSeats > 0,
    });
  }

  return { timezone: tz, sessions };
}

export async function findGardensOccupiedSeatKeys(
  slotId: string,
  variant?: GardensSeatMapVariant,
  overrides?: GardensSeatSaleOverrides | null,
): Promise<string[]> {
  const rows = await prisma.seatReservation.findMany({
    where: {
      slotId,
      order: { status: { in: ["PENDING", "PAID"] } },
    },
    select: {
      seatKey: true,
      order: {
        select: {
          tickets: { select: { seatKey: true, refundedAt: true } },
        },
      },
    },
  });
  let keys = rows.filter(seatReservationStillHoldsSeat).map((r) => r.seatKey);
  if (variant != null) {
    const selectable = new Set(
      getSelectableGardensSeatsWithOverrides(variant, overrides).map((s) => s.key),
    );
    keys = keys.filter((k) => selectable.has(k));
  }
  return keys;
}
