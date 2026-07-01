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
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${slotId}\0${seatKey}`}))`,
    );
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

  await tx.$executeRaw`
    DELETE FROM "SeatReservation" sr
    USING "Order" o
    WHERE sr."orderId" = o.id
      AND sr."slotId" = ${slotId}
      AND sr."seatKey" IN (${Prisma.join(seatKeys)})
      AND (
        o.status IN ('CANCELLED', 'FAILED', 'REFUNDED')
        OR (o.status = 'PENDING' AND o."createdAt" < ${cutoff})
      )
  `;

  await tx.$executeRaw`
    UPDATE "Order" o
    SET status = 'CANCELLED'
    WHERE o."slotId" = ${slotId}
      AND o.status = 'PENDING'
      AND o."createdAt" < ${cutoff}
  `;
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

/** Занятые места с блокировкой существующих строк брони. */
export async function findOccupiedSeatKeysForCheckout(
  tx: PrismaTypes.TransactionClient,
  slotId: string,
  seatKeys: string[],
): Promise<string[]> {
  if (seatKeys.length === 0) return [];

  const rows = await tx.$queryRaw<{ seatKey: string }[]>`
    SELECT sr."seatKey"
    FROM "SeatReservation" sr
    INNER JOIN "Order" o ON o.id = sr."orderId"
    WHERE sr."slotId" = ${slotId}
      AND sr."seatKey" IN (${Prisma.join(seatKeys)})
      AND o.status IN ('PENDING', 'PAID')
    FOR UPDATE OF sr
  `;
  return rows.map((r) => r.seatKey);
}
