import { prisma } from "@/lib/prisma";
import {
  dateKeyInTz,
  getExhibitionTimezone,
  timeKeyInTz,
  wallDateAndTimeToUtc,
} from "@/lib/exhibition-time";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";
import {
  formatDomRozhdestvaTitle,
  listDomRozhdestvaSessions,
} from "@/lib/dom-rozhdestva/schedule";

let inflight: Promise<void> | null = null;

/** Создаёт недостающие сеансы, подтягивает цену/лимит и закрывает слоты, которых больше нет в расписании. */
export function ensureDomRozhdestvaSlots(): Promise<void> {
  if (!inflight) {
    inflight = syncDomRozhdestvaSlots().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function syncDomRozhdestvaSlots(): Promise<void> {
  const tz = getExhibitionTimezone();
  const existing = await prisma.slot.findMany({
    where: { kind: DOM_ROZHDESTVA_SLOT_KIND, giftOpenDate: false },
    select: {
      id: true,
      startsAt: true,
      title: true,
      priceCents: true,
      priceAdultCents: true,
      priceChildCents: true,
      priceConcessionCents: true,
      capacity: true,
      active: true,
    },
  });
  const sessions = listDomRozhdestvaSessions();
  const wanted = new Set(sessions.map((session) => `${session.date} ${session.time}`));
  const byWall = new Map(
    existing.map((slot) => [`${dateKeyInTz(slot.startsAt, tz)} ${timeKeyInTz(slot.startsAt, tz)}`, slot]),
  );

  const toCreate: {
    kind: string;
    title: string;
    startsAt: Date;
    priceCents: number;
    priceAdultCents: number;
    priceChildCents: number;
    priceConcessionCents: number;
    capacity: number;
    currency: string;
    active: boolean;
  }[] = [];

  for (const session of sessions) {
    const startsAt = wallDateAndTimeToUtc(session.date, session.time, tz);
    if (!startsAt) continue;
    const title = formatDomRozhdestvaTitle(session.date, session.time);
    const found = byWall.get(`${session.date} ${session.time}`);
    if (!found) {
      toCreate.push({
        kind: DOM_ROZHDESTVA_SLOT_KIND,
        title,
        startsAt,
        priceCents: session.priceCents,
        priceAdultCents: session.priceCents,
        priceChildCents: session.priceCents,
        priceConcessionCents: session.priceCents,
        capacity: session.capacity,
        currency: "BYN",
        active: true,
      });
      continue;
    }
    if (
      !found.active ||
      found.title !== title ||
      found.priceCents !== session.priceCents ||
      found.priceAdultCents !== session.priceCents ||
      found.priceChildCents !== session.priceCents ||
      found.priceConcessionCents !== session.priceCents ||
      found.capacity !== session.capacity
    ) {
      await prisma.slot.update({
        where: { id: found.id },
        data: {
          title,
          active: true,
          priceCents: session.priceCents,
          priceAdultCents: session.priceCents,
          priceChildCents: session.priceCents,
          priceConcessionCents: session.priceCents,
          capacity: session.capacity,
        },
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.slot.createMany({ data: toCreate });
  }

  const closeIds = existing
    .filter((slot) => {
      const key = `${dateKeyInTz(slot.startsAt, tz)} ${timeKeyInTz(slot.startsAt, tz)}`;
      return slot.active && !wanted.has(key);
    })
    .map((slot) => slot.id);
  if (closeIds.length > 0) {
    await prisma.slot.updateMany({
      where: { id: { in: closeIds } },
      data: { active: false },
    });
  }
}
