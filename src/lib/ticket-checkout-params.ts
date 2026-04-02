/** Параметры adult/child/concession из query (Тильда, /pay). */
export function parseTicketCountParam(v: string | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** В ссылке переданы и date, и time (типичный сценарий Тильды). */
export function hasDateAndTimeInQuery(
  date: string | null | undefined,
  time: string | null | undefined,
): boolean {
  return Boolean(date?.trim() && time?.trim());
}

export type TicketCounts = { adult: number; child: number; concession: number };

/**
 * Если количества не заданы: при ссылке с date+time — ошибка; иначе по умолчанию 1 взрослый (например только slotId).
 */
export function normalizeTicketCounts(
  adult: number,
  child: number,
  concession: number,
  opts: { requireCountsWhenDateTime: boolean },
): { ok: true; counts: TicketCounts } | { ok: false } {
  if (adult + child + concession > 0) {
    return { ok: true, counts: { adult, child, concession } };
  }
  if (opts.requireCountsWhenDateTime) {
    return { ok: false };
  }
  return { ok: true, counts: { adult: 1, child: 0, concession: 0 } };
}
