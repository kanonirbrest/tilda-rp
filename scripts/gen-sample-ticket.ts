/**
 * Локальная генерация примеров PDF билетов.
 * Запуск из каталога dei-tickets: npx tsx scripts/gen-sample-ticket.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTicketPdf } from "../src/lib/pdf-ticket";
import { NEBO_REKA_SLOT_KIND, NIGHT_OF_MUSEUMS_SLOT_KIND } from "../src/lib/slot-kind";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

async function main() {
  const regularPath = join(projectRoot, "sample-ticket-example.pdf");
  const regular = await buildTicketPdf({
    title: "Небо.Река — Планета после шума",
    startsAt: new Date("2026-06-15T18:00:00+03:00"),
    amountCents: 3500,
    currency: "BYN",
    orderId: "order_demo_01hxsampleticket",
    qrUrl: "https://dei.by/tickets/demo-token-sample",
    ticketTierLabel: "Стандартный",
    admissionCount: 1,
    slotKind: NEBO_REKA_SLOT_KIND,
  });
  writeFileSync(regularPath, regular);
  console.log(`Written: ${regularPath}`);

  const nightPath = join(projectRoot, "sample-ticket-night-example.pdf");
  const night = await buildTicketPdf({
    title: "Night of Museums 21:00-00:00",
    startsAt: new Date("2026-05-17T12:00:00+03:00"),
    amountCents: 2000,
    currency: "BYN",
    orderId: "order_demo_night_museums_02",
    qrUrl: "https://dei.by/tickets/demo-token-night",
    ticketTierLabel: "Ночь музеев",
    admissionCount: 2,
    ticketOrdinal: { index: 1, total: 2 },
    slotKind: NIGHT_OF_MUSEUMS_SLOT_KIND,
  });
  writeFileSync(nightPath, night);
  console.log(`Written: ${nightPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
