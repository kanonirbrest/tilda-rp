/**
 * Одноразовая очистка «зависших» SeatReservation в prod.
 * Запуск: npx tsx scripts/cleanup-ghost-seat-reservations.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const ghostRes = await prisma.seatReservation.deleteMany({
    where: {
      order: { status: { in: ["CANCELLED", "FAILED", "REFUNDED"] } },
    },
  });
  console.log(`Удалено зависших броней: ${ghostRes.count}`);

  const staleMinutes = 15;
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
  const stale = await prisma.order.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((o) => o.id);
    const staleRes = await prisma.seatReservation.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: { status: "CANCELLED" },
    });
    console.log(`Просрочено PENDING заказов: ${stale.length}, снято броней: ${staleRes.count}`);
  } else {
    console.log("Просроченных PENDING заказов нет");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
