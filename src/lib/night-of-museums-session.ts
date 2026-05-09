/**
 * Диапазон времени из заголовка слота Ночи музеев: «Night of Museums 21:00-00:00» → «21:00-00:00».
 */
export function parseNightOfMuseumsTimeRangeFromTitle(title: string): string | null {
  const m = /^Night\s+of\s+Museums\s+(.+)$/i.exec(title.trim());
  const rest = m?.[1]?.trim();
  return rest || null;
}

/** Для UI: «21:00 - 00:00» с пробелами вокруг тире. */
export function formatNightSessionRangeForUi(raw: string): string {
  const trimmed = raw.trim();
  const m = /^(\d{1,2}:\d{2})\s*[\u2013\u2014\-]\s*(\d{1,2}:\d{2})$/.exec(trimmed);
  if (m) return `${m[1]} - ${m[2]}`;
  return trimmed;
}
