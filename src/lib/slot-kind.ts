const SLOT_KIND_RE = /^[A-Z0-9_-]{1,64}$/;

export const NEBO_REKA_SLOT_KIND = "NEBO_REKA";
export const NIGHT_OF_MUSEUMS_SLOT_KIND = "NIGHT_OF_MUSEUMS";
export const BELYE_NOCHI_18_SLOT_KIND = "BELYE_NOCHI_18";
export const GARDENS_OF_DREAMS_SLOT_KIND = "GARDENS_OF_DREAMS";
export const SLOT_KIND_OPTIONS = [
  NEBO_REKA_SLOT_KIND,
  NIGHT_OF_MUSEUMS_SLOT_KIND,
  BELYE_NOCHI_18_SLOT_KIND,
  GARDENS_OF_DREAMS_SLOT_KIND,
] as const;
const SLOT_KIND_SET = new Set<string>(SLOT_KIND_OPTIONS);

/** Сеансы с диапазоном времени в title и двухстрочной датой на PDF. */
export function isEventSessionSlotKind(kind: string): boolean {
  return (
    kind === NIGHT_OF_MUSEUMS_SLOT_KIND ||
    kind === BELYE_NOCHI_18_SLOT_KIND ||
    kind === GARDENS_OF_DREAMS_SLOT_KIND
  );
}

export function normalizeSlotKind(input: string | null | undefined): string {
  const raw = String(input ?? "")
    .trim()
    .toUpperCase();
  if (!raw) return NEBO_REKA_SLOT_KIND;
  if (!SLOT_KIND_RE.test(raw)) return NEBO_REKA_SLOT_KIND;
  return SLOT_KIND_SET.has(raw) ? raw : NEBO_REKA_SLOT_KIND;
}

export function parseOptionalSlotKind(input: string | null | undefined): string | null {
  const raw = String(input ?? "")
    .trim()
    .toUpperCase();
  if (!raw) return null;
  if (!SLOT_KIND_RE.test(raw)) return null;
  return SLOT_KIND_SET.has(raw) ? raw : null;
}
