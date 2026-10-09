import type { Slot } from "@prisma/client";
import {
  dateKeyInTz,
  getExhibitionTimezone,
  timeKeyInTz,
  wallDateAndTimeToUtc,
} from "@/lib/exhibition-time";
import { prisma } from "@/lib/prisma";
import { seatReservationStillHoldsSeat } from "@/lib/seat-reservation-lock";
import { VIVALDI_CONCERT_SLOT_KIND } from "@/lib/slot-kind";
import {
  countVivaldiSelectableSeats,
  getSelectableVivaldiSeats,
  VIVALDI_PRICE_CENTS,
} from "@/lib/vivaldi/seat-map";
import {
  formatVivaldiPerformanceTitle,
  VIVALDI_PERFORMANCE,
  VIVALDI_PERFORMANCES,
  type VivaldiPerformance,
  vivaldiDateForStartsAt,
  vivaldiPerformanceByDate,
} from "@/lib/vivaldi/schedule";

const MATCH_WINDOW_MS = 90_000;

async function findVivaldiSlotByStartsAt(startsAt: Date): Promise<Slot | null> {
  const t = startsAt.getTime();
  const matched = await prisma.slot.findMany({
    where: {
      active: true,
      kind: VIVALDI_CONCERT_SLOT_KIND,
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

async function ensureVivaldiPerformance(entry: VivaldiPerformance): Promise<Slot | null> {
  const tz = getExhibitionTimezone();
  const startsAt = wallDateAndTimeToUtc(entry.date, entry.time, tz);
  if (!startsAt) return null;

  const title = formatVivaldiPerformanceTitle(entry);
  const capacity = countVivaldiSelectableSeats(entry.date);
  const existing = await findVivaldiSlotByStartsAt(startsAt);
  if (existing) {
    if (
      existing.title !== title ||
      existing.priceCents !== VIVALDI_PRICE_CENTS ||
      existing.capacity !== capacity
    ) {
      return prisma.slot.update({
        where: { id: existing.id },
        data: {
          title,
          priceCents: VIVALDI_PRICE_CENTS,
          capacity,
        },
      });
    }
    return existing;
  }

  return prisma.slot.create({
    data: {
      kind: VIVALDI_CONCERT_SLOT_KIND,
      title,
      startsAt,
      priceCents: VIVALDI_PRICE_CENTS,
      capacity,
      currency: "BYN",
      active: true,
    },
  });
}

/** Создаёт слоты всех показов, если их ещё нет. Чужой слот на другую дату не переносится. */
export async function ensureVivaldiSlots(): Promise<Slot[]> {
  const out: Slot[] = [];
  for (const entry of VIVALDI_PERFORMANCES) {
    const slot = await ensureVivaldiPerformance(entry);
    if (slot) out.push(slot);
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Гарантирует слоты всех показов и возвращает слот указанной даты (по умолчанию 13 октября). */
export async function ensureVivaldiSlot(
  date: string = VIVALDI_PERFORMANCE.date,
): Promise<Slot | null> {
  const slots = await ensureVivaldiSlots();
  const entry = vivaldiPerformanceByDate(date);
  if (!entry) return null;
  return slots.find((slot) => vivaldiDateForStartsAt(slot.startsAt) === entry.date) ?? null;
}

export async function findVivaldiOccupiedSeatKeys(slotId: string, date: string): Promise<string[]> {
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
  const selectable = new Set(getSelectableVivaldiSeats(date).map((s) => s.key));
  return rows
    .filter(seatReservationStillHoldsSeat)
    .map((r) => r.seatKey)
    .filter((k) => selectable.has(k));
}

export type VivaldiSessionPublic = {
  slotId: string;
  date: string;
  time: string;
  title: string;
  freeSeats: number;
  bookable: boolean;
};

export async function getVivaldiSessionPublic(date: string = VIVALDI_PERFORMANCE.date): Promise<{
  timezone: string;
  session: VivaldiSessionPublic | null;
}> {
  const tz = getExhibitionTimezone();
  const entry = vivaldiPerformanceByDate(date);
  const slot = entry ? await ensureVivaldiSlot(entry.date) : null;
  if (!slot || !entry) return { timezone: tz, session: null };

  const occupied = await findVivaldiOccupiedSeatKeys(slot.id, entry.date);
  const freeSeats = Math.max(0, countVivaldiSelectableSeats(entry.date) - occupied.length);
  return {
    timezone: tz,
    session: {
      slotId: slot.id,
      date: dateKeyInTz(slot.startsAt, tz),
      time: timeKeyInTz(slot.startsAt, tz),
      title: slot.title,
      freeSeats,
      bookable: freeSeats > 0 && slot.startsAt >= new Date(),
    },
  };
}
