import { dateKeyInTz, getExhibitionTimezone } from "@/lib/exhibition-time";

/**
 * Показы «Времена года. Антонио Вивальди».
 * Цены и доступность мест — в seat-map.ts, по дате.
 * Слоты в БД создаются при первом запросе витрины.
 */
export type VivaldiPerformance = {
  date: string;
  time: string;
  /** Автоскидка 10% от 3 билетов. На 26 октября её нет. */
  volumeDiscount: boolean;
};

export const VIVALDI_PERFORMANCE_OCTOBER_13: VivaldiPerformance = {
  date: "2026-10-13",
  time: "20:00",
  volumeDiscount: true,
};

export const VIVALDI_PERFORMANCE_OCTOBER_26: VivaldiPerformance = {
  date: "2026-10-26",
  time: "20:00",
  volumeDiscount: false,
};

export const VIVALDI_PERFORMANCES: VivaldiPerformance[] = [
  VIVALDI_PERFORMANCE_OCTOBER_13,
  VIVALDI_PERFORMANCE_OCTOBER_26,
];

/** Первый показ — обратная совместимость. */
export const VIVALDI_PERFORMANCE = VIVALDI_PERFORMANCE_OCTOBER_13;

export function vivaldiPerformanceByDate(date: string): VivaldiPerformance | undefined {
  return VIVALDI_PERFORMANCES.find((entry) => entry.date === date);
}

export function vivaldiDateForStartsAt(startsAt: Date): string {
  return dateKeyInTz(startsAt, getExhibitionTimezone());
}

export function vivaldiVolumeDiscountApplies(date: string): boolean {
  return vivaldiPerformanceByDate(date)?.volumeDiscount === true;
}

export function formatVivaldiPerformanceTitle(
  entry: VivaldiPerformance = VIVALDI_PERFORMANCE,
): string {
  return `Времена года. Антонио Вивальди — ${formatVivaldiPerformanceDateLabel(entry.date)}, ${entry.time}`;
}

export function formatVivaldiPerformanceDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
