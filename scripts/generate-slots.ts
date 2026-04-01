/**
 * Массовое создание слотов по календарным дням и часам (часовой пояс — EXHIBITION_TIMEZONE или Europe/Minsk).
 * Уже существующие слоты в том же часовом интервале не дублируются.
 *
 * Примеры:
 *   npx tsx scripts/generate-slots.ts --from 2026-04-03 --to 2026-04-05
 *   npx tsx scripts/generate-slots.ts --from 2026-05-01 --to 2026-05-31 --start-hour 11 --end-hour 19
 *   npx tsx scripts/generate-slots.ts --from 2026-04-01 --to 2026-04-01 --dry-run
 */
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

function num(v: string | undefined, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      to: { type: "string" },
      "start-hour": { type: "string", default: "10" },
      "end-hour": { type: "string", default: "18" },
      capacity: { type: "string", default: "20" },
      "price-adult": { type: "string", default: "40" },
      "price-child": { type: "string", default: "30" },
      "price-concession": { type: "string", default: "20" },
      "dry-run": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  const fromStr = values.from;
  const toStr = values.to;
  if (!fromStr || !toStr) {
    console.error("Укажите --from YYYY-MM-DD и --to YYYY-MM-DD (включительно).");
    process.exit(1);
  }

  const tz = process.env.EXHIBITION_TIMEZONE?.trim() || "Europe/Minsk";
  const startH = num(values["start-hour"], 10);
  const endH = num(values["end-hour"], 18);
  if (startH < 0 || startH > 23 || endH < 0 || endH > 23 || startH > endH) {
    console.error("Некорректный диапазон часов.");
    process.exit(1);
  }

  const capacity = num(values.capacity, 20);
  const priceAdultCents = num(values["price-adult"], 40) * 100;
  const priceChildCents = num(values["price-child"], 30) * 100;
  const priceConcessionCents = num(values["price-concession"], 20) * 100;

  let day = DateTime.fromISO(fromStr, { zone: tz });
  const last = DateTime.fromISO(toStr, { zone: tz });
  if (!day.isValid || !last.isValid) {
    console.error("Даты должны быть в формате YYYY-MM-DD.");
    process.exit(1);
  }
  day = day.startOf("day");
  const lastDay = last.startOf("day");
  if (day > lastDay) {
    console.error("--from не может быть позже --to.");
    process.exit(1);
  }

  let wouldCreate = 0;
  let created = 0;
  for (let cursor = day; cursor <= lastDay; cursor = cursor.plus({ days: 1 })) {
    for (let h = startH; h <= endH; h++) {
      const slotStart = cursor.set({ hour: h, minute: 0, second: 0, millisecond: 0 });
      const from = slotStart.toJSDate();
      const to = slotStart.plus({ hours: 1 }).toJSDate();
      const exists = await prisma.slot.count({
        where: { startsAt: { gte: from, lt: to } },
      });
      if (exists > 0) continue;

      const dd = String(cursor.day).padStart(2, "0");
      const mm = String(cursor.month).padStart(2, "0");
      const yyyy = String(cursor.year);
      const title = `Секция · ${dd}.${mm}.${yyyy} · ${String(h).padStart(2, "0")}:00`;

      if (values["dry-run"]) {
        wouldCreate += 1;
        console.info(`[dry-run] ${title}`);
        continue;
      }

      await prisma.slot.create({
        data: {
          title,
          startsAt: from,
          priceCents: priceAdultCents,
          priceAdultCents,
          priceChildCents,
          priceConcessionCents,
          capacity,
          currency: "BYN",
          active: true,
        },
      });
      created += 1;
    }
  }

  if (values["dry-run"]) {
    console.info(`\nИтого новых слотов было бы: ${wouldCreate} (часовой пояс: ${tz})`);
  } else {
    console.info(`\nСоздано новых слотов: ${created} (часовой пояс: ${tz})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
