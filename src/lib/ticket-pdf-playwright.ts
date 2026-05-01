import { chromium, type Browser } from "playwright";

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

/** HTML-документ → PDF A4 (печать как в браузере: потоковая вёрстка без координат). */
export async function renderHtmlToPdfBuffer(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Билет — только inline/data URL, без сети; `networkidle` на проде может не наступить или висеть до таймаута.
    await page.setContent(html, {
      waitUntil: "load",
      timeout: SETCONTENT_TIMEOUT_MS,
    });
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return new Uint8Array(buf);
  } finally {
    await page.close();
  }
}
