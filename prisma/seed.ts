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
          currency: "BYN",
          active: true,
        },
        {
          title: "Демо-слот: концерт",
          startsAt: in5d,
          priceCents: 2500,
          currency: "BYN",
          active: true,
        },
      ],
    });
    console.info("Добавлены демо-слоты (не было активных).");
  } else {
    console.info(`Активных слотов уже ${activeSlots}, демо не добавляем.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
