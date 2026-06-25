import {
  buildGardensSeatMap,
  getSelectableGardensSeats,
} from "@/lib/gardens-of-dreams/seat-map";
import {
  GARDENS_PERFORMANCE,
  formatGardensPerformanceTitle,
} from "@/lib/gardens-of-dreams/schedule";

const SELECTABLE_SEAT_COUNT = getSelectableGardensSeats().length;

/** Базовый набор «занятых» мест для мока (пусто — все A/B свободны). */
const BASE_MOCK_OCCUPIED: string[] = [];

export function gardensMockSlotId(date: string, time: string): string {
  return `mock-gardens-${date}-${time.replace(":", "")}`;
}

/** Детерминированно чуть разная занятость по сеансам. */
function mockOccupiedForSession(date: string, time: string): string[] {
  const seed = `${date}:${time}`.split("").reduce((n, c) => n + c.charCodeAt(0), 0);
  const extra = BASE_MOCK_OCCUPIED.filter((_, i) => (seed + i * 7) % 5 === 0);
  const drop = BASE_MOCK_OCCUPIED.filter((_, i) => (seed + i * 3) % 11 === 0);
  const set = new Set(BASE_MOCK_OCCUPIED);
  for (const key of extra) set.add(key);
  for (const key of drop) set.delete(key);
  return [...set];
}

/** Мок слотов: только при NEXT_PUBLIC_GARDENS_MOCK_SLOTS=true или ?mock=1. На проде по умолчанию выключен. */
export function isGardensMockEnabled(): boolean {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mock") === "0") return false;
    if (params.get("mock") === "1") return true;
  }
  return process.env.NEXT_PUBLIC_GARDENS_MOCK_SLOTS === "true";
}

export type GardensMockSession = {
  slotId: string;
  date: string;
  time: string;
  title: string;
  entryTime?: string;
  showDurationMinutes?: number;
  freeSeats: number;
  bookable: boolean;
};

export const GARDENS_MOCK_SESSION: GardensMockSession = (() => {
  const entry = GARDENS_PERFORMANCE;
  const occupied = mockOccupiedForSession(entry.date, entry.time);
  const freeSeats = Math.max(0, SELECTABLE_SEAT_COUNT - occupied.length);
  return {
    slotId: gardensMockSlotId(entry.date, entry.time),
    date: entry.date,
    time: entry.time,
    title: formatGardensPerformanceTitle(entry),
    entryTime: entry.entryTime,
    showDurationMinutes: entry.showDurationMinutes,
    freeSeats,
    bookable: freeSeats > 0,
  };
})();

/** @deprecated используйте GARDENS_MOCK_SESSION */
export const GARDENS_MOCK_SESSIONS = [GARDENS_MOCK_SESSION];

export function getGardensMockSeatMapResponse(session: {
  slotId: string;
  date: string;
  time: string;
  title: string;
}) {
  const occupied = mockOccupiedForSession(session.date, session.time);
  return {
    slotId: session.slotId,
    title: session.title,
    startsAt: `${session.date}T${session.time}:00.000Z`,
    currency: "BYN",
    seats: buildGardensSeatMap(),
    occupied,
  };
}

export function findGardensMockSession(slotId: string): GardensMockSession | undefined {
  return GARDENS_MOCK_SESSION.slotId === slotId ? GARDENS_MOCK_SESSION : undefined;
}
