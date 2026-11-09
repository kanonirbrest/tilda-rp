/**
 * Подложка билета «Дом Рождества»: один раз через Chromium, дальше скачивание её только дополняет.
 * Запуск: `npx tsx scripts/render-dom-rozhdestva-shell.ts`
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDomRozhdestvaShellAssets } from "../src/lib/ticket-pdf-dom-rozhdestva-shell";
import { domRozhdestvaAssetDirectory } from "../src/lib/ticket-html-dom-rozhdestva";

async function main() {
  const dir = domRozhdestvaAssetDirectory();
  if (!dir) throw new Error("Не найден assets/tickets/dom-rozhdestva");
  const shell = await buildDomRozhdestvaShellAssets();
  writeFileSync(join(dir, "shell.pdf"), shell.pdf);
  writeFileSync(
    join(dir, "shell.meta.json"),
    JSON.stringify({ hash: shell.hash, layout: shell.layout }, null, 2),
  );
  console.log("Подложка:", join(dir, "shell.pdf"), shell.pdf.length, "байт");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
