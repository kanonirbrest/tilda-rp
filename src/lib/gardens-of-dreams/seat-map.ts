export const GARDENS_PREMIUM_CENTS = 15_000;
export const GARDENS_STANDARD_CENTS = 12_000;
export const GARDENS_ECONOMY_CENTS = 9_000;

export type GardensSeatTier = "premium" | "standard" | "economy" | "sold";

export type GardensSeat = {
  key: string;
  sector: "A" | "B" | "C" | "D";
  row: number;
  seat: number;
  priceCents: number;
  tier: GardensSeatTier;
  /** false — место не в продаже (сектор D или неактивные C) */
  selectable: boolean;
  label: string;
};

function seatKey(sector: GardensSeat["sector"], row: number, seat: number): string {
  return `${sector}:${row}:${seat}`;
}

function seatLabel(sector: GardensSeat["sector"], row: number, seat: number): string {
  return `Сектор ${sector}, ряд ${row}, место ${seat}`;
}

function seatRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** Места сектора C в продаже (остальные на схеме — «продано»). */
export const C_ROW1_ON_SALE = new Set([
  ...seatRange(3, 10),
  14,
  15,
  ...seatRange(19, 26),
]);
export const C_ROW2_ON_SALE = new Set([
  ...seatRange(3, 8),
  13,
  14,
  ...seatRange(25, 32),
]);

function isGardensSeatOnSale(sector: GardensSeat["sector"], row: number, seat: number): boolean {
  if (sector === "A" || sector === "B") return true;
  if (sector === "C" && row === 1) return C_ROW1_ON_SALE.has(seat);
  if (sector === "C" && row === 2) return C_ROW2_ON_SALE.has(seat);
  return false;
}

function priceForActiveSeat(
  sector: "A" | "B" | "C",
  row: number,
  seat: number,
): { priceCents: number; tier: GardensSeatTier } | null {
  if (sector === "C") {
    if (row === 1 && C_ROW1_ON_SALE.has(seat)) {
      if (seat === 14 || seat === 15) {
        return { priceCents: GARDENS_STANDARD_CENTS, tier: "standard" };
      }
      return { priceCents: GARDENS_PREMIUM_CENTS, tier: "premium" };
    }
    if (row === 2 && C_ROW2_ON_SALE.has(seat)) {
      return { priceCents: GARDENS_STANDARD_CENTS, tier: "standard" };
    }
    return null;
  }
  if (sector === "B" && row === 1 && seat >= 1 && seat <= 26) {
    return { priceCents: GARDENS_PREMIUM_CENTS, tier: "premium" };
  }
  if (sector === "B" && row === 1 && seat >= 27 && seat <= 32) {
    return { priceCents: GARDENS_STANDARD_CENTS, tier: "standard" };
  }
  if (sector === "B" && row === 2 && seat >= 1 && seat <= 37) {
    return { priceCents: GARDENS_STANDARD_CENTS, tier: "standard" };
  }
  if (sector === "A" && row === 1 && seat >= 1 && seat <= 6) {
    return { priceCents: GARDENS_STANDARD_CENTS, tier: "standard" };
  }
  if (sector === "A" && row === 2 && seat >= 1 && seat <= 6) {
    return { priceCents: GARDENS_ECONOMY_CENTS, tier: "economy" };
  }
  if (sector === "A" && row === 3 && seat >= 1 && seat <= 7) {
    return { priceCents: GARDENS_ECONOMY_CENTS, tier: "economy" };
  }
  return null;
}

function addSectorRow(
  out: GardensSeat[],
  sector: GardensSeat["sector"],
  row: number,
  seatNumbers: number[],
  sectorOpen: boolean,
) {
  for (const seat of seatNumbers) {
    const selectable = sectorOpen && isGardensSeatOnSale(sector, row, seat);
    if (selectable && (sector === "A" || sector === "B" || sector === "C")) {
      const priced = priceForActiveSeat(sector, row, seat);
      if (!priced) continue;
      out.push({
        key: seatKey(sector, row, seat),
        sector,
        row,
        seat,
        priceCents: priced.priceCents,
        tier: priced.tier,
        selectable: true,
        label: seatLabel(sector, row, seat),
      });
      continue;
    }
    out.push({
      key: seatKey(sector, row, seat),
      sector,
      row,
      seat,
      priceCents: 0,
      tier: "sold",
      selectable: false,
      label: seatLabel(sector, row, seat),
    });
  }
}

const B_ROW1 = [...Array.from({ length: 26 }, (_, i) => i + 1), ...Array.from({ length: 6 }, (_, i) => i + 27)];
const B_ROW2 = Array.from({ length: 37 }, (_, i) => i + 1);
const C_ROW1 = B_ROW1;
const C_ROW2 = B_ROW2;
const A_ROW1 = Array.from({ length: 6 }, (_, i) => i + 1);
const A_ROW2 = A_ROW1;
const A_ROW3 = Array.from({ length: 7 }, (_, i) => i + 1);
const D_ROW1 = A_ROW1;
const D_ROW2 = A_ROW2;
const D_ROW3 = A_ROW3;

/** Полная схема зала «Сады сновидений». */
export function buildGardensSeatMap(): GardensSeat[] {
  const out: GardensSeat[] = [];
  addSectorRow(out, "B", 1, B_ROW1, true);
  addSectorRow(out, "B", 2, B_ROW2, true);
  addSectorRow(out, "A", 1, A_ROW1, true);
  addSectorRow(out, "A", 2, A_ROW2, true);
  addSectorRow(out, "A", 3, A_ROW3, true);
  addSectorRow(out, "C", 1, C_ROW1, true);
  addSectorRow(out, "C", 2, C_ROW2, true);
  addSectorRow(out, "D", 1, D_ROW1, false);
  addSectorRow(out, "D", 2, D_ROW2, false);
  addSectorRow(out, "D", 3, D_ROW3, false);
  return out;
}

const SEAT_MAP = buildGardensSeatMap();
const SEAT_BY_KEY = new Map(SEAT_MAP.map((s) => [s.key, s]));

export function getGardensSeat(key: string): GardensSeat | undefined {
  return SEAT_BY_KEY.get(key);
}

/** Человекочитаемое название места по ключу (A:2:2 → «Сектор A, ряд 2, место 2»). */
export function formatGardensSeatKeyLabel(key: string): string {
  const seat = getGardensSeat(key);
  if (seat) return seat.label;
  const [sector, row, seatNum] = key.split(":");
  if (sector && row && seatNum) {
    return `Сектор ${sector}, ряд ${row}, место ${seatNum}`;
  }
  return key;
}

/** Сообщение о занятых местах для пользователя. */
export function formatGardensOccupiedSeatsMessage(seatKeys: string[]): string {
  const labels = [...new Set(seatKeys.map(formatGardensSeatKeyLabel))];
  if (labels.length === 0) {
    return "Выбранные места уже заняты. Обновите схему и выберите другие.";
  }
  if (labels.length === 1) {
    return `Место «${labels[0]}» уже занято. Обновите схему и выберите другое.`;
  }
  return `Места уже заняты: ${labels.map((label) => `«${label}»`).join(", ")}. Обновите схему и выберите другие.`;
}

export function getSelectableGardensSeats(): GardensSeat[] {
  return SEAT_MAP.filter((s) => s.selectable);
}

export function formatGardensPrice(cents: number): string {
  return `${(cents / 100).toFixed(0)} BYN`;
}

export const GARDENS_LEGEND = [
  { tier: "premium" as const, label: "150 BYN", cents: GARDENS_PREMIUM_CENTS },
  { tier: "standard" as const, label: "120 BYN", cents: GARDENS_STANDARD_CENTS },
  { tier: "economy" as const, label: "90 BYN", cents: GARDENS_ECONOMY_CENTS },
];

/** Группы мест в ряду 1 (секторы B/C): 6 + по 5 + 6, как на макете. */
export const B_ROW1_GROUPS: number[][] = [
  [1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11],
  [12, 13, 14, 15, 16],
  [17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26],
  [27, 28, 29, 30, 31, 32],
];

export const C_ROW1_GROUPS = B_ROW1_GROUPS;

const ROW1_GROUP_COUNT = B_ROW1_GROUPS.length;

/** Доля ширины ряда 1 слева от места (группы B/C с разной шириной блоков). */
export function row1SeatStartFraction(seat: number): number {
  for (let gi = 0; gi < B_ROW1_GROUPS.length; gi++) {
    const group = B_ROW1_GROUPS[gi]!;
    const first = group[0]!;
    const last = group[group.length - 1]!;
    if (seat >= first && seat <= last) {
      const groupStart = gi / ROW1_GROUP_COUNT;
      const seatWidth = 1 / ROW1_GROUP_COUNT / group.length;
      return groupStart + group.indexOf(seat) * seatWidth;
    }
  }
  return 0;
}

export function row1SeatEndFraction(seat: number): number {
  for (let gi = 0; gi < B_ROW1_GROUPS.length; gi++) {
    const group = B_ROW1_GROUPS[gi]!;
    const first = group[0]!;
    const last = group[group.length - 1]!;
    if (seat >= first && seat <= last) {
      const groupStart = gi / ROW1_GROUP_COUNT;
      const seatWidth = 1 / ROW1_GROUP_COUNT / group.length;
      return groupStart + (group.indexOf(seat) + 1) * seatWidth;
    }
  }
  return 1;
}

export function row1SeatMidFraction(seat: number): number {
  return (row1SeatStartFraction(seat) + row1SeatEndFraction(seat)) / 2;
}

/** Горизонтальные границы секций сцены относительно ширины ряда 1. */
export function row1StageLayoutFractions() {
  const poolLeft = row1SeatStartFraction(11);
  const bodyLeft = poolLeft;
  const bodyRight = row1SeatMidFraction(23);
  const platformLeft = bodyRight;
  const rampLeft = row1SeatStartFraction(32);
  return {
    poolLeft,
    bodyLeft,
    bodyWidth: bodyRight - bodyLeft,
    platformLeft,
    platformWidth: rampLeft - platformLeft,
    rampLeft,
    rampWidth: 1 - rampLeft,
  };
}
