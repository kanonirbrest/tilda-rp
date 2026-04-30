/**
 * Одноразовый рендер примера билета: `npx tsx scripts/render-sample-ticket.ts [out.pdf]`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildTicketPdf } from "../src/lib/pdf-ticket";

async function main() {
  const out = process.argv[2] ?? join(process.cwd(), "tmp", "sample-ticket.pdf");
  mkdirSync(dirname(out), { recursive: true });

  const buf = await buildTicketPdf({
    title: "Небо.Река — экскурсия по основной экспозиции",
    customerName: "Иванова Мария Сергеевна",
    startsAt: new Date("2026-06-15T14:00:00+03:00"),
    amountCents: 58_00,
    currency: "BYN",
    orderId: "clxxxxxxxxxxxxxxxxxxxx",
    qrUrl: "https://example.com/staff/quick?t=DEMO_TOKEN_SAMPLE_ONLY",
    ticketTierLabel: "Взрослый",
    admissionCount: 1,
    ticketOrdinal: { index: 2, total: 4 },
  });

  writeFileSync(out, Buffer.from(buf));
  console.log("Записано:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
