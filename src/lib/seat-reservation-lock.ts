import { Prisma } from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { pendingOrderTtlMinutes } from "@/lib/expire-pending-orders";

/** Блокирует параллельный checkout одних и тех же мест (даже если строки в SeatReservation ещё нет). */
export async function lockSeatKeysInTransaction(
  tx: PrismaTypes.TransactionClient,
  slotId: string,
  seatKeys: string[],
): Promise<void> {
  for (const seatKey of [...seatKeys].sort()) {
    // Разделитель без \0 — PostgreSQL text не допускает NUL в UTF-8.
    const lockKey = `${slotId}#${seatKey}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
  }
}

/** Снимает «мёртвые» брони и просроченные PENDING по выбранным местам. */
export async function purgeInactiveSeatReservationsInTransaction(
  tx: PrismaTypes.TransactionClient,
  slotId: string,
  seatKeys: string[],
): Promise<void> {
  if (seatKeys.length === 0) return;

  const cutoff = new Date(Date.now() - pendingOrderTtlMinutes() * 60 * 1000);

  const stalePending = await tx.order.findMany({
    where: {
      slotId,
      status: "PENDING",
      createdAt: { lt: cutoff },
    },
    select: { id: true },
  });
  if (stalePending.length > 0) {
    const ids = stalePending.map((o) => o.id);
    await tx.seatReservation.deleteMany({ where: { orderId: { in: ids } } });
    await tx.order.updateMany({
      where: { id: { in: ids } },
      data: { status: "CANCELLED" },
    });
  }

  await tx.seatReservation.deleteMany({
    where: {
      slotId,
      seatKey: { in: seatKeys },
      order: { status: { in: ["CANCELLED", "FAILED", "REFUNDED"] } },
    },
  });
}

/**
 * Отменяет другие PENDING заказы того же покупателя на этот сеанс.
 * Убирает дубли checkout при повторных кликах «Перейти к оплате».
 */
export async function cancelOtherPendingOrdersForCustomerInTransaction(
  tx: PrismaTypes.TransactionClient,
  slotId: string,
  email: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const others = await tx.order.findMany({
    where: {
      slotId,
      status: "PENDING",
      customer: { email: normalized },
    },
    select: { id: true },
  });
  if (others.length === 0) return;

  const ids = others.map((o) => o.id);
  await tx.seatReservation.deleteMany({ where: { orderId: { in: ids } } });
  await tx.order.updateMany({
    where: { id: { in: ids } },
    data: { status: "CANCELLED" },
  });
}

/** Занятые места (активные PENDING/PAID). */
export async function findOccupiedSeatKeysForCheckout(
  tx: PrismaTypes.TransactionClient,
  slotId: string,
  seatKeys: string[],
): Promise<string[]> {
  if (seatKeys.length === 0) return [];

  const rows = await tx.seatReservation.findMany({
    where: {
      slotId,
      seatKey: { in: seatKeys },
      order: { status: { in: ["PENDING", "PAID"] } },
    },
    select: { seatKey: true },
  });
  return rows.map((r) => r.seatKey);
}
