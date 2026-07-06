/**
 * Отмена PENDING-заказов с бронью на указанных местах.
 *
 * Просмотр: npx tsx scripts/cancel-pending-seats.ts D:1:1 D:1:2 D:1:3 D:1:4
 * Применить: npx tsx scripts/cancel-pending-seats.ts --apply D:1:1 D:1:2 D:1:3 D:1:4
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { cancelPendingOrdersForSeatKeys } from "../src/lib/expire-pending-orders";
import { applyDevelopmentProductionDatabaseUrl } from "../src/lib/resolve-database-url";

config({ path: ".env.local" });
applyDevelopmentProductionDatabaseUrl();

const apply = process.argv.includes("--apply");
const seatKeys = process.argv.slice(2).filter((a) => a !== "--apply").map((k) => k.trim()).filter(Boolean);

if (seatKeys.length === 0) {
  console.error("Usage: npx tsx scripts/cancel-pending-seats.ts [--apply] <seatKey>...");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim() && !process.env.PRODUCTION_DATABASE_URL?.trim()) {
  console.error("Задайте DATABASE_URL или PRODUCTION_DATABASE_URL в .env.local");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  if (!apply) {
    const reservations = await prisma.seatReservation.findMany({
      where: {
        seatKey: { in: seatKeys },
        order: { status: "PENDING" },
      },
      include: {
        order: {
          select: {
            id: true,
            createdAt: true,
            customer: { select: { email: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const byOrder = new Map<string, { orderId: string; email: string; createdAt: string; seats: string[] }>();
    for (const r of reservations) {
      const entry = byOrder.get(r.orderId) ?? {
        orderId: r.orderId,
        email: r.order.customer.email,
        createdAt: r.order.createdAt.toISOString(),
        seats: [],
      };
      entry.seats.push(r.seatKey);
      byOrder.set(r.orderId, entry);
    }

    console.log(
      JSON.stringify(
        {
          seatKeys,
          pendingOrders: [...byOrder.values()],
          apply: false,
          hint: "Добавьте --apply, чтобы перевести заказы в CANCELLED и снять бронь.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const orderIds = await cancelPendingOrdersForSeatKeys(seatKeys);
  console.log(JSON.stringify({ seatKeys, cancelledOrderIds: orderIds }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
