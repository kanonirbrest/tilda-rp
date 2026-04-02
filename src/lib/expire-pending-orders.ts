import { prisma } from "@/lib/prisma";

const DEFAULT_TTL_MINUTES = 30;

/** Сколько минут PENDING держит место; дальше — CANCELLED при следующем подходящем запросе (без крона). */
export function pendingOrderTtlMinutes(): number {
  const raw = process.env.PENDING_ORDER_TTL_MINUTES?.trim();
  if (!raw) return DEFAULT_TTL_MINUTES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TTL_MINUTES;
  return Math.min(n, 24 * 60);
}

/** Переводит просроченные PENDING в CANCELLED. Идемпотентно. */
export async function expireStalePendingOrders(): Promise<number> {
  const minutes = pendingOrderTtlMinutes();
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const res = await prisma.order.updateMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
    },
    data: { status: "CANCELLED" },
  });
  return res.count;
}
