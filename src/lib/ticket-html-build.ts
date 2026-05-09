import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { formatMinorUnits } from "@/lib/money";
import { DEFAULT_TICKET_LEGAL_BLOCK } from "@/lib/ticket-legal-default";
import { NIGHT_OF_MUSEUMS_SLOT_KIND } from "@/lib/slot-kind";

export type TicketPdfInput = {
  title: string;
  startsAt: Date;
  amountCents: number;
  currency: string;
  orderId: string;
  qrUrl: string;
  ticketTierLabel?: string;
  admissionCount?: number;
  ticketOrdinal?: { index: number; total: number };
  /** Для `NIGHT_OF_MUSEUMS`: «Дата и время» — две строки (дата из слота, диапазон из названия `Night of Museums …`). */
  slotKind?: string;
};

const VENUE_LINE =
  "МИНСК, ПР-Т МАШЕРОВА 15/1, ВХОД СО ДВОРА";

/** Ссылка на блок «Адрес» на сайте DEI — кликабельно в PDF. */
const VENUE_ADDRESS_URL = "https://dei.by/contacts#address";

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

/** Невидимые/Bidi-символы из локали или копипаста дают странные глифы в Chromium PDF; убираем до верстки. */
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
 * Для меньшего размера PDF используйте сжатый JPEG/WebP под A4 вместо огромного PNG.
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

function resolveRuleLineStarSvgDataUrl(side: "left" | "right"): string | null {
  const name = side === "left" ? "rule-line-star-left.svg" : "rule-line-star-right.svg";
  const p = resolveFirstExisting(["assets", "svg", name]);
  if (!p) return null;
  return fileToDataUrl(p);
}

/**
 * Локальный Cy Grotesk Grand для PDF (data URL в `@font-face`, без сети).
 * Переопределение: `TICKET_PDF_CY_GROTESK_WOFF2` — абсолютный путь к `.woff2`.
 * По умолчанию: `assets/fonts/cy-grotesk-grand-2.woff2`.
 */
function resolveCyGroteskGrandWoff2Path(): string | null {
  const env = process.env.TICKET_PDF_CY_GROTESK_WOFF2?.trim();
  if (env && existsSync(env)) return env;
  return resolveFirstExisting(["assets", "fonts", "cy-grotesk-grand-2.woff2"]);
}

function cyGroteskGrandFontFaceCss(): string {
  const p = resolveCyGroteskGrandWoff2Path();
  if (!p) return "";
  const src = fileToDataUrl(p);
  return `@font-face {
  font-family: "Cy Grotesk Grand";
  src: url(${src}) format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}
`;
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
    .map((p) => `<p class="legal-line">${escapeHtml(sanitizeForPdfText(p))}</p>`)
    .join("");
}

function formatWhenRuUpper(iso: Date): string {
  return sanitizeForPdfText(
    iso
      .toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" })
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
  );
}

/** Дата события одной строкой (как на билете Ночи музеев). */
function formatEventDateOnlyRuUpper(d: Date): string {
  return sanitizeForPdfText(
    d
      .toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
  );
}

/** Диапазон времени из заголовка слота: «Night of Museums 21:00-00:00» → «21:00-00:00». */
function parseNightOfMuseumsTimeRangeFromTitle(title: string): string | null {
  const m = /^Night\s+of\s+Museums\s+(.+)$/i.exec(title.trim());
  const rest = m?.[1]?.trim();
  return rest || null;
}

function formatPriceTicket(isoMinor: number, currency: string): string {
  const s = formatMinorUnits(isoMinor, currency).toUpperCase();
  return s.replace(/\.00(?=\s)/, "");
}

/** Пиксели стороны PNG QR; на странице он ~30 mm — 256 достаточно для сканирования и меньше весит в PDF. Env: `TICKET_PDF_QR_PX`. */
function qrRasterWidthPx(): number {
  const raw = process.env.TICKET_PDF_QR_PX?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 256;
  if (!Number.isFinite(n) || n < 180) return 180;
  if (n > 512) return 512;
  return Math.round(n);
}

export async function buildTicketHtml(opts: TicketPdfInput): Promise<string> {
  const qrPx = qrRasterWidthPx();
  const qrDataUrl = await QRCode.toDataURL(opts.qrUrl, {
    type: "image/png",
    margin: 1,
    width: qrPx,
    errorCorrectionLevel: "M",
  });

  const bg = resolveTicketBackground();
  const hasBg = Boolean(bg.dataUrl);

  const whenStr = formatWhenRuUpper(opts.startsAt);
  const nightTimeRange =
    opts.slotKind === NIGHT_OF_MUSEUMS_SLOT_KIND ?
      parseNightOfMuseumsTimeRangeFromTitle(opts.title)
    : null;
  const whenValueHtml =
    opts.slotKind === NIGHT_OF_MUSEUMS_SLOT_KIND && nightTimeRange ?
      `<div class="field-value value-wide value-when-stacked">
          <span class="when-stacked-line when-stacked-line--date">${escapeHtml(formatEventDateOnlyRuUpper(opts.startsAt))}</span>
          <span class="when-stacked-line when-stacked-line--time">${escapeHtml(sanitizeForPdfText(nightTimeRange))}</span>
        </div>`
    : `<div class="field-value value-wide">${escapeHtml(whenStr)}</div>`;
  const priceStr = sanitizeForPdfText(formatPriceTicket(opts.amountCents, opts.currency));
  const legalHtml = legalToHtml(resolveLegalBlock());

  /* Типографский разделитель вместо средней точки «·» — в subset шрифта она иногда ломается в PDF. */
  const tierSep = " — ";
  let tierAndOrdinal = sanitizeForPdfText(opts.ticketTierLabel ?? "");
  if (opts.ticketOrdinal != null && opts.ticketOrdinal.total > 1) {
    tierAndOrdinal = tierAndOrdinal
      ? `${tierAndOrdinal}${tierSep}${opts.ticketOrdinal.index} из ${opts.ticketOrdinal.total}`
      : `${opts.ticketOrdinal.index} из ${opts.ticketOrdinal.total}`;
    if (opts.admissionCount != null && opts.admissionCount > 1) {
      tierAndOrdinal += `${tierSep}входов ${opts.admissionCount}`;
    }
  } else if (opts.admissionCount != null && opts.admissionCount > 1) {
    tierAndOrdinal = tierAndOrdinal
      ? `${tierAndOrdinal}${tierSep}входов ${opts.admissionCount}`
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
      `<div class="brand-mark" role="img" aria-label="${escapeHtml(sanitizeForPdfText(opts.title))}">
          <img class="brand-mark__img" src="${neboRekaSvg}" width="411" height="75" alt="" />
        </div>`
    : `<h1 class="brand-title">${escapeHtml(sanitizeForPdfText(opts.title))}</h1>`;

  const ruleLineLeftUrl = resolveRuleLineStarSvgDataUrl("left");
  const ruleLineRightUrl = resolveRuleLineStarSvgDataUrl("right");

  const ruleDividerHtml = (side: "left" | "right", opts?: { afterBlocks?: boolean }) => {
    const url = side === "left" ? ruleLineLeftUrl : ruleLineRightUrl;
    const extra = opts?.afterBlocks ? " rule--svg-end" : "";
    if (url) {
      return `<div class="rule rule--svg${extra}"><img class="rule-img" src="${url}" alt="" /></div>`;
    }
    if (side === "right") {
      return `<div class="rule star-right"><span class="star">✦</span><span class="line"></span></div>`;
    }
    return `<div class="rule"><span class="star">✦</span><span class="line"></span></div>`;
  };

  const cyGroteskFace = cyGroteskGrandFontFaceCss();

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    ${cyGroteskFace}
    * { box-sizing: border-box; }
    /* PDF: только наш разметочный HTML; подстраховка от UA-виджетов в рендере */
    input, select, textarea, button { display: none !important; }
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
      font-family: "Cy Grotesk Grand", system-ui, sans-serif;
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
      gap: 0;
    }
    /* Шапка: «ВАШ БИЛЕТ» — Figma Cy Grotesk 600, 24px / 33px */
    .eyebrow-strong {
      font-family: "Cy Grotesk Grand", system-ui, sans-serif;
      font-style: normal;
      font-weight: 600;
      font-size: 24px;
      line-height: 33px;
      text-transform: uppercase;
      color: #ffffff;
      margin-bottom: 2mm;
    }
    /* «На иммерсивную…» — отступ снизу 36px до «Небо.Река» / заголовка */
    .eyebrow-soft {
      font-family: "Cy Grotesk Grand", system-ui, sans-serif;
      font-weight: 600;
      font-size: 14.5px;
      line-height: 100%;
      letter-spacing: 0;
      text-transform: uppercase;
      color: #ffffff;
      max-width: 118mm;
      margin-bottom: 36px;
    }
    .brand-mark {
      margin: 0 0 1.5mm;
      max-width: 100%;
    }
    .brand-mark__img {
      display: block;
      width: 411px;
      max-width: 100%;
      height: auto;
    }
    .brand-title {
      margin: 0 0 2mm;
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.01em;
      word-wrap: break-word;
      color: #ffffff;
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

    .rule {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 2mm;
      margin: 4.5mm 0;
      flex-shrink: 0;
    }
    .rule.rule--svg {
      display: block;
      width: 100%;
      line-height: 0;
      gap: 0;
    }
    .rule.rule--svg .rule-img {
      display: block;
      width: 100%;
      height: auto;
    }
    /* Полоса адреса: 37px над верхней линией; 28px от линии до текста сверху и снизу */
    .blocks + .rule.star-right,
    .blocks + .rule.rule--svg-end {
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
    /* Подписи полей: Medium 500 — визуально «легче» строки значений (600/700) */
    .field-label {
      font-family: "Cy Grotesk Grand", system-ui, sans-serif;
      font-style: normal;
      font-weight: 500;
      font-size: 14.5px;
      line-height: 20px;
      text-transform: uppercase;
      color: #ffffff;
    }
    /* Значения (дата, участник, тип, цена, заказ): Figma — Demi/600, 26px, line-height 100% */
    .field-value {
      font-family: "Cy Grotesk Grand", system-ui, sans-serif;
      font-weight: 600;
      font-size: 26px;
      line-height: 100%;
      letter-spacing: 0;
      text-transform: uppercase;
      color: #ffffff;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    /* Длинный id заказа: не как «главные» строки — чуть мельче и Medium, как в макете */
    .field-value.order-id {
      font-size: 17px;
      font-weight: 500;
      line-height: 1.2;
      letter-spacing: 0.04em;
    }
    .value-when-stacked {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2mm;
    }
    .value-when-stacked .when-stacked-line--date {
      text-transform: uppercase;
    }
    .value-when-stacked .when-stacked-line--time {
      text-transform: none;
      font-variant-numeric: tabular-nums;
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
      font-family: "Cy Grotesk Grand", system-ui, sans-serif;
      font-weight: 500;
      font-size: 13px;
      line-height: 100%;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .venue-text a.venue-addr {
      color: inherit;
      text-decoration: underline;
      text-decoration-color: rgba(255, 255, 255, 0.85);
      text-underline-offset: 3px;
      text-decoration-thickness: 1px;
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
      font-family: "Cy Grotesk Grand", system-ui, sans-serif;
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
    /* Воздух между последней строкой .fine-print и логотипом (+20% к базовым 48px) */
    .razman-footer {
      text-align: center;
      margin-top: calc(48px * 1.2);
      padding-top: 0;
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.22em;
      text-transform: uppercase;
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
      </div>
      <div class="hero-qr">
        <img src="${qrDataUrl}" alt="" />
      </div>
    </div>

    ${ruleDividerHtml("left")}

    <div class="blocks">
      <section class="field-block">
        <div class="field-label">Дата и время</div>
        ${whenValueHtml}
      </section>
      ${tierBlock}
      <section class="field-block">
        <div class="field-label">Стоимость</div>
        <div class="field-value value-wide">${escapeHtml(priceStr)}</div>
      </section>
      <section class="field-block">
        <div class="field-label">Номер заказа</div>
        <div class="field-value order-id">${escapeHtml(sanitizeForPdfText(opts.orderId))}</div>
      </section>
    </div>

    ${ruleDividerHtml("right", { afterBlocks: true })}

    <div class="venue-wrap">
      <div class="venue-text">
        <span class="venue-line">Адрес проведения</span>
        <a class="venue-addr" href="${VENUE_ADDRESS_URL}" rel="noopener noreferrer">${escapeHtml(VENUE_LINE)}</a>
      </div>
      ${venueDeiBlock}
    </div>

    ${ruleDividerHtml("left")}

    <div class="fine-print">
      ${legalHtml}
    </div>
    ${razmanFooter}
  </div>
</body>
</html>`;
}
