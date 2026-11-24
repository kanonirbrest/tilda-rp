import { randomBytes } from "crypto";
import { parseTicketToken } from "@/lib/parse-qr-token";

/** Crockford Base32 без I, L, O, U — удобно диктовать и набирать с бумаги. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const PRINT_TICKET_TOKEN_LENGTH = 10;
export const PRINT_TICKET_ISSUE_MIN = 1;
export const PRINT_TICKET_ISSUE_MAX = 1000;

export function createPrintTicketToken(): string {
  const bytes = randomBytes(PRINT_TICKET_TOKEN_LENGTH);
  let out = "";
  for (let i = 0; i < PRINT_TICKET_TOKEN_LENGTH; i++) {
    out += CROCKFORD[bytes[i]! % 32];
  }
  return out;
}

/** Для печати и экрана: XXXXX-XXXXX. */
export function formatPrintTicketToken(token: string): string {
  const compact = normalizePrintTicketToken(token);
  if (compact.length === PRINT_TICKET_TOKEN_LENGTH) {
    return `${compact.slice(0, 5)}-${compact.slice(5)}`;
  }
  return token;
}

export function formatPrintSerial(serial: number): string {
  return String(serial).padStart(5, "0");
}

/** Верхний регистр, без дефисов/пробелов, I/L→1, O→0, U→V. */
export function normalizePrintTicketToken(raw: string): string {
  return raw
    .replace(/[-\s]/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

export function printTicketQrUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/r?t=${encodeURIComponent(token)}`;
}

/** Кандидаты для поиска в БД: как пришло из сканера и нормализованный печатный код. */
export function ticketTokenLookupCandidates(raw: string): string[] {
  const parsed = parseTicketToken(raw).trim();
  if (parsed.length < 8 || parsed.length > 200) return [];
  const compact = normalizePrintTicketToken(parsed);
  const out: string[] = [];
  const add = (v: string) => {
    if (v && !out.includes(v)) out.push(v);
  };
  add(parsed);
  if (compact.length >= 8) add(compact);
  return out;
}
