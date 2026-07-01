import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_TTL_MINUTES = 15;

/** Сколько минут PENDING держит место; дальше — CANCELLED при следующем подходящем запросе (без крона). */
export function pendingOrderTtlMinutes(): number {
  const raw = process.env.PENDING_ORDER_TTL_MINUTES?.trim();
  if (!raw) return DEFAULT_TTL_MINUTES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TTL_MINUTES;
  return Math.min(n, 24 * 60);
}

/** Снимает бронь мест у заказов, которые уже не держат место (CANCELLED/FAILED/REFUNDED). */
export async function releaseInactiveSeatReservations(): Promise<number> {
  const res = await prisma.seatReservation.deleteMany({
    where: {
      order: { status: { in: ["CANCELLED", "FAILED", "REFUNDED"] } },
    },
  });
  return res.count;
}

/** Переводит просроченные PENDING в CANCELLED и освобождает места. Идемпотентно. */
export async function expireStalePendingOrders(): Promise<number> {
  const minutes = pendingOrderTtlMinutes();
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const stale = await tx.order.findMany({
      where: {
        status: "PENDING",
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });
    if (stale.length === 0) return 0;

    const ids = stale.map((o) => o.id);
    await tx.seatReservation.deleteMany({ where: { orderId: { in: ids } } });
    const res = await tx.order.updateMany({
      where: { id: { in: ids } },
      data: { status: "CANCELLED" },
    });
    return res.count;
  });
}

/** Просрочка PENDING + очистка «зависших» броней от прошлых отмен. */
export async function expireStalePendingOrdersAndReleaseSeats(): Promise<void> {
  await expireStalePendingOrders();
  await releaseInactiveSeatReservations();
}

/**
 * Внутри checkout-транзакции: снять просроченные PENDING и «мёртвые» брони по выбранным местам.
 * Иначе unique (slotId, seatKey) падает с P2002, хотя место на схеме выглядит свободным.
 */
export async function releaseSeatLocksInTransaction(
  tx: Prisma.TransactionClient,
  slotId: string,
  seatKeys: string[],
): Promise<void> {
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
