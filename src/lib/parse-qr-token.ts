/** Извлекает publicToken из сырой строки QR (URL с ?t= или просто токен). */
export function parseTicketToken(raw: string): string {
  // Сканеры часто добавляют CR/LF; иногда BOM или нулевые байты.
  const s = raw.replace(/^\uFEFF/, "").replace(/[\0\r\n]+/g, "").trim();
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
