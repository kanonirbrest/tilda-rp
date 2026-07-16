import type { Prisma } from "@prisma/client";

/** Ключ места → true (в продаже) / false (снято с продажи). */
export type GardensSeatSaleOverrides = Record<string, boolean>;

const SEAT_KEY_RE = /^[ABCD]:\d{1,2}:\d{1,2}$/;

export function parseGardensSeatSaleOverrides(
  raw: Prisma.JsonValue | null | undefined,
): GardensSeatSaleOverrides {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: GardensSeatSaleOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SEAT_KEY_RE.test(key)) continue;
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

export function isValidGardensSeatKey(key: string): boolean {
  return SEAT_KEY_RE.test(key.trim());
}
