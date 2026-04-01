import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import QRCode from "qrcode";

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

export async function buildTicketPdf(opts: {
  title: string;
  customerName: string;
  startsAt: Date;
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

  const qrPng = await QRCode.toBuffer(opts.qrUrl, { type: "png", margin: 1, width: 240 });
  const qrImage = await doc.embedPng(qrPng);

  const page = doc.addPage([595.28, 841.89]);
  let y = 780;
  const left = 50;
  const line = (text: string, size: number, bold = false) => {
    page.drawText(text, {
      x: left,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.12),
    });
    y -= size + 10;
  };

  line("Билет", 22, true);
  line(opts.title, 14, true);
  line(`Участник: ${opts.customerName}`, 12);
  line(`Дата и время: ${opts.startsAt.toLocaleString("ru-RU")}`, 12);
  if (opts.linesSummary) {
    line(`Состав: ${opts.linesSummary}`, 11);
  }
  if (opts.admissionCount != null && opts.admissionCount > 1) {
    line(`Количество мест: ${opts.admissionCount}`, 11);
  }
  line(`Сумма: ${(opts.amountCents / 100).toFixed(2)} ${opts.currency}`, 12);
  line(`Заказ: ${opts.orderId}`, 10);
  y -= 16;

  page.drawImage(qrImage, {
    x: left,
    y: y - 240,
    width: 200,
    height: 200,
  });
  y -= 260;
  line("Покажите QR при входе", 11, true);

  return doc.save();
}
