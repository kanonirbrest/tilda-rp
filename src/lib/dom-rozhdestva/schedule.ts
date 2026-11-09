import { getExhibitionTimezone, wallDateAndTimeToUtc } from "@/lib/exhibition-time";

/** Единый билет, 30 BYN. TBD: порог повышения до 35 — Снежана напишет. */
export const DOM_ROZHDESTVA_PRICE_CENTS = 30_00;

/** Лимит на сеанс. Штатный Slot.capacity: гонка на 1–2 билета допустима. */
export const DOM_ROZHDESTVA_CAPACITY = 300;

/**
 * TBD: 25 декабря — 100 на время предпродажи, потом вернуть 300.
 * TBD: 19 декабря в списке не было — слоты не создаём.
 * 31.12 — только 11:00, 12:00, 13:00. 01.01 — 12:00–17:00. В остальные дни последний сеанс 18:00.
 * TBD: после 35 BYN — Взрослый/Детский (будни ≠ выходные) и Льготный. Неясно, остаётся ли Единый.
 */
const CAPACITY_BY_DATE: Record<string, number> = {
  "2026-12-25": 100,
};

const WEEKDAY_DATES = [
  "2026-12-09",
  "2026-12-10",
  "2026-12-11",
  "2026-12-14",
  "2026-12-15",
  "2026-12-16",
  "2026-12-17",
  "2026-12-18",
  "2026-12-21",
  "2026-12-22",
  "2026-12-23",
  "2026-12-24",
  "2027-01-08",
  "2027-01-11",
  "2027-01-12",
  "2027-01-13",
  "2027-01-14",
  "2027-01-15",
] as const;

const WEEKEND_DATES = [
  "2026-12-12",
  "2026-12-13",
  "2026-12-20",
  "2026-12-25",
  "2026-12-26",
  "2026-12-27",
  "2026-12-28",
  "2026-12-29",
  "2026-12-30",
  "2027-01-02",
  "2027-01-03",
  "2027-01-04",
  "2027-01-05",
  "2027-01-06",
  "2027-01-07",
  "2027-01-09",
  "2027-01-10",
  "2027-01-16",
  "2027-01-17",
] as const;

const WEEKDAY_HOURS = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"] as const;
const WEEKEND_HOURS = [
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
] as const;
const DEC_31_HOURS = ["11:00", "12:00", "13:00"] as const;
const JAN_1_HOURS = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"] as const;

export const DOM_ROZHDESTVA_SALES_OPENS = { date: "2026-11-06", time: "11:00" } as const;

export const DOM_ROZHDESTVA_SALES_CLOSED_HINT = "Продажа откроется 6 ноября в 11:00";

export type DomRozhdestvaSession = {
  date: string;
  time: string;
  capacity: number;
  priceCents: number;
};

function capacityForDate(date: string): number {
  return CAPACITY_BY_DATE[date] ?? DOM_ROZHDESTVA_CAPACITY;
}

function sessionsForDates(
  dates: readonly string[],
  hours: readonly string[],
): DomRozhdestvaSession[] {
  const out: DomRozhdestvaSession[] = [];
  for (const date of dates) {
    const capacity = capacityForDate(date);
    for (const time of hours) {
      out.push({ date, time, capacity, priceCents: DOM_ROZHDESTVA_PRICE_CENTS });
    }
  }
  return out;
}

export function listDomRozhdestvaSessions(): DomRozhdestvaSession[] {
  return [
    ...sessionsForDates(WEEKDAY_DATES, WEEKDAY_HOURS),
    ...sessionsForDates(WEEKEND_DATES, WEEKEND_HOURS),
    ...sessionsForDates(["2026-12-31"], DEC_31_HOURS),
    ...sessionsForDates(["2027-01-01"], JAN_1_HOURS),
  ];
}

export function formatDomRozhdestvaTitle(date: string, time: string): string {
  const [y, m, d] = date.split("-");
  return `Дом Рождества · ${d}.${m}.${y} · ${time}`;
}

export function isDomRozhdestvaSaleOpen(
  now = new Date(),
  timeZone = getExhibitionTimezone(),
): boolean {
  const opens = wallDateAndTimeToUtc(
    DOM_ROZHDESTVA_SALES_OPENS.date,
    DOM_ROZHDESTVA_SALES_OPENS.time,
    timeZone,
  );
  return opens != null && now >= opens;
}
