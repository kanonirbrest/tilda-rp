const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

function validateBirthDateParts(y: number, mo: number, d: number): Date | null {
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  const todayYmd = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Minsk" });
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  const todayUtc = Date.UTC(ty!, tm! - 1, td!);
  if (dt.getTime() > todayUtc) return null;
  return dt;
}

/** YYYY-MM-DD или ДД.ММ.ГГГГ → Date (UTC полночь) или null. */
export function parseBirthDate(raw: string): Date | null {
  const trimmed = raw.trim();
  let m = YMD_RE.exec(trimmed);
  if (m) return validateBirthDateParts(Number(m[1]), Number(m[2]), Number(m[3]));
  m = DMY_RE.exec(trimmed);
  if (m) return validateBirthDateParts(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

export function birthDateToYmd(raw: string): string | null {
  const dt = parseBirthDate(raw);
  if (!dt) return null;
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Маска ввода: только цифры, авто-точки → ДД.ММ.ГГГГ */
export function formatBirthDateRuInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export function formatBirthDateRu(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = YMD_RE.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
