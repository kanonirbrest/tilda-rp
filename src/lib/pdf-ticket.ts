/**
 * PDF билета: один HTML → PDF выбранным движком.
 *
 * - `playwright` (по умолчанию): Chromium + `page.pdf()` — без отдельной установки.
 * - `prince`: Prince XML — нужен бинарник Prince (коммерческая лицензия для продакшена).
 *
 * Переменные: `TICKET_PDF_RENDERER`, `PRINCE_BIN`, `TICKET_PDF_MAX_CONCURRENT` (только Playwright).
 * Chromium: `npx playwright install chromium`
 */
import type { TicketPdfInput } from "./ticket-html-build";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";

export type { TicketPdfInput };

function resolveRenderer(): "playwright" | "prince" {
  const r = process.env.TICKET_PDF_RENDERER?.trim().toLowerCase();
  if (r === "prince") return "prince";
  return "playwright";
}

export async function buildTicketPdf(opts: TicketPdfInput): Promise<Uint8Array> {
  if (opts.slotKind === DOM_ROZHDESTVA_SLOT_KIND && resolveRenderer() !== "prince") {
    const { renderDomRozhdestvaTicketPdf } = await import("./ticket-pdf-dom-rozhdestva");
    return renderDomRozhdestvaTicketPdf(opts);
  }
  const { buildTicketHtml } = await import("./ticket-html-build");
  const html = await buildTicketHtml(opts);
  if (resolveRenderer() === "prince") {
    const { renderHtmlToPdfWithPrince } = await import("./ticket-pdf-prince");
    return renderHtmlToPdfWithPrince(html);
  }
  const { renderHtmlToPdfBuffer } = await import("./ticket-pdf-playwright");
  return renderHtmlToPdfBuffer(html);
}
