/**
 * Единая модель денег в проекте:
 * - В PostgreSQL, в заказах и в bePaid (`checkout.order.amount`) суммы хранятся/передаются в
 *   минимальных единицах валюты (для BYN — копейки).
 * - Для экранов, писем, PDF и внешних вебхуков «человеческий» вид — через formatMinorUnits /
 *   ввод в основных единицах (рубли) через parseMajorUnitsToMinor.
 */

export function formatMinorUnits(minorUnits: number, currency: string): string {
  const n = Number(minorUnits);
  if (!Number.isFinite(n)) return `0.00 ${currency}`;
  return `${(n / 100).toFixed(2)} ${currency}`;
}

/** Число в основных единицах (например рублей) для полей формы без суффикса валюты. */
export function minorToMajorNumber(minorUnits: number): number {
  const n = Number(minorUnits);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

export function parseMajorUnitsToMinor(raw: string): number {
  const t = raw.trim().replace(",", ".");
  if (t === "") return 0;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function parseOptionalMajorUnitsToMinor(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
