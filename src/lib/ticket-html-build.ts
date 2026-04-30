import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { formatMinorUnits } from "@/lib/money";
import { DEFAULT_TICKET_LEGAL_BLOCK } from "@/lib/ticket-legal-default";

export type TicketPdfInput = {
  title: string;
  customerName: string;
  startsAt: Date;
  amountCents: number;
  currency: string;
  orderId: string;
  qrUrl: string;
  ticketTierLabel?: string;
  admissionCount?: number;
  ticketOrdinal?: { index: number; total: number };
};

const VENUE_LINE =
  "МИНСК, ПР-Т МАШЕРОВА 15/1, ВХОД СО ДВОРА";

/** Корни для поиска `assets/` — и от cwd (скрипты, Next из каталога приложения), и от расположения этого файла (иначе PDF из монорепы/другого cwd не находит svg). */
function assetSearchRoots(): string[] {
  const cwd = process.cwd();
  const fromThisFile = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return [...new Set([cwd, fromThisFile, join(cwd, "dei-tickets")])];
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

function fileToDataUrl(absPath: string): string {
  const buf = readFileSync(absPath);
  const ext = absPath.split(".").pop()?.toLowerCase();
  const mime =
    ext === "png" ? "image/png" :
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "webp" ? "image/webp" :
    ext === "svg" ? "image/svg+xml" :
    "application/octet-stream";
  if (mime === "image/svg+xml") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buf.toString("utf8"))}`;
  }
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Фон билета:
 * 1) `TICKET_PDF_ARTWORK` — свой PNG/JPEG/WebP (абсолютный путь);
 * 2) иначе `assets/tickets/ticket-background.png`;
 * 3) иначе `ticket-background.jpg` или `7777.jpg` в `assets/tickets`;
 * 4) иначе сплошной цвет подложки в `.sheet`.
 */
function resolveTicketBackground(): { dataUrl: string | null } {
  const envPath = process.env.TICKET_PDF_ARTWORK?.trim();
  if (envPath && existsSync(envPath)) {
    return { dataUrl: fileToDataUrl(envPath) };
  }

  for (const name of ["ticket-background.png", "ticket-background.jpg", "7777.jpg"] as const) {
    const p = resolveFirstExisting(["assets", "tickets", name]);
    if (p) return { dataUrl: fileToDataUrl(p) };
  }

  return { dataUrl: null };
}

function resolveRazmanLogoDataUrl(): string | null {
  const p = resolveFirstExisting(["assets", "svg", "logo.svg"]);
  if (!p) return null;
  return fileToDataUrl(p);
}

function resolveDeiLogoDataUrl(): string | null {
  const p = resolveFirstExisting(["assets", "svg", "dei-logo.svg"]);
  if (!p) return null;
  return fileToDataUrl(p);
}

function resolveNeboRekaTitleSvgDataUrl(): string | null {
  const p = resolveFirstExisting(["assets", "svg", "nebo-reka.svg"]);
  if (!p) return null;
  return fileToDataUrl(p);
}

function resolveLegalBlock(): string {
  const env = process.env.TICKET_LEGAL_BLOCK?.trim();
  if (env) return env;
  return DEFAULT_TICKET_LEGAL_BLOCK;
}

function legalToHtml(raw: string): string {
  return raw
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((p) => `<p class="legal-line">${escapeHtml(p)}</p>`)
    .join("");
}

function formatWhenRuUpper(iso: Date): string {
  return iso
    .toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" })
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function formatPriceTicket(isoMinor: number, currency: string): string {
  const s = formatMinorUnits(isoMinor, currency).toUpperCase();
  return s.replace(/\.00(?=\s)/, "");
}

export async function buildTicketHtml(opts: TicketPdfInput): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(opts.qrUrl, {
    type: "image/png",
    margin: 1,
    width: 400,
    errorCorrectionLevel: "M",
  });

  const bg = resolveTicketBackground();
  const hasBg = Boolean(bg.dataUrl);

  const whenStr = formatWhenRuUpper(opts.startsAt);
  const priceStr = formatPriceTicket(opts.amountCents, opts.currency);
  const legalHtml = legalToHtml(resolveLegalBlock());

  let tierAndOrdinal = opts.ticketTierLabel ?? "";
  if (opts.ticketOrdinal != null && opts.ticketOrdinal.total > 1) {
    tierAndOrdinal = tierAndOrdinal
      ? `${tierAndOrdinal} · ${opts.ticketOrdinal.index} из ${opts.ticketOrdinal.total}`
      : `${opts.ticketOrdinal.index} из ${opts.ticketOrdinal.total}`;
    if (opts.admissionCount != null && opts.admissionCount > 1) {
      tierAndOrdinal += ` · входов ${opts.admissionCount}`;
    }
  } else if (opts.admissionCount != null && opts.admissionCount > 1) {
    tierAndOrdinal = tierAndOrdinal
      ? `${tierAndOrdinal} · входов ${opts.admissionCount}`
      : `Входов: ${opts.admissionCount}`;
  }

  const typeDisplay = tierAndOrdinal.trim();
  const tierBlock =
    typeDisplay ?
      `<section class="field-block">
          <div class="field-label">Тип билета</div>
          <div class="field-value value-wide">${escapeHtml(typeDisplay.toUpperCase())}</div>
        </section>`
    : "";

  const bgStyle = hasBg ? `background-image: url(${bg.dataUrl})` : "";
  const sheetClass = ["sheet", hasBg ? "sheet--mesh" : ""].filter(Boolean).join(" ");
  const bodyPageClass = hasBg ? "ticket-page--mesh" : "ticket-page--solid";

  const logoUrl = resolveRazmanLogoDataUrl();
  const razmanFooter =
    logoUrl ?
      `<div class="razman-footer"><img src="${logoUrl}" width="185" height="30" alt="Razman Production" /></div>`
    : `<div class="razman-footer">Razman Production</div>`;

  const deiLogoUrl = resolveDeiLogoDataUrl();
  const venueDeiBlock =
    deiLogoUrl ?
      `<div class="venue-dei"><img class="dei-logo-img" src="${deiLogoUrl}" width="209" height="31" alt="DEI — Дом экспериментального искусства" /></div>`
    : `<div class="venue-dei">
        <span class="dei-mark">DEI</span>
        <span class="dei-sub">Дом экспериментального искусства</span>
      </div>`;

  const neboRekaSvg = resolveNeboRekaTitleSvgDataUrl();
  const heroTitleBlock =
    neboRekaSvg ?
      `<div class="brand-mark" role="img" aria-label="${escapeHtml(opts.title)}">
          <img class="brand-mark__img" src="${neboRekaSvg}" width="411" height="75" alt="" />
        </div>`
    : `<h1 class="brand-title">${escapeHtml(opts.title)}</h1>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:wght@700&family=Rubik:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    html {
      margin: 0;
      padding: 0;
      min-height: 297mm;
      /* если контент короче страницы PDF — без белой полосы снизу */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body.ticket-page {
      margin: 0;
      padding: 0;
      min-height: 297mm;
      width: 100%;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    body.ticket-page--mesh {
      background-color: #12082a;
    }
    body.ticket-page--solid {
      background-color: #2e7d32;
    }
    :root {
      /* Figma: холст 797×1123 (как «7777» / экспорт), совпадает с A4 по пропорции */
      --ticket-canvas-w: 797px;
      --ticket-canvas-h: 1123px;
    }
    /* Отступы: те же 11 / 14 / 12 mm в пикселях масштаба холста (797/210) */
    .sheet {
      width: var(--ticket-canvas-w);
      min-height: 297mm;
      margin: 0 auto;
      padding: 36px 48px 36px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      /* Высота A4: фон/картинка на всю страницу, без белой зоны внизу */
      page-break-inside: avoid;
      break-inside: avoid;
      background-color: #2e7d32;
      background-position: center center;
      background-size: cover;
      background-repeat: no-repeat;
      color: #ffffff;
      /* Cy Grotesk в макете недоступен в вебе: Rubik — геометрический гротеск с кириллицей, чуть плотнее Manrope. */
      font-family: Rubik, Manrope, system-ui, sans-serif;
    }
    /* Декоративный растр (7777.jpg): Figma position left -4px, top -3px */
    .sheet--mesh {
      background-color: #12082a;
      background-size: cover;
      background-position: -4px -3px;
    }
    .hero {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
      gap: 4mm;
      flex-shrink: 0;
    }
    .hero-main {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2mm;
    }
    /* Шапка: «ВАШ БИЛЕТ» — Figma Cy Grotesk 600, 24px / 33px */
    .eyebrow-strong {
      font-family: "Cy Grotesk Grand", Rubik, Manrope, system-ui, sans-serif;
      font-style: normal;
      font-weight: 600;
      font-size: 24px;
      line-height: 33px;
      text-transform: uppercase;
      color: #ffffff;
    }
    /* «На иммерсивную…» — Figma Demi 14.5px, line-height 100%, uppercase */
    .eyebrow-soft {
      font-family: "Cy Grotesk Grand", Rubik, Manrope, system-ui, sans-serif;
      font-weight: 600;
      font-size: 14.5px;
      line-height: 100%;
      letter-spacing: 0;
      text-transform: uppercase;
      color: #ffffff;
      max-width: 118mm;
    }
    .brand-mark {
      margin: 2mm 0 1.5mm;
      max-width: 100%;
    }
    .brand-mark__img {
      display: block;
      width: 411px;
      max-width: 100%;
      height: auto;
    }
    .brand-title {
      margin: 3mm 0 2mm;
      font-family: "Playfair Display", Georgia, "Times New Roman", serif;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.01em;
      word-wrap: break-word;
      color: #ffffff;
    }
    .byline {
      font-size: 7px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      opacity: 0.75;
    }
    .hero-qr {
      flex: 0 0 auto;
      width: 34mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1mm;
    }
    .hero-qr img {
      width: 30mm;
      height: 30mm;
      padding: 2mm;
      background: #fff;
      border-radius: 4mm;
      object-fit: contain;
      display: block;
    }
    .hero-qr span {
      font-size: 6.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      opacity: 0.65;
      text-align: center;
    }

    .rule {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 2mm;
      margin: 4.5mm 0;
      flex-shrink: 0;
    }
    /* Полоса адреса: 37px над верхней линией; 28px от линии до текста сверху и снизу */
    .blocks + .rule.star-right {
      margin-top: 37px;
      margin-bottom: 0;
    }
    .venue-wrap + .rule {
      margin-top: 0;
    }
    .rule.star-right { flex-direction: row-reverse; }
    .rule .star { font-size: 8px; opacity: 0.9; flex-shrink: 0; }
    .rule .line {
      flex: 1 1 auto;
      height: 1px;
      background: rgba(255, 255, 255, 0.38);
      min-width: 0;
    }

    .blocks {
      display: flex;
      flex-direction: column;
      gap: 5mm;
      flex: 0 0 auto;
    }
    .field-block {
      display: flex;
      flex-direction: column;
      gap: 2.5mm;
      align-items: flex-start;
    }
    /* Подписи полей (ДАТА И ВРЕМЯ …): Figma — Cy Grotesk Grand 600, 14.5px / 20px, uppercase */
    .field-label {
      font-family: "Cy Grotesk Grand", Rubik, Manrope, system-ui, sans-serif;
      font-style: normal;
      font-weight: 600;
      font-size: 14.5px;
      line-height: 20px;
      text-transform: uppercase;
      color: #ffffff;
    }
    /* Значения (дата, участник, тип, цена, заказ): Figma — Demi/600, 26px, line-height 100% */
    .field-value {
      font-family: "Cy Grotesk Grand", Rubik, Manrope, system-ui, sans-serif;
      font-weight: 600;
      font-size: 26px;
      line-height: 100%;
      letter-spacing: 0;
      text-transform: uppercase;
      color: #ffffff;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .venue-wrap {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      gap: 6mm;
      margin: 28px 0;
      flex-shrink: 0;
    }
    .venue-text {
      display: flex;
      flex-direction: column;
      gap: 2.5mm;
      flex: 1 1 auto;
      min-width: 0;
    }
    /* Блок адреса: Figma — Cy Grotesk Grand Medium 13px, line-height 100%, uppercase (оба ряда) */
    .venue-text .venue-line,
    .venue-text .venue-addr {
      font-family: "Cy Grotesk Grand", Rubik, Manrope, system-ui, sans-serif;
      font-weight: 500;
      font-size: 13px;
      line-height: 100%;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .venue-dei {
      flex: 0 0 auto;
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.5mm;
    }
    .venue-dei .dei-mark {
      font-family: "Playfair Display", Georgia, serif;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1;
    }
    .venue-dei .dei-sub {
      font-size: 6px;
      font-weight: 600;
      letter-spacing: 0.06em;
      line-height: 1.25;
      text-transform: uppercase;
      max-width: 32mm;
      opacity: 0.85;
    }
    .venue-dei .dei-logo-img {
      display: block;
      width: 209px;
      max-width: 100%;
      height: auto;
    }

    /* Юридический блок: Cy Grotesk Grand Medium 12/13; без margin-top:auto — иначе лишняя вертикаль и 2-я страница PDF */
    .fine-print {
      font-family: "Cy Grotesk Grand", Rubik, Manrope, system-ui, sans-serif;
      font-weight: 500;
      font-size: 12px;
      line-height: 13px;
      letter-spacing: 0;
      text-transform: uppercase;
      opacity: 0.9;
      margin-top: 0;
      padding-top: 3mm;
      flex-shrink: 0;
    }
    .fine-print .legal-line {
      margin: 0 0 2mm;
    }
    .fine-print .legal-line:last-child {
      margin-bottom: 0;
    }
    .razman-footer {
      text-align: center;
      margin-top: 3mm;
      padding-top: 1.5mm;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      opacity: 0.85;
      flex-shrink: 0;
    }
    .razman-footer img {
      display: inline-block;
      vertical-align: middle;
      width: 185px;
      height: 30px;
      object-fit: contain;
    }
  </style>
</head>
<body class="ticket-page ${bodyPageClass}">
  <div class="${sheetClass}" style="${bgStyle}">
    <div class="hero">
      <div class="hero-main">
        <div class="eyebrow-strong">Ваш билет</div>
        <div class="eyebrow-soft">На иммерсивную медиа-выставку</div>
        ${heroTitleBlock}
        <div class="byline">By Razman Production</div>
      </div>
      <div class="hero-qr">
        <img src="${qrDataUrl}" alt="" />
        <span>Покажите QR при входе</span>
      </div>
    </div>

    <div class="rule">
      <span class="star">✦</span>
      <span class="line"></span>
    </div>

    <div class="blocks">
      <section class="field-block">
        <div class="field-label">Участник</div>
        <div class="field-value value-wide">${escapeHtml(opts.customerName.toUpperCase())}</div>
      </section>
      <section class="field-block">
        <div class="field-label">Дата и время</div>
        <div class="field-value value-wide">${escapeHtml(whenStr)}</div>
      </section>
      ${tierBlock}
      <section class="field-block">
        <div class="field-label">Стоимость</div>
        <div class="field-value value-wide">${escapeHtml(priceStr)}</div>
      </section>
      <section class="field-block">
        <div class="field-label">Номер заказа</div>
        <div class="field-value order-id">${escapeHtml(opts.orderId)}</div>
      </section>
    </div>

    <div class="rule star-right">
      <span class="star">✦</span>
      <span class="line"></span>
    </div>

    <div class="venue-wrap">
      <div class="venue-text">
        <span class="venue-line">Адрес проведения</span>
        <span class="venue-addr">${escapeHtml(VENUE_LINE)}</span>
      </div>
      ${venueDeiBlock}
    </div>

    <div class="rule">
      <span class="star">✦</span>
      <span class="line"></span>
    </div>

    <div class="fine-print">
      ${legalHtml}
    </div>
    ${razmanFooter}
  </div>
</body>
</html>`;
}
