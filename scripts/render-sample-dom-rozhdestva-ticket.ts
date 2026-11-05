/**
 * Пример билета «Дом Рождества» по макету Figma DR_797x1123_fin.
 * Запуск: `npx tsx scripts/render-sample-dom-rozhdestva-ticket.ts [out.pdf]`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildTicketPdf } from "../src/lib/pdf-ticket";
import { DOM_ROZHDESTVA_SLOT_KIND } from "../src/lib/slot-kind";

async function main() {
  const out =
    process.argv[2] ?? join(process.cwd(), "tmp", "sample-dom-rozhdestva-ticket.pdf");
  mkdirSync(dirname(out), { recursive: true });

  const buf = await buildTicketPdf({
    title: "Дом Рождества · 10.12.2026 · 10:00",
    startsAt: new Date("2026-12-10T10:00:00+03:00"),
    slotKind: DOM_ROZHDESTVA_SLOT_KIND,
    amountCents: 45_00,
    currency: "BYN",
    orderId: "CLXXXXXXXXXXXXXXXXXXXX",
    qrUrl: "https://dei-tickets.onrender.com/staff/quick?t=DEMO_DOM_ROZHDESTVA",
    ticketTierLabel: "Взрослый",
    admissionCount: 1,
  });

  writeFileSync(out, Buffer.from(buf));
  console.log("Записано:", out);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
