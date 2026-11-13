import type { TicketTier } from "@prisma/client";
import { dateKeyInTz } from "@/lib/exhibition-time";
import { tierTicketSingularRu } from "@/lib/slot-pricing";
import {
  DOM_ROZHDESTVA_PRICE_V2_AT,
  isDomRozhdestvaWeekendDate,
} from "@/lib/dom-rozhdestva/schedule";

const ADULT_ANY_CENTS = 35_00;
const ADULT_WEEKDAY_CENTS = 40_00;
const ADULT_WEEKEND_CENTS = 45_00;
const CHILD_FLAT_OR_WEEKDAY_CENTS = 30_00;
const CHILD_WEEKEND_CENTS = 35_00;
const UNIFIED_CENTS = 30_00;

/** Строки отчёта «Дом Рождества», включая старые номиналы. Нулевые тоже показываем. */
export const DOM_ROZHDESTVA_SALES_CATALOG: { key: string; label: string }[] = [
  { key: "dr:unified-30", label: "Единый 30" },
  { key: "dr:adult-35", label: "Взрослый (любой день) 35" },
  { key: "dr:child-30-any", label: "Детский (любой день) 30" },
  { key: "dr:adult-40", label: "Взрослый 40" },
  { key: "dr:adult-45", label: "Взрослый 45" },
  { key: "dr:child-30-weekday", label: "Детский (будний) 30" },
  { key: "dr:child-35", label: "Детский 35" },
  { key: "dr:concession", label: "Льготный" },
];

const CATALOG_BY_KEY = new Map(DOM_ROZHDESTVA_SALES_CATALOG.map((row) => [row.key, row.label]));

type PriceLine = { tier: TicketTier; unitPriceCents: number };

function catalog(key: string): { key: string; label: string } {
  return { key, label: CATALOG_BY_KEY.get(key) ?? key };
}

function unitPrice(lines: PriceLine[], tier: TicketTier | null): number | null {
  if (tier == null) {
    return lines.length === 1 ? lines[0]!.unitPriceCents : null;
  }
  const matched = lines.filter((line) => line.tier === tier);
  return matched[0]?.unitPriceCents ?? null;
}

function child30Key(
  orderCreatedAt: Date,
  slotDateKey: string,
  adultUnitCents: number | null,
): string {
  if (adultUnitCents === ADULT_WEEKDAY_CENTS) return "dr:child-30-weekday";
  if (adultUnitCents === ADULT_ANY_CENTS) return "dr:child-30-any";
  if (isDomRozhdestvaWeekendDate(slotDateKey)) return "dr:child-30-any";
  if (orderCreatedAt >= DOM_ROZHDESTVA_PRICE_V2_AT) return "dr:child-30-weekday";
  return "dr:child-30-any";
}

function otherLabel(tier: TicketTier | null, unitCents: number | null): string {
  const name = tier ? tierTicketSingularRu(tier) : "Без типа";
  if (unitCents == null) return name;
  return `${name} ${unitCents / 100}`;
}

/** Ключ строки отчёта: тип билета и номинал, по которому его продали. */
export function domRozhdestvaReportKey(input: {
  tier: TicketTier | null;
  lines: PriceLine[];
  slotStartsAt: Date;
  orderCreatedAt: Date;
  timeZone: string;
}): { key: string; label: string } {
  const unit = unitPrice(input.lines, input.tier);
  const adultUnit = input.lines.find((line) => line.tier === "ADULT")?.unitPriceCents ?? null;
  const slotDateKey = dateKeyInTz(input.slotStartsAt, input.timeZone);

  if (input.tier === "CONCESSION") return catalog("dr:concession");
  if (input.tier == null && unit === UNIFIED_CENTS) return catalog("dr:unified-30");
  if (input.tier === "ADULT" && unit === ADULT_ANY_CENTS) return catalog("dr:adult-35");
  if (input.tier === "ADULT" && unit === ADULT_WEEKDAY_CENTS) return catalog("dr:adult-40");
  if (input.tier === "ADULT" && unit === ADULT_WEEKEND_CENTS) return catalog("dr:adult-45");
  if (input.tier === "CHILD" && unit === CHILD_WEEKEND_CENTS) return catalog("dr:child-35");
  if (input.tier === "CHILD" && unit === CHILD_FLAT_OR_WEEKDAY_CENTS) {
    return catalog(child30Key(input.orderCreatedAt, slotDateKey, adultUnit));
  }

  const key = `dr:other:${input.tier ?? "none"}:${unit ?? "na"}`;
  return { key, label: otherLabel(input.tier, unit) };
}
