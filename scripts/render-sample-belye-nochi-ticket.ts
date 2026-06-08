/**
 * Пример билета «Белые ночи 18+» (как в админке: «Белые ночи 18+ 22:00-03:00», 50 BYN).
 * Запуск: `npx tsx scripts/render-sample-belye-nochi-ticket.ts [out.pdf]`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildTicketPdf } from "../src/lib/pdf-ticket";
import { BELYE_NOCHI_18_SLOT_KIND } from "../src/lib/slot-kind";

async function main() {
  const out =
    process.argv[2] ?? join(process.cwd(), "tmp", "sample-belye-nochi-18-ticket.pdf");
  mkdirSync(dirname(out), { recursive: true });

  const buf = await buildTicketPdf({
    title: "Белые ночи 18+ 22:00-03:00",
    startsAt: new Date("2026-06-27T22:00:00+03:00"),
    slotKind: BELYE_NOCHI_18_SLOT_KIND,
    amountCents: 5000,
    currency: "BYN",
    orderId: "order_demo_belye_nochi_01",
    qrUrl: "https://dei-tickets.onrender.com/staff/quick?t=DEMO_BELYE_NOCHI",
    admissionCount: 1,
  });

  writeFileSync(out, Buffer.from(buf));
  console.log("Записано:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
