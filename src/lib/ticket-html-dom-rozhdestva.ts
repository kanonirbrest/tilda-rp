import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { formatMinorUnits } from "@/lib/money";
import { getExhibitionTimezone, dateKeyInTz, timeKeyInTz } from "@/lib/exhibition-time";
import { DOM_ROZHDESTVA_TICKET_LEGAL_BLOCK } from "@/lib/ticket-legal-default";
import type { TicketPdfInput } from "./ticket-html-build";

const ASSET_DIR = ["assets", "tickets", "dom-rozhdestva"] as const;
const FONT_DIR = ["assets", "fonts", "cy-grotesk-grand"] as const;

function assetSearchRoots(): string[] {
  const cwd = process.cwd();
  const fromThisFile = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const envRoot = process.env.TICKET_ASSETS_ROOT?.trim();
  const roots = [cwd, fromThisFile, join(cwd, "dei-tickets")];
  if (envRoot && existsSync(envRoot)) roots.unshift(envRoot);
  return [...new Set(roots)];
}

function resolveFirstExisting(rel: string[]): string | null {
  for (const root of assetSearchRoots()) {
    const p = join(root, ...rel);
    if (existsSync(p)) return p;
  }
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeForPdfText(s: string): string {
  return s
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/\u00AD/g, "")
    .replace(/[\u202A-\u202E]/g, "")
    .trim();
}

function fileToDataUrl(absPath: string): string {
  const buf = readFileSync(absPath);
  const ext = absPath.split(".").pop()?.toLowerCase();
  const mime =
    ext === "png" ? "image/png" :
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "webp" ? "image/webp" :
    ext === "svg" ? "image/svg+xml" :
    ext === "woff2" ? "font/woff2" :
    ext === "woff" ? "font/woff" :
    ext === "ttf" ? "font/ttf" :
    ext === "otf" ? "font/otf" :
    "application/octet-stream";
  if (mime === "image/svg+xml") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buf.toString("utf8"))}`;
  }
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function assetDataUrl(...name: string[]): string | null {
  const p = resolveFirstExisting([...ASSET_DIR, ...name]);
  return p ? fileToDataUrl(p) : null;
}

function fontFace(weight: 400 | 700, fileName: string): string {
  const p = resolveFirstExisting([...FONT_DIR, fileName]);
  if (!p) return "";
  const src = fileToDataUrl(p);
  return `@font-face {
  font-family: "Cy Grotesk Grand";
  src: url(${src}) format("opentype");
  font-weight: ${weight};
  font-style: normal;
  font-display: block;
}
`;
}

function cyGroteskFaces(): string {
  const css = fontFace(400, "CyGrotesk-GrandRegular.otf") + fontFace(700, "CyGrotesk-GrandBold.otf");
  if (!css) {
    console.warn(
      "[ticket-pdf] Cy Grotesk Grand Regular/Bold OTF не найдены в assets/fonts/cy-grotesk-grand/",
    );
  }
  return css;
}

function formatDateDot(d: Date, tz: string): string {
  const key = dateKeyInTz(d, tz);
  const [y, m, day] = key.split("-");
  if (!y || !m || !day) return "";
  return `${day}.${m}.${y}`;
}

function formatPrice(isoMinor: number, currency: string): string {
  return sanitizeForPdfText(formatMinorUnits(isoMinor, currency).toUpperCase().replace(/\.00(?=\s)/, ""));
}

function legalHtml(): string {
  return DOM_ROZHDESTVA_TICKET_LEGAL_BLOCK.trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((p, i, arr) => {
      const last = i === arr.length - 1 ? " legal-p--last" : "";
      return `<p class="legal-p${last}">${escapeHtml(sanitizeForPdfText(p))}</p>`;
    })
    .join("");
}

function img(src: string | null, className: string, extra = ""): string {
  if (!src) return "";
  return `<img class="${className}" src="${src}" alt="" ${extra}/>`;
}

export async function buildDomRozhdestvaTicketHtml(opts: TicketPdfInput): Promise<string> {
  const tz = getExhibitionTimezone();
  const dateStr = formatDateDot(opts.startsAt, tz);
  const timeStr = sanitizeForPdfText(timeKeyInTz(opts.startsAt, tz));
  const priceStr = formatPrice(opts.amountCents, opts.currency);
  const orderId = sanitizeForPdfText(opts.orderId);
  const typeStr = sanitizeForPdfText(opts.ticketTierLabel ?? "");

  const qrDataUrl = await QRCode.toDataURL(opts.qrUrl, {
    type: "image/png",
    margin: 1,
    width: 400,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });

  const background = assetDataUrl("background.jpg") ?? assetDataUrl("background.png");
  const logo = assetDataUrl("logo.png");
  const train = assetDataUrl("train.png");
  const drum = assetDataUrl("drum.png");
  const nutcracker = assetDataUrl("nutcracker.png");
  const dei = assetDataUrl("dei-logo.png");
  const razman = assetDataUrl("razman-logo.png");
  const dividers = assetDataUrl("meta-dividers.svg");
  const faces = cyGroteskFaces();

  if (!background || !logo) {
    console.warn("[ticket-pdf] Дом Рождества: нет background или logo в assets/tickets/dom-rozhdestva/");
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    ${faces}
    * { box-sizing: border-box; }
    input, select, textarea, button { display: none !important; }
    @page { size: 797px 1123px; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      width: 797px;
      height: 1123px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      background: #062c20;
      color: #ffffff;
      font-family: "Cy Grotesk Grand", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .sheet {
      position: relative;
      width: 797px;
      height: 1123px;
      overflow: hidden;
      background: #062c20;
    }
    .bg {
      position: absolute;
      left: 0;
      top: -3px;
      width: 797px;
      height: 1129px;
      object-fit: cover;
      pointer-events: none;
    }
    .train {
      position: absolute;
      left: 435.84px;
      top: 411px;
      width: 129.169px;
      height: 120.962px;
      object-fit: cover;
      pointer-events: none;
    }
    .logo {
      position: absolute;
      left: 287.4px;
      top: 16.64px;
      width: 223.771px;
      height: 129.891px;
      object-fit: cover;
      object-position: center top;
      pointer-events: none;
    }
    .by-line {
      position: absolute;
      left: 404.53px;
      top: 161.83px;
      transform: translateX(-50%);
      margin: 0;
      font-weight: 400;
      font-size: 12.04px;
      line-height: 1;
      color: #f4cc88;
      text-transform: uppercase;
      white-space: nowrap;
      text-align: center;
    }
    .title {
      position: absolute;
      left: 50%;
      top: 213px;
      transform: translateX(-50%);
      margin: 0;
      width: 541px;
      height: 71px;
      font-weight: 700;
      font-size: 26px;
      line-height: normal;
      text-align: center;
      color: #ffffff;
      text-shadow: 0px 3.621px 11.134px rgba(0, 0, 0, 0.68);
    }
    .label {
      position: absolute;
      margin: 0;
      font-weight: 400;
      font-size: 16px;
      line-height: normal;
      color: #f4cc88;
    }
    .value {
      position: absolute;
      margin: 0;
      font-weight: 700;
      font-size: 24px;
      line-height: normal;
      color: #ffffff;
    }
    .label-date {
      left: 181.49px;
      top: 329px;
      width: 90.979px;
      height: 29.182px;
      text-align: center;
      transform: translateX(-50%);
    }
    .value-date {
      left: 182px;
      top: 358px;
      width: 186px;
      height: 32px;
      text-align: center;
      transform: translateX(-50%);
    }
    .label-time {
      left: 398.25px;
      top: 329px;
      width: 160.501px;
      height: 29.182px;
      text-align: center;
      transform: translateX(-50%);
    }
    .value-time {
      left: 50%;
      top: 358px;
      text-align: center;
      transform: translateX(-50%);
      white-space: nowrap;
    }
    .label-type {
      left: 609.85px;
      top: 331px;
      width: 195.691px;
      height: 29.182px;
      text-align: center;
      transform: translateX(-50%);
    }
    .value-type {
      left: 610px;
      top: 358px;
      width: 178px;
      height: 27px;
      text-align: center;
      transform: translateX(-50%);
    }
    .meta-dividers {
      position: absolute;
      left: 312px;
      top: 333px;
      width: 175px;
      height: 59px;
      pointer-events: none;
    }
    .meta-dividers img {
      display: block;
      width: 100%;
      height: 100%;
    }
    .label-venue { left: 65px; top: 432px; width: 297.828px; height: 29.182px; }
    .venue-block {
      position: absolute;
      left: 65px;
      top: 456px;
      width: 298px;
      height: 50px;
      margin: 0;
      color: #ffffff;
    }
    .venue-block .street {
      display: block;
      font-weight: 700;
      font-size: 24px;
      line-height: 1.2;
    }
    .venue-block .hint {
      display: block;
      font-weight: 400;
      font-size: 16px;
      line-height: 1.2;
    }
    .label-price { left: 65px; top: 522px; width: 297.828px; height: 29.182px; }
    .value-price { left: 65px; top: 546.4px; width: 278.945px; height: 26.607px; }
    .label-order { left: 65px; top: 587px; width: 297.828px; height: 29.182px; }
    .value-order {
      left: 66px;
      top: 616px;
      width: 405px;
      height: 21px;
      font-weight: 400;
      font-size: 16px;
      line-height: normal;
      overflow-wrap: anywhere;
    }
    .legal {
      position: absolute;
      left: 65px;
      top: 670px;
      width: 667px;
      height: 328px;
      font-weight: 400;
      font-size: 14px;
      line-height: normal;
      text-align: justify;
      color: #ffffff;
    }
    .legal-p {
      margin: 0 0 4px;
    }
    .legal-p--last { margin-bottom: 0; }
    .qr-frame {
      position: absolute;
      left: 540px;
      top: 441px;
      width: 192px;
      height: 192px;
      background: #ffffff;
      border-radius: 18px;
    }
    .qr-frame img {
      position: absolute;
      left: 9.71px;
      top: 9.71px;
      width: 172.584px;
      height: 172.584px;
      object-fit: contain;
      display: block;
    }
    .dei-logo {
      position: absolute;
      left: 64px;
      top: 1024px;
      width: 188.407px;
      height: 34px;
      object-fit: contain;
      pointer-events: none;
    }
    .razman-logo {
      position: absolute;
      left: 556px;
      top: 1024.85px;
      width: 176px;
      height: 26.984px;
      object-fit: contain;
      pointer-events: none;
    }
    .age {
      position: absolute;
      left: 74px;
      top: 73px;
      width: 72px;
      height: 43px;
      margin: 0;
      font-weight: 400;
      font-size: 32px;
      line-height: normal;
      color: rgba(255, 255, 255, 0.6);
    }
    .drum {
      position: absolute;
      left: 443px;
      top: 554px;
      width: 58px;
      height: 56px;
      object-fit: cover;
      pointer-events: none;
    }
    .nutcracker {
      position: absolute;
      left: 355px;
      top: 441px;
      width: 86px;
      height: 141px;
      object-fit: cover;
      pointer-events: none;
    }
    .pdf-font-primer {
      position: absolute;
      left: -10000px;
      top: 0;
      width: 1px;
      height: 1px;
      overflow: hidden;
      white-space: nowrap;
      font-family: "Cy Grotesk Grand", system-ui, sans-serif;
      pointer-events: none;
      visibility: hidden;
    }
    .pdf-font-primer .w400 { font-weight: 400; }
    .pdf-font-primer .w700 { font-weight: 700; }
  </style>
</head>
<body>
  <div class="pdf-font-primer" aria-hidden="true">
    <span class="w400">АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя 0123456789 BYN</span>
    <span class="w700">Интерактивное пространство Дом Рождества Машерова Взрослый Единый</span>
  </div>
  <div class="sheet">
    ${img(background, "bg")}
    ${img(train, "train")}
    ${img(logo, "logo")}
    <p class="by-line">BY RAZMAN PRODUCTION</p>
    <p class="title">Интерактивное пространство<br/>«Дом Рождества»</p>
    <p class="label label-date">дата</p>
    <p class="value value-date">${escapeHtml(dateStr)}</p>
    <p class="label label-time">время</p>
    <p class="value value-time">${escapeHtml(timeStr)}</p>
    <p class="label label-type">тип билета</p>
    <p class="value value-type">${escapeHtml(typeStr)}</p>
    ${dividers ? `<div class="meta-dividers">${img(dividers, "")}</div>` : ""}
    <p class="label label-venue">место проведения</p>
    <p class="venue-block"><span class="street">Машерова 15/1,</span><span class="hint">вход со двора</span></p>
    <p class="label label-price">стоимость билета</p>
    <p class="value value-price">${escapeHtml(priceStr)}</p>
    <p class="label label-order">номер заказа</p>
    <p class="value value-order">${escapeHtml(orderId)}</p>
    <div class="legal">${legalHtml()}</div>
    <div class="qr-frame"><img src="${qrDataUrl}" alt="" /></div>
    ${img(dei, "dei-logo")}
    ${img(razman, "razman-logo")}
    <p class="age">0+</p>
    ${img(drum, "drum")}
    ${img(nutcracker, "nutcracker")}
  </div>
</body>
</html>`;
}
