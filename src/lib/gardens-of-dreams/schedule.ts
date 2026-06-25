/**
 * Единственный показ «Сады сновидений».
 * Схема зала и цены — в seat-map.ts.
 * Слот в БД создаётся автоматически при первом запросе витрины.
 */
export type GardensScheduleEntry = {
  date: string;
  /** Время начала шоу (слот в БД). */
  time: string;
  /** Время входа на выставку (для витрины и PDF). */
  entryTime?: string;
  showDurationMinutes?: number;
  title?: string;
};

export const GARDENS_PERFORMANCE: GardensScheduleEntry = {
  date: "2026-07-06",
  time: "20:00",
  entryTime: "18:30",
  showDurationMinutes: 60,
};

/** Для ensure-slots — всегда один элемент. */
export const GARDENS_PERFORMANCE_SCHEDULE: GardensScheduleEntry[] = [GARDENS_PERFORMANCE];

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
  if (GARDENS_PERFORMANCE.date === date && GARDENS_PERFORMANCE.time === time) {
    return {
      entryTime: GARDENS_PERFORMANCE.entryTime,
      showDurationMinutes: GARDENS_PERFORMANCE.showDurationMinutes,
    };
  }
  return {};
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
