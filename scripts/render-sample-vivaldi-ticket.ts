/**
 * Пример билета «Времена года. Антонио Вивальди».
 * Запуск: `npx tsx scripts/render-sample-vivaldi-ticket.ts [out.pdf]`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildTicketPdf } from "../src/lib/pdf-ticket";
import { VIVALDI_CONCERT_SLOT_KIND } from "../src/lib/slot-kind";
import { formatVivaldiPerformanceTitle } from "../src/lib/vivaldi/schedule";

async function main() {
  const out =
    process.argv[2] ?? join(process.cwd(), "tmp", "sample-vivaldi-ticket.pdf");
  mkdirSync(dirname(out), { recursive: true });

  const buf = await buildTicketPdf({
    title: formatVivaldiPerformanceTitle(),
    startsAt: new Date("2026-10-13T20:00:00+03:00"),
    slotKind: VIVALDI_CONCERT_SLOT_KIND,
    amountCents: 13_000,
    currency: "BYN",
    orderId: "order_demo_vivaldi_01",
    qrUrl: "https://dei-tickets.onrender.com/staff/quick?t=DEMO_VIVALDI",
    ticketTierLabel: "Сектор A, ряд 1, место 1",
    admissionCount: 1,
  });

  writeFileSync(out, Buffer.from(buf));
  console.log("Записано:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
