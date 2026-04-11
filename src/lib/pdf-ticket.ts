import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PDFFont, PDFPage } from "pdf-lib";
import { PDFDocument, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { formatMinorUnits } from "@/lib/money";

let regularBytes: Uint8Array | null = null;
let boldBytes: Uint8Array | null = null;

function fontPath(filename: string) {
  return join(process.cwd(), "assets", "fonts", filename);
}

function getRegularBytes(): Uint8Array {
  regularBytes ??= new Uint8Array(readFileSync(fontPath("NotoSans-Regular.ttf")));
  return regularBytes;
}

function getBoldBytes(): Uint8Array {
  boldBytes ??= new Uint8Array(readFileSync(fontPath("NotoSans-Bold.ttf")));
  return boldBytes;
}

/** Координата baseline: расстояние от верха страницы A4 (pt). */
function yFromTop(pageHeight: number, fromTop: number): number {
  return pageHeight - fromTop;
}

function wrapLines(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number,
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
      } else {
        let chunk = "";
        for (const ch of word) {
          const next = chunk + ch;
          if (font.widthOfTextAtSize(next, size) <= maxWidth) {
            chunk = next;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawLabelRow(
  page: PDFPage,
  opts: {
    x: number;
    yBaseline: number;
    label: string;
    value: string;
    font: PDFFont;
    fontBold: PDFFont;
    labelSize: number;
    valueSize: number;
    muted: ReturnType<typeof rgb>;
    dark: ReturnType<typeof rgb>;
    maxValueWidth: number;
  },
): number {
  const {
    x,
    yBaseline,
    label,
    value,
    font,
    fontBold,
    labelSize,
    valueSize,
    muted,
    dark,
    maxValueWidth,
  } = opts;
  page.drawText(label, {
    x,
    y: yBaseline,
    size: labelSize,
    font,
    color: muted,
  });
  const lw = font.widthOfTextAtSize(label, labelSize);
  const gap = 8;
  const valueX = x + lw + gap;
  const lines = wrapLines(value, maxValueWidth - (valueX - x), fontBold, valueSize);
  let y = yBaseline;
  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i]!, {
      x: valueX,
      y,
      size: valueSize,
      font: fontBold,
      color: dark,
    });
    if (i < lines.length - 1) {
      y -= valueSize + 4;
    }
  }
  return y - Math.max(labelSize, valueSize) - 14;
}

export async function buildTicketPdf(opts: {
  title: string;
  customerName: string;
  startsAt: Date;
  /** Сумма заказа в копейках (минорные единицы). */
  amountCents: number;
  currency: string;
  orderId: string;
  qrUrl: string;
  /** Состав билетов с Тильды */
  linesSummary?: string;
  admissionCount?: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const font = await doc.embedFont(getRegularBytes(), { subset: true });
  const fontBold = await doc.embedFont(getBoldBytes(), { subset: true });

  const qrPng = await QRCode.toBuffer(opts.qrUrl, {
    type: "png",
    margin: 1,
    width: 280,
    errorCorrectionLevel: "M",
  });
  const qrImage = await doc.embedPng(qrPng);

  const pageW = 595.28;
  const pageH = 841.89;
  const page = doc.addPage([pageW, pageH]);

  const margin = 44;
  const cardX = margin;
  const cardY = margin;
  const cardW = pageW - margin * 2;
  const cardH = pageH - margin * 2;

  const paper = rgb(0.93, 0.94, 0.96);
  const cardBg = rgb(1, 1, 1);
  const accent = rgb(0.18, 0.32, 0.52);
  const accentLight = rgb(0.26, 0.42, 0.65);
  const dark = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.45, 0.48, 0.52);
  const border = rgb(0.86, 0.88, 0.92);
  const white = rgb(1, 1, 1);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageW,
    height: pageH,
    color: paper,
  });

  page.drawRectangle({
    x: cardX,
    y: cardY,
    width: cardW,
    height: cardH,
    color: cardBg,
    borderColor: border,
    borderWidth: 0.75,
  });

  const headerH = 108;
  const headerBottom = cardY + cardH - headerH;
  page.drawRectangle({
    x: cardX,
    y: headerBottom,
    width: cardW,
    height: headerH,
    color: accent,
  });
  page.drawRectangle({
    x: cardX,
    y: headerBottom,
    width: 6,
    height: headerH,
    color: accentLight,
  });

  const padX = cardX + 28;
  const headerTopFromPageTop = pageH - (headerBottom + headerH);
  page.drawText("ВХОДНОЙ БИЛЕТ", {
    x: padX,
    y: yFromTop(pageH, headerTopFromPageTop + 28),
    size: 9,
    font,
    color: rgb(0.75, 0.82, 0.92),
  });

  const titleMaxW = cardW - 56;
  const titleLines = wrapLines(opts.title, titleMaxW, fontBold, 20);
  let titleY = yFromTop(pageH, headerTopFromPageTop + 48);
  for (const tl of titleLines) {
    page.drawText(tl, {
      x: padX,
      y: titleY,
      size: 20,
      font: fontBold,
      color: white,
    });
    titleY -= 24;
  }

  const bodyTop = pageH - (headerTopFromPageTop + headerH + 36);
  const colW = cardW - 56;
  const qrSize = 168;
  const qrRight = cardX + cardW - 28 - qrSize;
  const textBlockW = colW - qrSize - 32;

  const whenStr = opts.startsAt.toLocaleString("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  let rowY = bodyTop;
  rowY = drawLabelRow(page, {
    x: padX,
    yBaseline: rowY,
    label: "Участник",
    value: opts.customerName,
    font,
    fontBold,
    labelSize: 9,
    valueSize: 12,
    muted,
    dark,
    maxValueWidth: textBlockW,
  });

  rowY = drawLabelRow(page, {
    x: padX,
    yBaseline: rowY,
    label: "Дата и время",
    value: whenStr,
    font,
    fontBold,
    labelSize: 9,
    valueSize: 12,
    muted,
    dark,
    maxValueWidth: textBlockW,
  });

  if (opts.linesSummary) {
    rowY = drawLabelRow(page, {
      x: padX,
      yBaseline: rowY,
      label: "Состав",
      value: opts.linesSummary,
      font,
      fontBold,
      labelSize: 9,
      valueSize: 11,
      muted,
      dark,
      maxValueWidth: textBlockW,
    });
  }

  if (opts.admissionCount != null && opts.admissionCount > 1) {
    rowY = drawLabelRow(page, {
      x: padX,
      yBaseline: rowY,
      label: "Мест",
      value: String(opts.admissionCount),
      font,
      fontBold,
      labelSize: 9,
      valueSize: 12,
      muted,
      dark,
      maxValueWidth: textBlockW,
    });
  }

  rowY = drawLabelRow(page, {
    x: padX,
    yBaseline: rowY,
    label: "Сумма",
    value: formatMinorUnits(opts.amountCents, opts.currency),
    font,
    fontBold,
    labelSize: 9,
    valueSize: 12,
    muted,
    dark,
    maxValueWidth: textBlockW,
  });

  rowY = drawLabelRow(page, {
    x: padX,
    yBaseline: rowY,
    label: "Заказ",
    value: `${opts.orderId.slice(0, 8)}…`,
    font,
    fontBold,
    labelSize: 9,
    valueSize: 10,
    muted,
    dark,
    maxValueWidth: textBlockW,
  });

  const idLines = wrapLines(opts.orderId, textBlockW, font, 7);
  let idY = rowY - 4;
  for (const line of idLines) {
    page.drawText(line, {
      x: padX,
      y: idY,
      size: 7,
      font,
      color: muted,
    });
    idY -= 9;
  }

  const qrBoxY = headerBottom - 28 - qrSize - 8;
  page.drawRectangle({
    x: qrRight - 12,
    y: qrBoxY - 12,
    width: qrSize + 24,
    height: qrSize + 24,
    color: rgb(0.98, 0.99, 1),
    borderColor: border,
    borderWidth: 0.6,
  });

  page.drawImage(qrImage, {
    x: qrRight,
    y: qrBoxY,
    width: qrSize,
    height: qrSize,
  });

  page.drawText("Покажите QR при входе", {
    x: qrRight,
    y: qrBoxY - 22,
    size: 9,
    font: fontBold,
    color: accent,
  });

  page.drawText("Действителен один раз · Не подлежит передаче третьим лицам", {
    x: padX,
    y: cardY + 36,
    size: 8,
    font,
    color: muted,
  });

  return doc.save();
}
