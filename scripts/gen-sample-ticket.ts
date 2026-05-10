/**
 * Локальная генерация примера PDF билета.
 * Запуск из каталога dei-tickets: npx tsx scripts/gen-sample-ticket.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTicketPdf } from "../src/lib/pdf-ticket";
import { NEBO_REKA_SLOT_KIND } from "../src/lib/slot-kind";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const outPath = join(projectRoot, "sample-ticket-example.pdf");

async function main() {
  const pdf = await buildTicketPdf({
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

  writeFileSync(outPath, pdf);
  console.log(`Written: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
