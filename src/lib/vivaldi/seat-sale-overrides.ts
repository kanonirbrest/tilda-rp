import type { Prisma } from "@prisma/client";

/** Ключ места → true (открыть продажу) / false (снять с продажи). */
export type VivaldiSeatSaleOverrides = Record<string, boolean>;

const SEAT_KEY_RE = /^[ABC]:\d{1,2}:\d{1,2}$/;

export function parseVivaldiSeatSaleOverrides(
  raw: Prisma.JsonValue | null | undefined,
): VivaldiSeatSaleOverrides {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: VivaldiSeatSaleOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SEAT_KEY_RE.test(key)) continue;
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

export function isValidVivaldiSeatKey(key: string): boolean {
  return SEAT_KEY_RE.test(key.trim());
}
