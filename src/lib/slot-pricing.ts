import type { Slot, TicketTier } from "@prisma/client";

export function unitPriceCents(slot: Slot, tier: TicketTier): number {
  switch (tier) {
    case "ADULT":
      return slot.priceAdultCents ?? slot.priceCents;
    case "CHILD":
      return slot.priceChildCents ?? slot.priceCents;
    case "CONCESSION":
      return slot.priceConcessionCents ?? slot.priceCents;
    default:
      return slot.priceCents;
  }
}

export type LineInput = { tier: TicketTier; quantity: number };

export function buildLinesFromCounts(slot: Slot, counts: { adult: number; child: number; concession: number }): LineInput[] {
  const out: LineInput[] = [];
  if (counts.adult > 0) out.push({ tier: "ADULT", quantity: counts.adult });
  if (counts.child > 0) out.push({ tier: "CHILD", quantity: counts.child });
  if (counts.concession > 0) out.push({ tier: "CONCESSION", quantity: counts.concession });
  return out;
}

export function totalCentsForLines(slot: Slot, lines: LineInput[]): number {
  let sum = 0;
  for (const l of lines) {
    sum += l.quantity * unitPriceCents(slot, l.tier);
  }
  return sum;
}

export function totalAdmission(lines: LineInput[]): number {
  return lines.reduce((a, l) => a + l.quantity, 0);
}

const TIER_RU: Record<TicketTier, string> = {
  ADULT: "взрослых",
  CHILD: "детских",
  CONCESSION: "льготных",
};

export function linesSummaryRu(lines: { tier: TicketTier; quantity: number }[]): string {
  const parts = lines
    .filter((l) => l.quantity > 0)
    .map((l) => `${TIER_RU[l.tier]}: ${l.quantity}`);
  return parts.length ? parts.join(", ") : "";
}
