import { BELYE_NOCHI_18_SLOT_KIND, NIGHT_OF_MUSEUMS_SLOT_KIND } from "@/lib/slot-kind";

const TIME_RANGE_SUFFIX: Record<string, RegExp> = {
  [NIGHT_OF_MUSEUMS_SLOT_KIND]: /^Night\s+of\s+Museums\s+(.+)$/i,
  [BELYE_NOCHI_18_SLOT_KIND]: /^Белые\s+ночи\s+18\+\s+(.+)$/i,
};

/** Диапазон времени из заголовка слота: «… 22:00-03:00» → «22:00-03:00». */
export function parseEventSessionTimeRangeFromTitle(title: string, slotKind: string): string | null {
  const re = TIME_RANGE_SUFFIX[slotKind];
  if (!re) return null;
  const rest = re.exec(title.trim())?.[1]?.trim();
  return rest || null;
}

/** Для UI: «21:00 - 00:00» с пробелами вокруг тире. */
export function formatEventSessionRangeForUi(raw: string): string {
  const trimmed = raw.trim();
  const m = /^(\d{1,2}:\d{2})\s*[\u2013\u2014\-]\s*(\d{1,2}:\d{2})$/.exec(trimmed);
  if (m) return `${m[1]} - ${m[2]}`;
  return trimmed;
}
