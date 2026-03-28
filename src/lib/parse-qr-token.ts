/** Извлекает publicToken из сырой строки QR (URL с ?t= или просто токен). */
export function parseTicketToken(raw: string): string {
  const s = raw.trim();
  try {
    const u = new URL(s);
    const t = u.searchParams.get("t");
    if (t) return t.trim();
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.length >= 16) return last;
  } catch {
    /* не URL */
  }
  return s;
}
