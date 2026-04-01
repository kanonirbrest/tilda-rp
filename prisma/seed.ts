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

  /** Взрослый 40 / детский 30 / льготный 20 BYN; 20 мест на сеанс. Сеансы: 10–18 каждый час (+03:00, Europe/Minsk). */
  const priceAdultCents = 40 * 100;
  const priceChildCents = 30 * 100;
  const priceConcessionCents = 20 * 100;
  const slotCapacity = 20;

  function hourStart2026(y: number, m: number, d: number, h: number): Date {
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const hh = String(h).padStart(2, "0");
    return new Date(`${y}-${mm}-${dd}T${hh}:00:00+03:00`);
  }

  async function ensureHourlySlots(y: number, m: number, d: number): Promise<number> {
    let added = 0;
    for (let h = 10; h <= 18; h++) {
      const from = hourStart2026(y, m, d, h);
      const to = hourStart2026(y, m, d, h + 1);
      const exists = await prisma.slot.count({
        where: { startsAt: { gte: from, lt: to } },
      });
      if (exists > 0) continue;
      const dd = String(d).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      await prisma.slot.create({
        data: {
          title: `Секция · ${dd}.${mm}.${y} · ${String(h).padStart(2, "0")}:00`,
          startsAt: from,
          priceCents: priceAdultCents,
          priceAdultCents,
          priceChildCents,
          priceConcessionCents,
          capacity: slotCapacity,
          currency: "BYN",
          active: true,
        },
      });
      added += 1;
    }
    return added;
  }

  const addedApr1 = await ensureHourlySlots(2026, 4, 1);
  if (addedApr1 > 0) {
    console.info(`Добавлено ${addedApr1} секций на 01.04.2026 (10–18 ч, только недостающие).`);
  } else {
    console.info("На 01.04.2026 все слоты 10–18 ч уже есть.");
  }

  const addedApr2 = await ensureHourlySlots(2026, 4, 2);
  if (addedApr2 > 0) {
    console.info(`Добавлено ${addedApr2} секций на 02.04.2026 (10–18 ч, только недостающие).`);
  } else {
    console.info("На 02.04.2026 все слоты 10–18 ч уже есть.");
  }

  const rangeStart = new Date("2026-04-01T00:00:00+03:00");
  const rangeEnd = new Date("2026-04-03T00:00:00+03:00");
  const patched = await prisma.slot.updateMany({
    where: { startsAt: { gte: rangeStart, lt: rangeEnd } },
    data: {
      priceCents: priceAdultCents,
      priceAdultCents,
      priceChildCents,
      priceConcessionCents,
      capacity: slotCapacity,
    },
  });
  console.info(
    `Обновлены цены (40/30/20 BYN) и ёмкость (${slotCapacity} мест) у ${patched.count} слотов за 01–02.04.2026.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
