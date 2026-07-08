import {
  dateKeyInTz,
  getExhibitionTimezone,
  timeKeyInTz,
} from "@/lib/exhibition-time";
import type { GardensSeatMapVariant } from "@/lib/gardens-of-dreams/seat-map";

/**
 * Показы «Сады сновидений».
 * Схема зала и цены — в seat-map.ts (вариант `seatMapVariant`).
 * Слоты в БД создаются автоматически при первом запросе витрины.
 */
export type GardensScheduleEntry = {
  date: string;
  /** Время начала шоу (слот в БД). */
  time: string;
  /** Время входа на выставку (для витрины и PDF). */
  entryTime?: string;
  showDurationMinutes?: number;
  title?: string;
  /** default — A+B+часть C; ab-only — только сектора A и B (как на первом ивенте). */
  seatMapVariant?: GardensSeatMapVariant;
};

export const GARDENS_PERFORMANCE_JULY_6: GardensScheduleEntry = {
  date: "2026-07-06",
  time: "20:00",
  entryTime: "18:30",
  showDurationMinutes: 60,
  seatMapVariant: "default",
};

export const GARDENS_PERFORMANCE_JULY_19_1700: GardensScheduleEntry = {
  date: "2026-07-19",
  time: "17:00",
  entryTime: "15:30",
  showDurationMinutes: 60,
  seatMapVariant: "ab-only",
};

export const GARDENS_PERFORMANCE_JULY_19_2030: GardensScheduleEntry = {
  date: "2026-07-19",
  time: "20:30",
  entryTime: "19:00",
  showDurationMinutes: 60,
  seatMapVariant: "ab-only",
};

export const GARDENS_PERFORMANCE_JULY_20: GardensScheduleEntry = {
  date: "2026-07-20",
  time: "20:00",
  entryTime: "18:30",
  showDurationMinutes: 60,
  seatMapVariant: "ab-only",
};

/** Бывшая дата второго показа — для переноса слота в БД при деплое. */
export const GARDENS_LEGACY_JULY_21_DATE = "2026-07-21";

/** Первый показ (6 июля) — для обратной совместимости. */
export const GARDENS_PERFORMANCE = GARDENS_PERFORMANCE_JULY_6;

export const GARDENS_PERFORMANCE_SCHEDULE: GardensScheduleEntry[] = [
  GARDENS_PERFORMANCE_JULY_6,
  GARDENS_PERFORMANCE_JULY_19_1700,
  GARDENS_PERFORMANCE_JULY_19_2030,
  GARDENS_PERFORMANCE_JULY_20,
];

export function findGardensScheduleEntry(
  date: string,
  time: string,
): GardensScheduleEntry | undefined {
  return GARDENS_PERFORMANCE_SCHEDULE.find((e) => e.date === date && e.time === time);
}

export function findGardensScheduleEntryByDate(date: string): GardensScheduleEntry | undefined {
  return GARDENS_PERFORMANCE_SCHEDULE.find((e) => e.date === date);
}

export function getGardensSeatMapVariantForSchedule(
  date: string,
  time: string,
): GardensSeatMapVariant {
  return findGardensScheduleEntry(date, time)?.seatMapVariant ?? "default";
}

export function getGardensSeatMapVariantForSlot(
  startsAt: Date,
  tz = getExhibitionTimezone(),
): GardensSeatMapVariant {
  const date = dateKeyInTz(startsAt, tz);
  const time = timeKeyInTz(startsAt, tz);
  return getGardensSeatMapVariantForSchedule(date, time);
}

export function formatGardensPerformanceTitle(entry: GardensScheduleEntry): string {
  const [y, m, d] = entry.date.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const datePart = dt.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (entry.title?.trim()) return entry.title.trim();
  const entryPart = entry.entryTime ? `, вход ${entry.entryTime}, шоу ${entry.time}` : `, ${entry.time}`;
  return `Сады сновидений — ${datePart}${entryPart}`;
}

export function formatGardensPerformanceDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function gardensScheduleMeta(
  date: string,
  time: string,
): Pick<GardensScheduleEntry, "entryTime" | "showDurationMinutes"> {
  const entry = findGardensScheduleEntry(date, time);
  if (!entry) return {};
  return {
    entryTime: entry.entryTime,
    showDurationMinutes: entry.showDurationMinutes,
  };
}

/** Строки «Дата и время» на PDF-билете «Сады сновидений». */
export function formatGardensTicketTimeLines(
  dateKey: string,
  showTime: string,
): { entryLine: string; showLine: string } {
  const meta = gardensScheduleMeta(dateKey, showTime);
  const entry = meta.entryTime ?? GARDENS_PERFORMANCE.entryTime ?? "";
  const duration = meta.showDurationMinutes ?? GARDENS_PERFORMANCE.showDurationMinutes ?? 60;
  return {
    entryLine: entry ? `${entry} — вход на выставку` : "",
    showLine: `${showTime} — шоу (${duration} минут)`,
  };
}
