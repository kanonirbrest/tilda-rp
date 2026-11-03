import { DateTime } from "luxon";
import { parseEventSessionTimeRangeFromTitle } from "@/lib/event-session-title";
import { dateKeyInTz, getExhibitionTimezone, timeKeyInTz } from "@/lib/exhibition-time";
import { BELYE_NOCHI_18_SLOT_KIND, NIGHT_OF_MUSEUMS_SLOT_KIND } from "@/lib/slot-kind";

/** Сколько минут после полуночи ещё пускаем ночной билет, если сеанс не кончается позже. */
const NIGHT_NEXT_DAY_GRACE_MINUTES = 2 * 60;

const RANGE_IN_TITLE = /(\d{1,2}:\d{2})\s*[\u2013\u2014\-]\s*(\d{1,2}:\d{2})/;

function minutesOfDay(hhMm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhMm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function sessionRangeMinutes(title: string, kind: string): { start: number; end: number } | null {
  const fromKind = parseEventSessionTimeRangeFromTitle(title, kind);
  const raw = fromKind ?? RANGE_IN_TITLE.exec(title)?.[0] ?? null;
  if (!raw) return null;
  const m = RANGE_IN_TITLE.exec(raw);
  if (!m) return null;
  const start = minutesOfDay(m[1]!);
  const end = minutesOfDay(m[2]!);
  if (start == null || end == null || start === end) return null;
  return { start, end };
}

function isNightStorefront(kind: string): boolean {
  return kind === NIGHT_OF_MUSEUMS_SLOT_KIND || kind === BELYE_NOCHI_18_SLOT_KIND;
}

/**
 * Ночной билет можно погасить ещё в начале следующих суток.
 * Окно — 2 часа после полуночи, либо до конца сеанса, если он указан позже (например 03:00).
 * null — билет не ночной, следующий день закрыт.
 */
export function nightCheckInGraceMinutes(slot: { kind: string; title: string }): number | null {
  const range = sessionRangeMinutes(slot.title, slot.kind);
  const crossesMidnight = range != null && range.end < range.start;
  if (!isNightStorefront(slot.kind) && !crossesMidnight) return null;
  const spill = crossesMidnight && range.end > 0 ? range.end : 0;
  return Math.max(NIGHT_NEXT_DAY_GRACE_MINUTES, spill);
}

/** День сеанса, либо ранние часы следующего дня для ночного билета. */
export function isTicketCheckInDayOpen(
  slot: { kind: string; title: string; startsAt: Date },
  now = new Date(),
  timeZone = getExhibitionTimezone(),
): boolean {
  const sessionDay = dateKeyInTz(slot.startsAt, timeZone);
  const today = dateKeyInTz(now, timeZone);
  if (sessionDay === today) return true;

  const grace = nightCheckInGraceMinutes(slot);
  if (grace == null) return false;

  const nextDay = DateTime.fromJSDate(slot.startsAt, { zone: timeZone })
    .startOf("day")
    .plus({ days: 1 })
    .toFormat("yyyy-MM-dd");
  if (today !== nextDay) return false;

  const nowMinutes = minutesOfDay(timeKeyInTz(now, timeZone));
  if (nowMinutes == null) return false;
  return nowMinutes <= grace;
}
