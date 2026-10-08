import { DateTime } from "luxon";

/** Единственный рабочий пояс витрины и билетов (Минск). */
export const EXHIBITION_TIMEZONE_DEFAULT = "Europe/Minsk";

/** Часовой пояс выставления/сеансов (Тильда + БД + PDF). По умолчанию — Минск. */
export function getExhibitionTimezone(): string {
  const raw = process.env.EXHIBITION_TIMEZONE?.trim();
  return raw || EXHIBITION_TIMEZONE_DEFAULT;
}

/** `datetime-local` (YYYY-MM-DDTHH:mm) → UTC-инстант по стенным часам выставки. */
export function wallDatetimeLocalInputToUtc(
  dateTimeLocal: string,
  timeZone: string = getExhibitionTimezone(),
): Date | null {
  const m = dateTimeLocal.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const time = normalizeTimeInput(`${m[2]}:${m[3]}`);
  if (!time) return null;
  return wallDateAndTimeToUtc(m[1]!, time, timeZone);
}

/**
 * Календарная дата + время на стене выставки (например Europe/Minsk) → момент в UTC.
 * Надёжнее, чем toLocaleTimeString/toLocaleDateString на сервере (ICU/образы Node).
 */
export function wallDateAndTimeToUtc(dateYmd: string, timeHhMm: string, timeZone: string): Date | null {
  const dm = dateYmd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const tm = timeHhMm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return null;
  const hh = Number(tm[1]);
  const mi = Number(tm[2]);
  if (![y, mo, d, hh, mi].every((n) => Number.isFinite(n))) return null;
  const dt = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: hh, minute: mi, second: 0, millisecond: 0 },
    { zone: timeZone },
  );
  if (!dt.isValid) return null;
  return dt.toJSDate();
}

export type WallDaysRange = {
  start: Date;
  end: Date;
  from: string;
  to: string;
  /** Включительно, по календарным датам, без учёта перевода часов. */
  dayCount: number;
};

/** UTC-интервал [start, end], покрывающий календарные сутки dateYmd в timeZone (для выборки слотов за день). */
export function wallDayUtcRange(dateYmd: string, timeZone: string): { start: Date; end: Date } | null {
  const dm = dateYmd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  if (![y, mo, d].every((n) => Number.isFinite(n))) return null;
  const base = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: 0, minute: 0, second: 0, millisecond: 0 },
    { zone: timeZone },
  );
  if (!base.isValid) return null;
  const start = base.startOf("day").toUTC();
  const end = base.endOf("day").toUTC();
  return { start: start.toJSDate(), end: end.toJSDate() };
}

/**
 * UTC-интервал от начала календарного дня fromYmd до конца toYmd в timeZone.
 * fromYmd должен быть не позже toYmd. Некорректная или перевёрнутая пара — null.
 */
export function wallDaysUtcRange(
  fromYmd: string,
  toYmd: string,
  timeZone: string,
): WallDaysRange | null {
  const fromKey = fromYmd.trim();
  const toKey = toYmd.trim();
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(fromKey) || !/^(\d{4})-(\d{2})-(\d{2})$/.test(toKey)) {
    return null;
  }
  if (fromKey > toKey) return null;
  const from = wallDayUtcRange(fromKey, timeZone);
  const to = wallDayUtcRange(toKey, timeZone);
  if (!from || !to) return null;
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const dayCount = Math.round((Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000) + 1;
  return { start: from.start, end: to.end, from: fromKey, to: toKey, dayCount };
}

export function dateKeyInTz(iso: Date, tz: string): string {
  return iso.toLocaleDateString("en-CA", { timeZone: tz });
}

function wallTimeToMinutes(hhMm: string): number | null {
  const norm = normalizeTimeInput(hhMm);
  if (!norm) return null;
  const [h, m] = norm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * Для выбранного календарного дня: сеанс HH:mm уже прошёл по стенным часам выставки.
 * Пример: сейчас 15:00 — 14:00 прошло, 15:00 ещё нет.
 */
export function isWallSessionTimeBeforeNow(
  dateYmd: string,
  timeHhMm: string,
  timeZone: string,
  now = new Date(),
): boolean {
  if (dateKeyInTz(now, timeZone) !== dateYmd.trim()) return false;
  const slotMins = wallTimeToMinutes(timeHhMm);
  const nowMins = wallTimeToMinutes(timeKeyInTz(now, timeZone));
  if (slotMins == null || nowMins == null) return false;
  return slotMins < nowMins;
}

/** Календарный день целиком в прошлом (строго до «сегодня» по стенным часам выставки). */
export function isWallCalendarDayBeforeToday(
  dateYmd: string,
  timeZone: string,
  now = new Date(),
): boolean {
  return dateYmd.trim() < dateKeyInTz(now, timeZone);
}

/** Дата события для билета/PDF (длинный месяц, верхний регистр снаружи). */
export function formatWallDateLongRu(d: Date, tz: string): string {
  return d
    .toLocaleDateString("ru-RU", {
      timeZone: tz,
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** "HH:MM" 24h */
export function timeKeyInTz(iso: Date, tz: string): string {
  const s = iso.toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return s.length === 5 ? s : padTime(s);
}

function padTime(s: string): string {
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return "12:00";
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

/** Нормализует "14:00", "14:0", "9:30" → HH:mm */
export function normalizeTimeInput(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
