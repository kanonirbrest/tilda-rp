import {
  buildGardensSeatMap,
  countGardensSelectableSeats,
  getGardensSeat,
  type GardensSeatMapVariant,
} from "@/lib/gardens-of-dreams/seat-map";
import {
  findGardensScheduleEntryByDate,
  formatGardensPerformanceTitle,
  GARDENS_PERFORMANCE_JULY_6,
  GARDENS_PERFORMANCE_JULY_20,
} from "@/lib/gardens-of-dreams/schedule";

/** Базовый набор «занятых» мест для мока (пусто — все A/B свободны). */
const BASE_MOCK_OCCUPIED: string[] = [];

export function gardensMockSlotId(date: string, time: string): string {
  return `mock-gardens-${date}-${time.replace(":", "")}`;
}

function mockVariantForDate(date: string): GardensSeatMapVariant {
  return findGardensScheduleEntryByDate(date)?.seatMapVariant ?? "default";
}

/** Детерминированно чуть разная занятость по сеансам. */
function mockOccupiedForSession(date: string, time: string): string[] {
  const variant = mockVariantForDate(date);
  const seed = `${date}:${time}`.split("").reduce((n, c) => n + c.charCodeAt(0), 0);
  const extra = BASE_MOCK_OCCUPIED.filter((_, i) => (seed + i * 7) % 5 === 0);
  const drop = BASE_MOCK_OCCUPIED.filter((_, i) => (seed + i * 3) % 11 === 0);
  const set = new Set(BASE_MOCK_OCCUPIED);
  for (const key of extra) set.add(key);
  for (const key of drop) set.delete(key);
  return [...set].filter((key) => getGardensSeat(key, variant)?.selectable);
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

function buildMockSession(eventDate: string): GardensMockSession {
  const entry = findGardensScheduleEntryByDate(eventDate) ?? GARDENS_PERFORMANCE_JULY_6;
  const variant = entry.seatMapVariant ?? "default";
  const occupied = mockOccupiedForSession(entry.date, entry.time);
  const selectableCount = countGardensSelectableSeats(variant);
  const freeSeats = Math.max(0, selectableCount - occupied.length);
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
}

export const GARDENS_MOCK_SESSION = buildMockSession(GARDENS_PERFORMANCE_JULY_6.date);

/** @deprecated используйте GARDENS_MOCK_SESSION */
export const GARDENS_MOCK_SESSIONS = [GARDENS_MOCK_SESSION];

export function getGardensMockSession(eventDate: string): GardensMockSession {
  return buildMockSession(eventDate);
}

export function getGardensMockSeatMapResponse(session: {
  slotId: string;
  date: string;
  time: string;
  title: string;
}) {
  const variant = mockVariantForDate(session.date);
  const occupied = mockOccupiedForSession(session.date, session.time);
  return {
    slotId: session.slotId,
    title: session.title,
    startsAt: `${session.date}T${session.time}:00.000Z`,
    currency: "BYN",
    seats: buildGardensSeatMap(variant),
    occupied,
  };
}

export function findGardensMockSession(slotId: string): GardensMockSession | undefined {
  for (const date of [GARDENS_PERFORMANCE_JULY_6.date, GARDENS_PERFORMANCE_JULY_20.date]) {
    const session = buildMockSession(date);
    if (session.slotId === slotId) return session;
  }
  return undefined;
}
