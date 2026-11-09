import { createHash } from "node:crypto";
import { buildDomRozhdestvaShellHtml, buildDomRozhdestvaTicketHtml } from "./ticket-html-dom-rozhdestva";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";
import type { DomShellLayout } from "./ticket-pdf-dom-rozhdestva-layout";

/**
 * Снять координаты переменных полей так, как их раскладывает Chromium.
 * Строка, а не функция: сборщик иначе вставляет хелпер, которого нет в странице.
 */
const MEASURE_LAYOUT = `(async () => {
  await document.fonts.ready;
  await document.fonts.load('700 24px "Cy Grotesk Grand"');
  await document.fonts.load('400 16px "Cy Grotesk Grand"');
  function explicitWidth(el) {
    let found = null;
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules) {
        if (!rule.selectorText || !rule.style || !rule.style.width) continue;
        if (el.matches(rule.selectorText)) found = parseFloat(rule.style.width);
      }
    }
    return Number.isFinite(found) ? found : null;
  }
  function measure(selector) {
    const el = document.querySelector(selector);
    const cs = getComputedStyle(el);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = cs.fontWeight + " " + cs.fontSize + ' "Cy Grotesk Grand"';
    const metrics = ctx.measureText("Hg");
    const weight = parseInt(cs.fontWeight, 10);
    const centered = cs.textAlign === "center" || (cs.transform && cs.transform !== "none");
    return {
      x: parseFloat(cs.left),
      baseline: parseFloat(cs.top) + metrics.fontBoundingBoxAscent,
      size: parseFloat(cs.fontSize),
      weight: weight >= 600 ? 700 : 400,
      align: centered ? "center" : "left",
      maxWidth: explicitWidth(el),
    };
  }
  const sheet = document.querySelector(".sheet");
  const sheetRect = sheet.getBoundingClientRect();
  const qr = document.querySelector(".qr-frame img").getBoundingClientRect();
  return {
    cssWidth: sheet.offsetWidth,
    cssHeight: sheet.offsetHeight,
    fields: {
      date: measure(".value-date"),
      time: measure(".value-time"),
      type: measure(".value-type"),
      price: measure(".value-price"),
      order: measure(".value-order"),
    },
    qr: {
      x: qr.left - sheetRect.left,
      y: qr.top - sheetRect.top,
      size: qr.width,
    },
  };
})()`;

/** Подложка и координаты полей. Вызывается при сборке образа и если файла ещё нет. */
export async function buildDomRozhdestvaShellAssets(): Promise<{
  hash: string;
  pdf: Uint8Array;
  layout: DomShellLayout;
}> {
  const shellHtml = await buildDomRozhdestvaShellHtml();
  const hash = createHash("sha256").update(shellHtml).digest("hex");
  const sampleHtml = await buildDomRozhdestvaTicketHtml({
    title: "Дом Рождества",
    startsAt: new Date("2026-12-10T10:00:00+03:00"),
    slotKind: DOM_ROZHDESTVA_SLOT_KIND,
    amountCents: 45_00,
    currency: "BYN",
    orderId: "CLXXXXXXXXXXXXXXXXXXXX",
    qrUrl: "https://dei.by/staff/quick?t=LAYOUT",
    ticketTierLabel: "Единый",
    admissionCount: 1,
  });

  const { renderHtmlToPdfBuffer, withChromiumPage } = await import("./ticket-pdf-playwright");
  const layout = await withChromiumPage(async (page) => {
    await page.emulateMedia({ media: "screen" });
    await page.setContent(sampleHtml, { waitUntil: "load", timeout: 45_000 });
    return page.evaluate(MEASURE_LAYOUT) as Promise<DomShellLayout>;
  });
  const pdf = await renderHtmlToPdfBuffer(shellHtml);
  return { hash, pdf, layout };
}
