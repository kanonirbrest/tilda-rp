import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12);
  await prisma.staffUser.upsert({
    where: { login: "admin" },
    update: { passwordHash },
    create: { login: "admin", passwordHash },
  });

  const activeSlots = await prisma.slot.count({ where: { active: true } });
  if (activeSlots === 0) {
    const now = new Date();
    const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in5d = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    await prisma.slot.createMany({
      data: [
        {
          title: "Демо-слот: экскурсия",
          startsAt: in3d,
          priceCents: 1000,
          priceAdultCents: 1000,
          priceChildCents: 500,
          priceConcessionCents: 500,
          capacity: 200,
          currency: "BYN",
          active: true,
        },
        {
          title: "Демо-слот: концерт",
          startsAt: in5d,
          priceCents: 2500,
          priceAdultCents: 2500,
          priceChildCents: 1200,
          priceConcessionCents: 1200,
          capacity: 200,
          currency: "BYN",
          active: true,
        },
      ],
    });
    console.info("Добавлены демо-слоты (не было активных).");
  } else {
    console.info(`Активных слотов уже ${activeSlots}, демо не добавляем.`);
  }

  /** Секции 02.04.2026, каждый час с 10:00 до 18:00 (Минск), по 200 мест. Цены: взр. 40 / дет. 30 / льг. 20 BYN. */
  const dayStart = new Date("2026-04-02T00:00:00+03:00");
  const dayEnd = new Date("2026-04-03T00:00:00+03:00");
  const existingApr2 = await prisma.slot.count({
    where: { startsAt: { gte: dayStart, lt: dayEnd } },
  });
  if (existingApr2 === 0) {
    const priceAdultCents = 40 * 100;
    const priceChildCents = 30 * 100;
    const priceConcessionCents = 20 * 100;
    const rows = [];
    for (let h = 10; h <= 18; h++) {
      const hh = String(h).padStart(2, "0");
      rows.push({
        title: `Секция · 02.04.2026 · ${hh}:00`,
        startsAt: new Date(`2026-04-02T${hh}:00:00+03:00`),
        priceCents: priceAdultCents,
        priceAdultCents,
        priceChildCents,
        priceConcessionCents,
        capacity: 200,
        currency: "BYN",
        active: true,
      });
    }
    await prisma.slot.createMany({ data: rows });
    console.info(`Добавлено ${rows.length} секций на 02.04.2026 (10:00–18:00, Europe/Minsk).`);
  } else {
    console.info(`На 02.04.2026 слотов уже ${existingApr2}, секции не дублируем.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
