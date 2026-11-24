/**
 * Пример пачки печатных билетов «Дом Рождества» (взрослый + детский), одним PDF.
 * Запуск: `npx tsx scripts/render-sample-print-ticket.ts [out.pdf]`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderDomRozhdestvaPrintBatchPdf } from "../src/lib/ticket-pdf-dom-rozhdestva";

async function main() {
  const out = process.argv[2] ?? join(process.cwd(), "tmp", "sample-print-tickets.pdf");
  mkdirSync(dirname(out), { recursive: true });

  const started = Date.now();
  const pdf = await renderDomRozhdestvaPrintBatchPdf([
    {
      qrUrl: "https://dei-tickets.onrender.com/r?t=7K3M9P2QXD",
      serialLabel: "0001",
      displayCode: "7K3M9-P2QXD",
      tierLabel: "ВЗРОСЛЫЙ",
    },
    {
      qrUrl: "https://dei-tickets.onrender.com/r?t=B4N8T1WZ5C",
      serialLabel: "0002",
      displayCode: "B4N8T-1WZ5C",
      tierLabel: "ДЕТСКИЙ (3-11 ЛЕТ)",
    },
  ]);
  writeFileSync(out, Buffer.from(pdf));
  console.log("Записано:", out, `${(pdf.length / 1024).toFixed(0)} КБ`, `${Date.now() - started} мс`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
