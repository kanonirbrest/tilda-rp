import type { Prisma } from "@prisma/client";

/** Оплаченные билеты без возврата за календарный день сеанса (UTC-диапазон стены TZ). */
export function paidActiveTicketsWhereForDay(
  range: { start: Date; end: Date },
  slotId: string | null,
  slotKind: string | null = null,
): Prisma.TicketWhereInput {
  return {
    refundedAt: null,
    order: {
      status: "PAID",
      slot: {
        startsAt: { gte: range.start, lte: range.end },
        ...(slotKind ? { kind: slotKind } : {}),
        ...(slotId ? { id: slotId } : {}),
      },
    },
  };
}

/**
 * Билеты за день во всех статусах отчёта о продажах: бронь (PENDING), продано (PAID),
 * возврат (билет с refundedAt при PAID или REFUNDED заказе).
 */
export function reportTicketsWhereForDay(
  range: { start: Date; end: Date },
  slotId: string | null,
  slotKind: string | null = null,
): Prisma.TicketWhereInput {
  return {
    order: {
      status: { in: ["PENDING", "PAID", "REFUNDED"] },
      slot: {
        startsAt: { gte: range.start, lte: range.end },
        ...(slotKind ? { kind: slotKind } : {}),
        ...(slotId ? { id: slotId } : {}),
      },
    },
  };
}
