import { chromium, type Browser, type Page } from "playwright";

/** Ограничивает число одновременных `page.pdf()` в одном Chromium — без этого пики нагрузки на дешёлых инстансах. */
class PdfRenderSemaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.available = Math.max(1, maxConcurrent);
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.available++;
    }
  }
}

function resolvePlaywrightMaxConcurrent(): number {
  const raw = process.env.TICKET_PDF_MAX_CONCURRENT?.trim();
  const fallback = 5;
  const n = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(32, Math.max(1, Math.floor(n)));
}

const pdfRenderSemaphore = new PdfRenderSemaphore(resolvePlaywrightMaxConcurrent());

let browserSingleton: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserSingleton && !browserSingleton.isConnected()) {
    browserSingleton = null;
  }
  if (browserSingleton) {
    return browserSingleton;
  }
  try {
    browserSingleton = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `PDF (Playwright): Chromium не запущен (${msg}). ` +
        `В Docker образе нужны браузеры и PLAYWRIGHT_BROWSERS_PATH (см. Dockerfile). ` +
        `Локально: npx playwright install chromium. Либо TICKET_PDF_RENDERER=prince и Prince в PATH.`,
      { cause: e },
    );
  }
  return browserSingleton;
}

const SETCONTENT_TIMEOUT_MS = Number(process.env.TICKET_PDF_SETCONTENT_TIMEOUT_MS ?? "45000");

/**
 * Дождаться веб-шрифта билета перед `page.pdf()`, иначе часть текста уходит в системный fallback.
 * Достаточно для variable Cy Grotesk Grand (woff2 в data URL в `@font-face`).
 */
async function waitForTicketFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    try {
      const fam = '"Cy Grotesk Grand"';
      const specs = [
        "500 12px",
        "500 13px",
        "500 14.5px",
        "500 17px",
        "600 24px",
        "600 26px",
        "600 32px",
        "700 22px",
      ];
      await Promise.all(specs.map((d) => document.fonts.load(`${d} ${fam}`)));
    } catch {
      /* нет @font-face / семейства — билет всё равно соберём fallback-шрифтом */
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

/** HTML-документ → PDF A4 (печать как в браузере: потоковая вёрстка без координат). */
export async function renderHtmlToPdfBuffer(html: string): Promise<Uint8Array> {
  await pdfRenderSemaphore.acquire();
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      // Билет — только inline/data URL, без сети; `networkidle` на проде может не наступить или висеть до таймаута.
      await page.setContent(html, {
        waitUntil: "load",
        timeout: SETCONTENT_TIMEOUT_MS,
      });
      await waitForTicketFonts(page);
      const buf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return new Uint8Array(buf);
    } finally {
      await page.close();
    }
  } finally {
    pdfRenderSemaphore.release();
  }
}
