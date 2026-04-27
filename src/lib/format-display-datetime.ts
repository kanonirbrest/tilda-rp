/**
 * Короткий формат времени для интерфейса: «2026-04-27 19:17» (без секунд и суффикса Z).
 * Для типичных ISO-строк от API (`toISOString()`) берётся UTC-дата/время из строки.
 */
export function formatDisplayDateTime(iso: string | null | undefined): string {
  if (iso == null) return "—";
  const s = iso.trim();
  if (s === "") return "—";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  if (m) return `${m[1]} ${m[2]}:${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
