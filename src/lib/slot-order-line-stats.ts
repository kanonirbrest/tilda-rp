import { prisma } from "@/lib/prisma";

/** Количество оплаченных и ожидающих билетов по слотам (по строкам заказа). */
export async function slotOrderLineStatsMap(
  slotIds: string[],
): Promise<Map<string, { soldPaid: number; pendingReserved: number }>> {
  const map = new Map<string, { soldPaid: number; pendingReserved: number }>();
  for (const id of slotIds) map.set(id, { soldPaid: 0, pendingReserved: 0 });
  if (slotIds.length === 0) return map;

  const rows = await prisma.orderLine.findMany({
    where: {
      order: {
        slotId: { in: slotIds },
        status: { in: ["PAID", "PENDING"] },
      },
    },
    select: {
      quantity: true,
      order: { select: { status: true, slotId: true } },
    },
  });
  for (const row of rows) {
    const sid = row.order.slotId;
    const m = map.get(sid);
    if (!m) continue;
    if (row.order.status === "PAID") m.soldPaid += row.quantity;
    else m.pendingReserved += row.quantity;
  }
  return map;
}
