/**
 * Пример билета Night of Museums (как в админке: заголовок «Night of Museums СС-ПП», одна цена).
 * Запуск: `npx tsx scripts/render-sample-night-of-museums-ticket.ts [out.pdf]`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildTicketPdf } from "../src/lib/pdf-ticket";
import { NIGHT_OF_MUSEUMS_SLOT_KIND } from "../src/lib/slot-kind";

async function main() {
  const out =
    process.argv[2] ??
    join(process.cwd(), "tmp", "sample-night-of-museums-ticket.pdf");
  mkdirSync(dirname(out), { recursive: true });

  const buf = await buildTicketPdf({
    title: "Night of Museums 21:00-00:00",
    startsAt: new Date("2026-05-16T21:00:00+03:00"),
    slotKind: NIGHT_OF_MUSEUMS_SLOT_KIND,
    amountCents: 58_00,
    currency: "BYN",
    orderId: "clxxxxxxxxxxxxxxxxxxxx",
    qrUrl: "https://example.com/staff/quick?t=DEMO_NIGHT_OF_MUSEUMS",
    admissionCount: 1,
  });

  writeFileSync(out, Buffer.from(buf));
  console.log("Записано:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
