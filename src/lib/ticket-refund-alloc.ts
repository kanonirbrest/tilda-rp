import type { OrderLine } from "@prisma/client";

/**
 * Веса билетов (номинал до скидки), в том же порядке, что билеты при создании заказа:
 * порядок строк OrderLine по id, внутри строки — quantity раз по unitPriceCents.
 */
export function listPriceCentsPerTicket(lines: OrderLine[], ticketCount: number): number[] {
  const sorted = [...lines].sort((a, b) => a.id.localeCompare(b.id));
  const weights: number[] = [];
  for (const l of sorted) {
    for (let j = 0; j < l.quantity; j++) {
      weights.push(l.unitPriceCents);
    }
  }
  if (weights.length !== ticketCount) {
    console.warn("[ticket-refund-alloc] mismatch lines vs tickets", {
      weightsLen: weights.length,
      ticketCount,
    });
  }
  if (weights.length >= ticketCount) return weights.slice(0, ticketCount);
  while (weights.length < ticketCount) {
    weights.push(0);
  }
  return weights;
}

/**
 * Распределение оплаченной суммы заказа по билетам пропорционально номиналу (скидка промо учтена в total paid).
 * Сумма элементов всегда равна `amountCents`.
 */
export function allocatePaidCentsPerTicket(
  amountCents: number,
  subtotalCents: number,
  listPricePerTicket: number[],
): number[] {
  const n = listPricePerTicket.length;
  if (n === 0) return [];
  if (amountCents <= 0) return Array(n).fill(0);

  if (subtotalCents <= 0) {
    const base = Math.floor(amountCents / n);
    let rem = amountCents - base * n;
    return listPricePerTicket.map((_, i) => base + (i < rem ? 1 : 0));
  }

  const floors = listPricePerTicket.map((w) => Math.floor((amountCents * w) / subtotalCents));
  let sumFloors = floors.reduce((a, b) => a + b, 0);
  let rem = amountCents - sumFloors;
  const fractional = listPricePerTicket.map((w, i) => ({
    i,
    frac: (amountCents * w) / subtotalCents - (floors[i] ?? 0),
  }));
  fractional.sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) {
    const el = fractional[k];
    if (el) floors[el.i] = (floors[el.i] ?? 0) + 1;
  }
  return floors;
}

export function paidCentsForTicketAtIndex(
  amountCents: number,
  subtotalCents: number,
  listPricePerTicket: number[],
  ticketIndex: number,
): number {
  const all = allocatePaidCentsPerTicket(amountCents, subtotalCents, listPricePerTicket);
  return all[ticketIndex] ?? 0;
}
