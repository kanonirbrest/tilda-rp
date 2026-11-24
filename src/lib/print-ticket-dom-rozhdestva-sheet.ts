import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readDomRozhdestvaFont } from "./ticket-html-dom-rozhdestva";

/**
 * Печатный билет «Дом Рождества» (макет Figma, фрейм 797×1123).
 *
 * Подложка без переменных полей: декор, логотипы, подписи и юридический текст.
 * Переменные поля (тип билета, уникальный код, порядковый номер, QR)
 * дописываются в PDF поверх подложки — координаты ниже, в CSS-пикселях макета.
 */

export const PRINT_SHEET_WIDTH = 797;
export const PRINT_SHEET_HEIGHT = 1123;

/** Поле, которое заполняется на каждом билете. `top` — верх строки в макете. */
export type PrintSheetField = {
  x: number;
  top: number;
  size: number;
  weight: 400 | 700;
};

export const PRINT_SHEET_FIELDS = {
  /** Тип билета: «ВЗРОСЛЫЙ» / «ДЕТСКИЙ (3-11 ЛЕТ)». */
  tier: { x: 66, top: 488, size: 24, weight: 700 },
  /** Уникальный код под подписью «уникальный номер билета» (слева). */
  codeLeft: { x: 66, top: 640, size: 16, weight: 700 },
  /** Порядковый номер (слева внизу). */
  serial: { x: 66, top: 1037, size: 16, weight: 400 },
  /** Уникальный код (справа внизу). */
  codeRight: { x: 443, top: 1037, size: 16, weight: 700 },
} satisfies Record<string, PrintSheetField>;

export const PRINT_SHEET_QR = { x: 549.703125, y: 476.703125, size: 172.578125 } as const;

const ASSET_DIR = ["assets", "tickets", "print-dom-rozhdestva"] as const;

const assetUrls = new Map<string, string>();

/** Один файл — одна data URL: повторы (линии, уголки) не раздувают HTML. */
function assetDataUrl(name: string): string {
  const cachedUrl = assetUrls.get(name);
  if (cachedUrl) return cachedUrl;
  const buf = readFileSync(join(process.cwd(), ...ASSET_DIR, name));
  const mime = name.endsWith(".svg") ? "image/svg+xml" : "image/png";
  const url = `data:${mime};base64,${buf.toString("base64")}`;
  assetUrls.set(name, url);
  return url;
}

function fontFace(weight: 400 | 700): string {
  const b64 = readDomRozhdestvaFont(weight).toString("base64");
  return `@font-face {
  font-family: "Cy Grotesk Grand";
  src: url(data:font/otf;base64,${b64}) format("opentype");
  font-weight: ${weight};
  font-style: normal;
}`;
}

/** Абсолютное позиционирование по процентам — как в экспорте Figma (контейнер — лист 797×1123). */
function at(top: string, right: string, bottom: string, left: string, extra = ""): string {
  return `style="top:${top};right:${right};bottom:${bottom};left:${left};${extra}"`;
}

/** Линия или иконка: внешний бокс + внутренний слой с подгонкой (как в Figma). */
function vector(src: string, outer: string[], inner?: string[]): string {
  const img = `<img class="fill" src="${assetDataUrl(src)}" alt="" />`;
  if (!inner) return `<div class="abs" ${at(...(outer as [string, string, string, string]))}>${img}</div>`;
  return `<div class="abs" ${at(...(outer as [string, string, string, string]))}><div class="abs" ${at(
    inner[0]!,
    inner[1]!,
    inner[2]!,
    inner[3]!,
  )}>${img}</div></div>`;
}

/** Повёрнутая ветка во flex-контейнере с cqw/cqh (размер считается от контейнера). */
function rotated(
  src: string,
  outer: string[],
  box: { w: string; h: string; rot: string },
  inner?: string[],
): string {
  const img = `<img class="fill" src="${assetDataUrl(src)}" alt="" />`;
  const content = inner
    ? `<div class="abs" ${at(inner[0]!, inner[1]!, inner[2]!, inner[3]!)}>${img}</div>`
    : img;
  return `<div class="abs flexc" ${at(...(outer as [string, string, string, string]))}>
    <div class="rot" style="width:${box.w};height:${box.h};transform:rotate(${box.rot});">
      <div class="rel">${content}</div>
    </div>
  </div>`;
}

function decor(): string {
  return [
    // Вертикальные нити сверху (линии 0 px шириной в макете, отрисованы через подгонку 0.5px)
    vector("fcfde.svg", ["-0.46%", "69.34%", "87.64%", "30.66%"], ["-0.35%", "-0.5px", "-0.35%", "-0.5px"]),
    vector("3c7f6.svg", ["-0.46%", "74.67%", "83.08%", "25.33%"], ["-0.26%", "-0.5px", "-0.26%", "-0.5px"]),
    vector("1437c.svg", ["-0.46%", "81.57%", "88.79%", "18.43%"], ["-0.38%", "-0.5px", "-0.38%", "-0.5px"]),
    // Верхние уголки рамки
    vector("b8d8d.svg", ["1.48%", "1.59%", "78.99%", "1.92%"], ["-0.23%", "0", "-0.23%", "0"]),
    // Нижние уголки рамки и боковые линии
    vector("6c286.svg", ["33.35%", "1.58%", "1.02%", "1.91%"]),
    vector("579a6.svg", ["16.83%", "74.13%", "82.41%", "24.8%"]),
    vector("3c7f6.svg", ["-0.46%", "23.49%", "83.08%", "76.51%"], ["-0.26%", "-0.5px", "-0.26%", "-0.5px"]),
    vector("12d31.svg", ["16.83%", "22.95%", "82.41%", "75.98%"]),
    vector("26841.svg", ["28.38%", "13.57%", "71.32%", "86.02%"]),
    vector("44a43.svg", ["22.98%", "15.71%", "76.87%", "84.07%"]),
    vector("a20aa.svg", ["11.07%", "80.54%", "87.54%", "17.4%"]),
    vector("c91d7.svg", ["-0.46%", "18.05%", "87.03%", "81.95%"], ["-0.33%", "-0.5px", "-0.33%", "-0.5px"]),
    vector("0eebc.svg", ["12.68%", "17.02%", "85.93%", "80.91%"]),
    vector("637e9.svg", ["12.22%", "68.48%", "86.63%", "29.81%"]),
    vector("71b78.svg", ["-0.46%", "29.43%", "88.82%", "70.57%"], ["-0.38%", "-0.5px", "-0.38%", "-0.5px"]),
    vector("70836.svg", ["10.97%", "28.58%", "87.87%", "69.71%"]),
    vector("3c01b.svg", ["17.22%", "91.69%", "81.27%", "6.19%"]),
    vector("fcab4.svg", ["58.48%", "4.36%", "39.63%", "92.97%"]),
    vector("6b219.svg", ["13.67%", "90.56%", "85.4%", "8.13%"]),
    vector("0cd0c.svg", ["24.14%", "83.03%", "74.94%", "15.66%"]),
    vector("08896.svg", ["95.08%", "66.95%", "3.99%", "31.74%"]),
    vector("c961c.svg", ["78.27%", "3.99%", "21.05%", "95.05%"]),
    vector("0dd02.svg", ["90.54%", "47.66%", "7.94%", "50.19%"]),
    vector("f09ec.svg", ["92.85%", "73.22%", "5.42%", "24.34%"]),
    vector("cbd1d.svg", ["13.42%", "6.74%", "83.96%", "89.56%"]),
    // Правый нижний угол: три элемента группы
    vector("75044.svg", ["70.16%", "-0.93%", "24.21%", "88.63%"], ["0", "0", "-0.8%", "-0.51%"]),
    vector("bc8c4.svg", ["66.67%", "-2.19%", "29.45%", "91.79%"], ["-1.16%", "0", "0", "0"]),
    vector("20a2d.svg", ["70.73%", "-2.64%", "22.9%", "97.65%"], ["0", "0", "0", "-1.27%"]),
    // Правые повёрнутые ветки
    rotated(
      "b1e41.svg",
      ["20.57%", "-5.01%", "66.88%", "89.03%"],
      { w: "hypot(72.5831cqw,20.4442cqh)", h: "hypot(-27.4169cqw,79.5558cqh)", rot: "17.3deg" },
      ["-0.43%", "0", "0", "-0.52%"],
    ),
    rotated(
      "7105f.svg",
      ["22.78%", "-4.53%", "68.97%", "97.32%"],
      { w: "hypot(55.0862cqw,10.6388cqh)", h: "hypot(-44.9138cqw,89.3612cqh)", rot: "17.3deg" },
    ),
    rotated(
      "61f1b.svg",
      ["27.47%", "-2.12%", "66.63%", "90.08%"],
      { w: "hypot(86.9313cqw,39.2353cqh)", h: "hypot(-13.0687cqw,60.7647cqh)", rot: "17.3deg" },
      ["-1.2%", "0", "0", "-0.44%"],
    ),
    // Верхние «лапы» у рамки
    vector("8d997.svg", ["-1.34%", "61.2%", "93.48%", "6.55%"], ["-0.57%", "-0.19%", "-0.57%", "-0.19%"]),
    vector("81f90.svg", ["-1.34%", "6.22%", "93.48%", "61.53%"], ["-0.57%", "-0.19%", "-0.57%", "-0.19%"]),
    // Левая ветка
    rotated(
      "48899.svg",
      ["20.52%", "89.23%", "64.9%", "-9.64%"],
      { w: "hypot(59.9474cqw,-38.6449cqh)", h: "hypot(40.0526cqw,61.3551cqh)", rot: "-32.97deg" },
      ["-0.42%", "0", "0", "0"],
    ),
  ].join("\n");
}

/**
 * Юридический текст. Переносы строк зафиксированы как в макете: ширина глифов
 * в Figma и у наших OTF чуть отличается, и без этого строки переносились бы иначе.
 * Все строки абзаца, кроме последней, растягиваются по ширине блока.
 */
function legalParagraphs(): string {
  const paragraphs: string[][] = [
    ["Билет действителен на вход в течение 60 минут после указанного", "времени сеанса при активации."],
    ["Время посещения — до 3 часов, если иное не указано", "организатором на сайте или на входе."],
    ["Допускается предъявление эл. билета на экране телефона или в", "распечатанном виде на белом листе А4."],
    [
      "Регистрируя данный билет, Вы соглашаетесь с правилами",
      "посещения «Дома Рождества», размещенными на сайте",
      "www.domrp.by и обязуетесь их соблюдать.",
    ],
    ["Телефон для справок: +375 (44) 738-33-33"],
    ["Организатор: ООО «РАЗМАН ПРОДАКШН», УНП 193659312"],
  ];
  return paragraphs
    .map((lines) => {
      const last = lines.length - 1;
      const rows = lines
        .map((t, i) => `<span class="${i < last ? "j" : "l"}">${t}</span>`)
        .join("");
      return `<p>${rows}</p>`;
    })
    .join("");
}

function sheetCss(): string {
  return `
    ${fontFace(400)}
    ${fontFace(700)}
    * { box-sizing: border-box; }
    @page { size: ${PRINT_SHEET_WIDTH}px ${PRINT_SHEET_HEIGHT}px; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${PRINT_SHEET_WIDTH}px; height: ${PRINT_SHEET_HEIGHT}px; background: #fff; }
    body {
      color: #000;
      font-family: "Cy Grotesk Grand", sans-serif;
      font-weight: 400;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet { position: relative; width: ${PRINT_SHEET_WIDTH}px; height: ${PRINT_SHEET_HEIGHT}px; overflow: hidden; background: #fff; }
    .abs { position: absolute; }
    .rel { position: relative; width: 100%; height: 100%; }
    .flexc { display: flex; align-items: center; justify-content: center; container-type: size; }
    .rot { flex: none; }
    .fill { display: block; position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; }
    .t { position: absolute; margin: 0; white-space: nowrap; line-height: normal; }
    .b { font-weight: 700; }
    .legal { position: absolute; left: 65px; top: 688px; width: 667px; font-size: 14px; line-height: normal; text-align: justify; }
    .legal p { margin: 0 0 4px; }
    .legal span { display: block; }
    .legal .j { text-align: justify; text-align-last: justify; }
    .legal .l { text-align: left; }
    .list { position: absolute; left: 65px; top: 317px; width: 734px; }
    .list .h { font-size: 24px; font-weight: 700; line-height: normal; margin: 0; white-space: nowrap; }
    .list ol { margin: 0; padding: 0; list-style: none; font-size: 16px; font-weight: 700; line-height: normal; }
    .qr-frame { position: absolute; left: 540px; top: 467px; width: 192px; height: 192px; background: #fff; border: 1px solid #000; border-radius: 18px; }
  `;
}

let cached: string | null = null;

/** HTML подложки: один раз на процесс (ассеты читаются с диска). */
export function buildPrintDomRozhdestvaSheetHtml(): string {
  if (cached) return cached;
  cached = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>${sheetCss()}</style>
</head>
<body>
  <div class="sheet">
    ${decor()}

    <!-- Логотип «Дом Рождества» -->
    <div class="abs" style="left:289px;top:35px;width:219px;height:122px;">
      <img class="fill" src="${assetDataUrl("logo.svg")}" alt="" />
    </div>
    <p class="t" style="left:301.53px;top:161.83px;width:206px;text-align:center;font-size:12.04px;line-height:7px;text-transform:uppercase;">BY RAZMAN PRODUCTION</p>
    <p class="t" style="left:63px;top:73px;font-size:32px;color:rgba(90,90,90,0.6);">0+</p>

    <!-- Заголовок -->
    <p class="t b" style="left:114px;top:211px;width:569px;text-align:center;font-size:26px;">Интерактивное пространство<br />«Дом Рождества»</p>

    <!-- Инструкция -->
    <div class="list">
      <p class="h">БИЛЕТ НЕОБХОДИМО АКТИВИРОВАТЬ:</p>
      <ol>
        <li>1. Перейти по qr-коду на билете</li>
        <li>2. Выбрать дату и время посещения выставки</li>
        <li>3. Ввести свои данные и нажать кнопку “ЗАРЕЗЕРВИРОВАТЬ”</li>
        <li>4. До встречи в Доме Рождества в выбраное Вами время!</li>
      </ol>
    </div>

    <!-- Поля билета -->
    <p class="t" style="left:65px;top:466px;font-size:16px;">тип билета</p>
    <p class="t" style="left:65px;top:531px;font-size:16px;">место проведения</p>
    <p class="t" style="left:64px;top:550px;font-size:0;"><span style="display:block;font-size:24px;font-weight:700;">Машерова 15/1,</span><span style="display:block;font-size:16px;font-weight:400;">вход со двора</span></p>
    <p class="t" style="left:65px;top:616px;font-size:16px;">уникальный номер билета</p>

    <!-- QR -->
    <div class="qr-frame"></div>

    <!-- Юридический текст -->
    <div class="legal">${legalParagraphs()}</div>

    <!-- Нижняя строка -->
    <p class="t" style="left:65px;top:1008px;font-size:16px;">порядковый номер</p>
    <p class="t" style="left:443px;top:1008px;font-size:16px;">уникальный номер билета</p>

    <!-- Логотипы -->
    <img class="abs" src="${assetDataUrl("dei-logo.png")}" alt="" style="left:64px;top:943px;width:188.41px;height:34px;filter:drop-shadow(0 0.625px 0.688px rgba(0,0,0,0.45));" />
    <img class="abs" src="${assetDataUrl("razman-logo.png")}" alt="" style="left:556px;top:943.85px;width:176px;height:26.98px;" />

    <!-- Серая ветка внизу по центру (маска) -->
    <div class="abs" style="left:271px;top:1020px;width:135px;height:78px;background:#a7a7a7;-webkit-mask:url(${assetDataUrl("grey-branch-mask.svg")}) 21px 10.496px / 114.149px 74.804px no-repeat;mask:url(${assetDataUrl("grey-branch-mask.svg")}) 21px 10.496px / 114.149px 74.804px no-repeat;"></div>
  </div>
</body>
</html>`;
  return cached;
}
