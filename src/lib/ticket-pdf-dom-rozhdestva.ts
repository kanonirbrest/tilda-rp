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
