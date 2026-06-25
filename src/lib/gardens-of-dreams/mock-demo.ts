import {
  buildGardensSeatMap,
  getSelectableGardensSeats,
} from "@/lib/gardens-of-dreams/seat-map";
import {
  GARDENS_PERFORMANCE,
  formatGardensPerformanceTitle,
} from "@/lib/gardens-of-dreams/schedule";

const SELECTABLE_SEAT_COUNT = getSelectableGardensSeats().length;

/** Базовый набор «занятых» мест для мока. */
const BASE_MOCK_OCCUPIED = [
  "B:1:1",
  "B:1:2",
  "B:1:3",
  "B:1:12",
  "B:1:13",
  "B:1:25",
  "B:1:30",
  "B:2:5",
  "B:2:6",
  "B:2:7",
  "B:2:18",
  "B:2:19",
  "A:1:1",
  "A:1:4",
  "A:2:2",
  "A:2:3",
  "A:3:5",
];

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

/** Мок слотов включён, пока не задеплоен боевой API. ?mock=0 — принудительно API. */
export function isGardensMockEnabled(): boolean {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mock") === "0") return false;
    if (params.get("mock") === "1") return true;
  }
  return process.env.NEXT_PUBLIC_GARDENS_MOCK_SLOTS !== "false";
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
