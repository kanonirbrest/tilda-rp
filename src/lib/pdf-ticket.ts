/**
 * PDF билета: один HTML → PDF выбранным движком.
 *
 * - `playwright` (по умолчанию): Chromium + `page.pdf()` — без отдельной установки.
 * - `prince`: Prince XML — нужен бинарник Prince (коммерческая лицензия для продакшена).
 *
 * Переменные: `TICKET_PDF_RENDERER`, `PRINCE_BIN`, `TICKET_PDF_MAX_CONCURRENT` (только Playwright).
 * Chromium: `npx playwright install chromium`
 */
import { buildTicketHtml, type TicketPdfInput } from "./ticket-html-build";
import { renderHtmlToPdfBuffer } from "./ticket-pdf-playwright";
import { renderHtmlToPdfWithPrince } from "./ticket-pdf-prince";

export type { TicketPdfInput };

function resolveRenderer(): "playwright" | "prince" {
  const r = process.env.TICKET_PDF_RENDERER?.trim().toLowerCase();
  if (r === "prince") return "prince";
  return "playwright";
}

export async function buildTicketPdf(opts: TicketPdfInput): Promise<Uint8Array> {
  const html = await buildTicketHtml(opts);
  if (resolveRenderer() === "prince") {
    return renderHtmlToPdfWithPrince(html);
  }
  return renderHtmlToPdfBuffer(html);
}
