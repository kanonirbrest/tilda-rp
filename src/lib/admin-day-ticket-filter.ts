import type { Prisma } from "@prisma/client";

/** Оплаченные билеты без возврата за календарный день сеанса (UTC-диапазон стены TZ). */
export function paidActiveTicketsWhereForDay(
  range: { start: Date; end: Date },
  slotId: string | null,
): Prisma.TicketWhereInput {
  return {
    refundedAt: null,
    order: {
      status: "PAID",
      slot: {
        startsAt: { gte: range.start, lte: range.end },
        ...(slotId ? { id: slotId } : {}),
      },
    },
  };
}
