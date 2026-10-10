import { VIVALDI_HITBOXES, vivaldiUniformBox } from "@/lib/vivaldi/seat-hitboxes";
import {
  VIVALDI_PERFORMANCE,
  VIVALDI_PERFORMANCE_OCTOBER_13,
  VIVALDI_PERFORMANCE_OCTOBER_26,
} from "@/lib/vivaldi/schedule";

/** Базовая цена слота в админке: максимальный билет в продаже, 140 BYN. */
export const VIVALDI_PRICE_CENTS = 14_000;

export type VivaldiSector = "A" | "B" | "C";
export type VivaldiAvailability = "sale" | "ticketpro" | "reserved";

export type VivaldiSeat = {
  key: string;
  sector: VivaldiSector;
  row: number;
  seat: number;
  priceCents: number;
  selectable: boolean;
  availability: VivaldiAvailability;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function seatLabel(sector: VivaldiSector, row: number, seat: number): string {
  return `Сектор ${sector}, ряд ${row}, место ${seat}`;
}

function inRange(n: number, from: number, to: number): boolean {
  return n >= from && n <= to;
}

function offerOctober13(
  sector: VivaldiSector,
  row: number,
  seat: number,
): { priceCents: number; availability: VivaldiAvailability } {
  if (sector === "A" && row === 1 && inRange(seat, 1, 15)) {
    return { priceCents: 13_000, availability: "sale" };
  }
  if (sector === "A" && row === 2 && inRange(seat, 1, 15)) {
    return { priceCents: 12_000, availability: "sale" };
  }
  if (sector === "B" && row === 1 && inRange(seat, 1, 25)) {
    return { priceCents: 14_000, availability: "sale" };
  }
  if (sector === "B" && row === 2 && inRange(seat, 1, 25)) {
    return { priceCents: 13_000, availability: "ticketpro" };
  }
  if (sector === "B" && row === 3) {
    if (inRange(seat, 9, 16)) return { priceCents: 13_000, availability: "sale" };
    if (inRange(seat, 1, 8) || inRange(seat, 17, 25)) {
      return { priceCents: 13_000, availability: "ticketpro" };
    }
  }
  if (sector === "B" && row === 4) {
    if (inRange(seat, 9, 16)) return { priceCents: 12_000, availability: "sale" };
    if (inRange(seat, 1, 8) || inRange(seat, 17, 25)) {
      return { priceCents: 12_000, availability: "ticketpro" };
    }
  }
  if (sector === "B" && inRange(row, 5, 8) && inRange(seat, 1, 25)) {
    return { priceCents: 0, availability: "reserved" };
  }
  if (sector === "C" && row === 1 && inRange(seat, 1, 15)) {
    return { priceCents: 13_000, availability: "ticketpro" };
  }
  if (sector === "C" && row === 2 && inRange(seat, 1, 15)) {
    return { priceCents: 12_000, availability: "ticketpro" };
  }
  return { priceCents: 0, availability: "reserved" };
}

/** 26 октября: свои места в продаже, места Тикетпро на схеме есть, но не продаются. */
function offerOctober26(
  sector: VivaldiSector,
  row: number,
  seat: number,
): { priceCents: number; availability: VivaldiAvailability } {
  if (sector === "A" && row === 1 && inRange(seat, 1, 15)) {
    return { priceCents: 13_000, availability: "sale" };
  }
  if (sector === "A" && row === 2 && inRange(seat, 1, 15)) {
    return { priceCents: 12_000, availability: "sale" };
  }
  if (sector === "B" && row === 1 && inRange(seat, 1, 25)) {
    return { priceCents: 14_000, availability: "sale" };
  }
  if (sector === "B" && row === 2 && inRange(seat, 1, 25)) {
    return { priceCents: 13_000, availability: "ticketpro" };
  }
  if (sector === "B" && row === 3) {
    if (inRange(seat, 9, 16)) return { priceCents: 13_000, availability: "sale" };
    if (inRange(seat, 1, 8) || inRange(seat, 17, 25)) {
      return { priceCents: 13_000, availability: "ticketpro" };
    }
  }
  if (sector === "B" && row === 4) {
    if (inRange(seat, 9, 16)) return { priceCents: 12_000, availability: "sale" };
    if (inRange(seat, 1, 8) || inRange(seat, 17, 25)) {
      return { priceCents: 12_000, availability: "ticketpro" };
    }
  }
  if (sector === "B" && row === 5 && inRange(seat, 1, 25)) {
    return { priceCents: 12_000, availability: "sale" };
  }
  if (sector === "B" && row === 6 && inRange(seat, 1, 25)) {
    return { priceCents: 10_500, availability: "ticketpro" };
  }
  if (sector === "B" && row === 7 && inRange(seat, 1, 25)) {
    return { priceCents: 10_500, availability: "sale" };
  }
  if (sector === "B" && row === 8 && inRange(seat, 1, 25)) {
    return { priceCents: 9_500, availability: "ticketpro" };
  }
  if (sector === "C" && row === 1 && inRange(seat, 1, 15)) {
    return { priceCents: 13_000, availability: "ticketpro" };
  }
  if (sector === "C" && row === 2 && inRange(seat, 1, 15)) {
    return { priceCents: 12_000, availability: "ticketpro" };
  }
  return { priceCents: 0, availability: "reserved" };
}

function vivaldiOffer(
  date: string,
  sector: VivaldiSector,
  row: number,
  seat: number,
): { priceCents: number; availability: VivaldiAvailability } {
  if (date === VIVALDI_PERFORMANCE_OCTOBER_26.date) return offerOctober26(sector, row, seat);
  if (date === VIVALDI_PERFORMANCE_OCTOBER_13.date) return offerOctober13(sector, row, seat);
  return { priceCents: 0, availability: "reserved" };
}

const SEAT_MAPS = new Map<string, VivaldiSeat[]>();

export function buildVivaldiSeatMap(date: string = VIVALDI_PERFORMANCE.date): VivaldiSeat[] {
  const cached = SEAT_MAPS.get(date);
  if (cached) return cached;
  const seats = VIVALDI_HITBOXES.map((box) => {
    const offer = vivaldiOffer(date, box.sector, box.row, box.seat);
    const geo = vivaldiUniformBox(box.sector, box.row, box.seat);
    return {
      key: box.key,
      sector: box.sector,
      row: box.row,
      seat: box.seat,
      priceCents: offer.priceCents,
      selectable: offer.availability === "sale",
      availability: offer.availability,
      label: seatLabel(box.sector, box.row, box.seat),
      x: geo.x,
      y: geo.y,
      w: geo.w,
      h: geo.h,
    };
  });
  SEAT_MAPS.set(date, seats);
  return seats;
}

export function getVivaldiSeat(key: string, date: string = VIVALDI_PERFORMANCE.date): VivaldiSeat | undefined {
  return buildVivaldiSeatMap(date).find((seat) => seat.key === key);
}

export function getSelectableVivaldiSeats(date: string = VIVALDI_PERFORMANCE.date): VivaldiSeat[] {
  return buildVivaldiSeatMap(date).filter((s) => s.selectable);
}

export function countVivaldiSelectableSeats(date: string = VIVALDI_PERFORMANCE.date): number {
  return getSelectableVivaldiSeats(date).length;
}
