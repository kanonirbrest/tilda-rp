import type { Slot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dateKeyInTz,
  getExhibitionTimezone,
  timeKeyInTz,
  wallDateAndTimeToUtc,
} from "@/lib/exhibition-time";
import { GARDENS_PREMIUM_CENTS, getSelectableGardensSeats } from "@/lib/gardens-of-dreams/seat-map";
import { isDream5PromoCampaignActive } from "@/lib/gardens-of-dreams/ensure-promo";
import {
  GARDENS_PERFORMANCE_SCHEDULE,
  formatGardensPerformanceTitle,
  gardensScheduleMeta,
} from "@/lib/gardens-of-dreams/schedule";
import { GARDENS_OF_DREAMS_SLOT_KIND } from "@/lib/slot-kind";

const MATCH_WINDOW_MS = 90_000;

export const GARDENS_SELECTABLE_SEAT_COUNT = getSelectableGardensSeats().length;

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

/** Создаёт в БД слоты по GARDENS_PERFORMANCE_SCHEDULE, если их ещё нет. */
export async function ensureGardensSlots(): Promise<Slot[]> {
  const tz = getExhibitionTimezone();
  const out: Slot[] = [];

  for (const entry of GARDENS_PERFORMANCE_SCHEDULE) {
    const startsAt = wallDateAndTimeToUtc(entry.date, entry.time, tz);
    if (!startsAt) continue;

    const existing = await findGardensSlotByStartsAt(startsAt);
    const title = formatGardensPerformanceTitle(entry);
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

export async function countGardensOccupiedSeats(slotId: string): Promise<number> {
  return prisma.seatReservation.count({
    where: {
      slotId,
      order: { status: { in: ["PENDING", "PAID"] } },
    },
  });
}

export async function countGardensFreeSeats(slotId: string): Promise<number> {
  const occupied = await countGardensOccupiedSeats(slotId);
  return Math.max(0, GARDENS_SELECTABLE_SEAT_COUNT - occupied);
}

export async function isGardensSlotBookable(slotId: string): Promise<boolean> {
  return (await countGardensFreeSeats(slotId)) > 0;
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
}): Promise<{ timezone: string; sessions: GardensSessionPublic[]; promoCampaignActive: boolean }> {
  const hidePast = options?.hidePast !== false;
  const tz = getExhibitionTimezone();
  const now = new Date();
  const slots = await ensureGardensSlots();
  const sessions: GardensSessionPublic[] = [];

  for (const slot of slots) {
    const date = dateKeyInTz(slot.startsAt, tz);
    const time = timeKeyInTz(slot.startsAt, tz);
    if (hidePast && slot.startsAt < now) continue;

    const freeSeats = await countGardensFreeSeats(slot.id);
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

  return { timezone: tz, sessions, promoCampaignActive: isDream5PromoCampaignActive() };
}

export async function findGardensOccupiedSeatKeys(slotId: string): Promise<string[]> {
  const rows = await prisma.seatReservation.findMany({
    where: {
      slotId,
      order: { status: { in: ["PENDING", "PAID"] } },
    },
    select: { seatKey: true },
  });
  return rows.map((r) => r.seatKey);
}
