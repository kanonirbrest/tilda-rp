import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { TicketPdfInput } from "./ticket-html-build";
import {
  buildDomRozhdestvaShellHtml,
  domRozhdestvaAssetDirectory,
  domRozhdestvaTicketFields,
  readDomRozhdestvaFont,
} from "./ticket-html-dom-rozhdestva";
import type { DomShellField, DomShellLayout } from "./ticket-pdf-dom-rozhdestva-layout";

type ShellCache = {
  hash: string;
  pdf: Uint8Array;
  layout: DomShellLayout;
};

const SHELL_PDF = "shell.pdf";
const SHELL_META = "shell.meta.json";

let shellCache: ShellCache | null = null;
let shellLoading: Promise<ShellCache> | null = null;
let shellHashOnce: Promise<string> | null = null;
let regularFont: Buffer | null = null;
let boldFont: Buffer | null = null;

function fontBytes(weight: 400 | 700): Buffer {
  if (weight === 700) {
    boldFont ??= readDomRozhdestvaFont(700);
    return boldFont;
  }
  regularFont ??= readDomRozhdestvaFont(400);
  return regularFont;
}

function shellHash(): Promise<string> {
  shellHashOnce ??= buildDomRozhdestvaShellHtml().then((html) =>
    createHash("sha256").update(html).digest("hex"),
  );
  return shellHashOnce;
}

function readCachedShell(hash: string): ShellCache | null {
  const dir = domRozhdestvaAssetDirectory();
  if (!dir) return null;
  const metaPath = join(dir, SHELL_META);
  const pdfPath = join(dir, SHELL_PDF);
  if (!existsSync(metaPath) || !existsSync(pdfPath)) return null;
  let meta: { hash?: string; layout?: DomShellLayout };
  try {
    meta = JSON.parse(readFileSync(metaPath, "utf8")) as { hash?: string; layout?: DomShellLayout };
  } catch {
    return null;
  }
  if (meta.hash !== hash || !meta.layout?.fields || !meta.layout.qr) return null;
  return { hash, pdf: new Uint8Array(readFileSync(pdfPath)), layout: meta.layout };
}

function persistShell(shell: ShellCache): void {
  const dir = domRozhdestvaAssetDirectory();
  if (!dir) return;
  try {
    writeFileSync(join(dir, SHELL_PDF), shell.pdf);
    writeFileSync(
      join(dir, SHELL_META),
      JSON.stringify({ hash: shell.hash, layout: shell.layout }, null, 2),
    );
  } catch (err) {
    console.warn("[ticket-pdf] подложку Дома Рождества не удалось записать на диск", err);
  }
}

async function loadShell(): Promise<ShellCache> {
  const hash = await shellHash();
  if (shellCache?.hash === hash) return shellCache;
  if (!shellLoading) {
    shellLoading = (async () => {
      const fromDisk = readCachedShell(hash);
      if (fromDisk) {
        shellCache = fromDisk;
        return fromDisk;
      }
      const { buildDomRozhdestvaShellAssets } = await import("./ticket-pdf-dom-rozhdestva-shell");
      const built = await buildDomRozhdestvaShellAssets();
      const shell = { hash: built.hash, pdf: built.pdf, layout: built.layout };
      shellCache = shell;
      persistShell(shell);
      return shell;
    })().finally(() => {
      shellLoading = null;
    });
  }
  return shellLoading;
}

function drawField(
  page: PDFPage,
  font: PDFFont,
  field: DomShellField,
  text: string,
  pageWidth: number,
  pageHeight: number,
  cssWidth: number,
  cssHeight: number,
): void {
  const value = text.trim();
  if (!value) return;
  const sx = pageWidth / cssWidth;
  const sy = pageHeight / cssHeight;
  let size = field.size * sy;
  let width = font.widthOfTextAtSize(value, size);
  if (field.maxWidth != null && width > field.maxWidth * sx && width > 0) {
    size *= (field.maxWidth * sx) / width;
    width = font.widthOfTextAtSize(value, size);
  }
  const x = field.align === "center" ? field.x * sx - width / 2 : field.x * sx;
  const y = pageHeight - field.baseline * sy;
  page.drawText(value, { x, y, size, font, color: rgb(1, 1, 1) });
}

async function stamp(shell: ShellCache, opts: TicketPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(shell.pdf);
  const fontkit = await import("@pdf-lib/fontkit");
  const kit = ("default" in fontkit && fontkit.default ? fontkit.default : fontkit) as Parameters<
    PDFDocument["registerFontkit"]
  >[0];
  pdf.registerFontkit(kit);
  // subset ломает cmap у этих CFF/OTF: цифры и кириллица превращаются в чужие глифы.
  const regular = await pdf.embedFont(fontBytes(400), { subset: false });
  const bold = await pdf.embedFont(fontBytes(700), { subset: false });
  const page = pdf.getPages()[0];
  if (!page) throw new Error("В подложке билета нет страницы");
  const { width, height } = page.getSize();
  const { layout } = shell;
  const fields = domRozhdestvaTicketFields(opts);
  const fontFor = (weight: 400 | 700) => (weight === 700 ? bold : regular);

  drawField(page, fontFor(layout.fields.date.weight), layout.fields.date, fields.date, width, height, layout.cssWidth, layout.cssHeight);
  drawField(page, fontFor(layout.fields.time.weight), layout.fields.time, fields.time, width, height, layout.cssWidth, layout.cssHeight);
  drawField(page, fontFor(layout.fields.type.weight), layout.fields.type, fields.type, width, height, layout.cssWidth, layout.cssHeight);
  drawField(page, fontFor(layout.fields.price.weight), layout.fields.price, fields.price, width, height, layout.cssWidth, layout.cssHeight);
  drawField(page, fontFor(layout.fields.order.weight), layout.fields.order, fields.orderId, width, height, layout.cssWidth, layout.cssHeight);

  const png = await QRCode.toBuffer(opts.qrUrl, {
    type: "png",
    margin: 1,
    width: 400,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  const image = await pdf.embedPng(png);
  const sx = width / layout.cssWidth;
  const sy = height / layout.cssHeight;
  const qrSize = layout.qr.size * sx;
  page.drawImage(image, {
    x: layout.qr.x * sx,
    y: height - (layout.qr.y + layout.qr.size) * sy,
    width: qrSize,
    height: layout.qr.size * sy,
  });

  return pdf.save();
}

/**
 * Билет «Дом Рождества» без запуска Chromium: подложка уже готова,
 * на неё наносятся дата, время, тип, цена, номер и QR.
 */
export async function renderDomRozhdestvaTicketPdf(opts: TicketPdfInput): Promise<Uint8Array> {
  try {
    const shell = await loadShell();
    return await stamp(shell, opts);
  } catch (err) {
    console.error("[ticket-pdf] быстрый рендер Дома Рождества не удался, откат на Chromium", err);
    const { buildTicketHtml } = await import("./ticket-html-build");
    const { renderHtmlToPdfBuffer } = await import("./ticket-pdf-playwright");
    return renderHtmlToPdfBuffer(await buildTicketHtml(opts));
  }
}

export type PrintTicketPdfPage = {
  qrUrl: string;
  /** Порядковый номер: «00001». */
  serialLabel: string;
  /** Уникальный код: «XXXXX-XXXXX». */
  displayCode: string;
  /** Тип билета, как он печатается: «ВЗРОСЛЫЙ», «ДЕТСКИЙ (3-11 ЛЕТ)». */
  tierLabel: string;
};

const PRINT_SHELL_PDF = "shell.pdf";
const PRINT_SHELL_HASH = "shell.hash";
const PRINT_ASSET_DIR = ["assets", "tickets", "print-dom-rozhdestva"] as const;

let printShellPdf: Promise<Uint8Array> | null = null;

function printAssetPath(name: string): string {
  return join(process.cwd(), ...PRINT_ASSET_DIR, name);
}

/** Подложка печатного билета: с диска, если hash совпал; иначе Chromium один раз. */
function loadPrintShell(): Promise<Uint8Array> {
  printShellPdf ??= (async () => {
    const { buildPrintDomRozhdestvaSheetHtml } = await import("./print-ticket-dom-rozhdestva-sheet");
    const html = buildPrintDomRozhdestvaSheetHtml();
    const hash = createHash("sha256").update(html).digest("hex");
    const pdfPath = printAssetPath(PRINT_SHELL_PDF);
    const hashPath = printAssetPath(PRINT_SHELL_HASH);
    if (existsSync(pdfPath) && existsSync(hashPath) && readFileSync(hashPath, "utf8").trim() === hash) {
      return new Uint8Array(readFileSync(pdfPath));
    }
    const { renderHtmlToPdfBuffer } = await import("./ticket-pdf-playwright");
    const pdf = await renderHtmlToPdfBuffer(html);
    try {
      writeFileSync(pdfPath, pdf);
      writeFileSync(hashPath, hash);
    } catch (err) {
      console.warn("[print-ticket] подложку не удалось записать на диск", err);
    }
    return pdf;
  })().catch((err) => {
    printShellPdf = null;
    throw err;
  });
  return printShellPdf;
}

type FontMetrics = { ascent: number; lineGap: number; unitsPerEm: number };

/** Метрики шрифта: из них считается базовая линия строки при `line-height: normal`. */
async function readFontMetrics(bytes: Buffer): Promise<FontMetrics> {
  const fontkit = (await import("@pdf-lib/fontkit")) as unknown as {
    create?: (b: Buffer) => FontMetrics;
    default?: { create: (b: Buffer) => FontMetrics };
  };
  const create = fontkit.create ?? fontkit.default?.create;
  if (!create) throw new Error("fontkit.create недоступен");
  const f = create(bytes);
  return { ascent: f.ascent, lineGap: f.lineGap, unitsPerEm: f.unitsPerEm };
}

/**
 * Печатные билеты «Дом Рождества»: вся пачка — один PDF, на каждый билет страница.
 * Подложка рисуется один раз, на странице меняются тип, коды, номер и QR.
 */
export async function renderDomRozhdestvaPrintBatchPdf(
  pages: PrintTicketPdfPage[],
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("Нет билетов для PDF");
  const { PRINT_SHEET_FIELDS, PRINT_SHEET_HEIGHT, PRINT_SHEET_QR, PRINT_SHEET_WIDTH } = await import(
    "./print-ticket-dom-rozhdestva-sheet"
  );
  const shellPdf = await loadPrintShell();

  const out = await PDFDocument.create();
  const fontkit = await import("@pdf-lib/fontkit");
  const kit = ("default" in fontkit && fontkit.default ? fontkit.default : fontkit) as Parameters<
    PDFDocument["registerFontkit"]
  >[0];
  out.registerFontkit(kit);

  const regularBytes = fontBytes(400);
  const boldBytes = fontBytes(700);
  // subset ломает cmap у этих CFF/OTF: цифры и кириллица превращаются в чужие глифы.
  const regular = await out.embedFont(regularBytes, { subset: false });
  const bold = await out.embedFont(boldBytes, { subset: false });
  const metrics = {
    400: await readFontMetrics(regularBytes),
    700: await readFontMetrics(boldBytes),
  } as const;

  const donor = await PDFDocument.load(shellPdf);
  const donorPage = donor.getPages()[0];
  if (!donorPage) throw new Error("В подложке печатного билета нет страницы");
  const { width, height } = donorPage.getSize();
  const [embedded] = await out.embedPages([donorPage]);
  const sx = width / PRINT_SHEET_WIDTH;
  const sy = height / PRINT_SHEET_HEIGHT;

  const drawField = (
    page: PDFPage,
    field: (typeof PRINT_SHEET_FIELDS)[keyof typeof PRINT_SHEET_FIELDS],
    text: string,
  ): void => {
    const value = text.trim();
    if (!value) return;
    const m = metrics[field.weight];
    // Строка в вёрстке стоит от верха line box; при `line-height: normal` базовая линия — ниже на lineGap/2 + ascent.
    const baseline = field.top + ((m.lineGap / 2 + m.ascent) / m.unitsPerEm) * field.size;
    page.drawText(value, {
      x: field.x * sx,
      y: height - baseline * sy,
      size: field.size * sy,
      font: field.weight === 700 ? bold : regular,
      color: rgb(0, 0, 0),
    });
  };

  for (const item of pages) {
    const page = out.addPage([width, height]);
    page.drawPage(embedded);
    drawField(page, PRINT_SHEET_FIELDS.tier, item.tierLabel);
    drawField(page, PRINT_SHEET_FIELDS.codeLeft, item.displayCode);
    drawField(page, PRINT_SHEET_FIELDS.codeRight, item.displayCode);
    drawField(page, PRINT_SHEET_FIELDS.serial, item.serialLabel);

    // QR векторный: легче PNG на порядок и не мылится при печати.
    page.drawSvgPath(qrSvgPath(item.qrUrl, PRINT_SHEET_QR.size * sx), {
      x: PRINT_SHEET_QR.x * sx,
      y: height - PRINT_SHEET_QR.y * sy,
      color: rgb(0, 0, 0),
      borderWidth: 0,
    });
  }

  return out.save();
}

/**
 * Контур QR одним путём (в pt, ось Y вниз от верхнего левого угла).
 * Подряд идущие тёмные модули строки склеены в один прямоугольник; поля — 1 модуль, как у PNG-версии.
 */
function qrSvgPath(text: string, sizePt: number): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 1;
  const cell = sizePt / (n + quiet * 2);
  const f = (v: number) => Number(v.toFixed(3));
  const parts: string[] = [];
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!qr.modules.get(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < n && qr.modules.get(row, col)) col++;
      // Чуть перекрываем соседние строки, чтобы между ними не было волосяных швов.
      parts.push(
        `M${f((start + quiet) * cell)} ${f((row + quiet) * cell)}h${f((col - start) * cell)}v${f(cell + 0.02)}h${f(-(col - start) * cell)}z`,
      );
    }
  }
  return parts.join("");
}
