import { prisma } from "@/lib/prisma";

/** Сумма quantity по заказам PENDING + PAID для слота (как при проверке вместимости). */
export async function reservedSeatsForSlot(slotId: string): Promise<number> {
  const agg = await prisma.orderLine.aggregate({
    where: {
      order: {
        slotId,
        status: { in: ["PAID", "PENDING"] },
      },
    },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}
