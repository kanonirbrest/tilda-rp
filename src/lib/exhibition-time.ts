import { DateTime } from "luxon";

/** Часовой пояс выставления/сеансов (Тильда + БД). */
export function getExhibitionTimezone(): string {
  return process.env.EXHIBITION_TIMEZONE?.trim() || "Europe/Minsk";
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

export function dateKeyInTz(iso: Date, tz: string): string {
  return iso.toLocaleDateString("en-CA", { timeZone: tz });
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
