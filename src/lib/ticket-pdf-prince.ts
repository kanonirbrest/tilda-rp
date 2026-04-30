import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Prince XML — отдельный движок HTML/CSS → PDF (лучше типографика/разбиение, чем «печать» Chromium).
 * Нужен установленный бинарник: https://www.princexml.com/
 * Путь: переменная `PRINCE_BIN` или команда `prince` в PATH.
 */
export function renderHtmlToPdfWithPrince(html: string): Uint8Array {
  const dir = join(tmpdir(), `dei-ticket-prince-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const htmlPath = join(dir, "ticket.html");
  const pdfPath = join(dir, "ticket.pdf");
  writeFileSync(htmlPath, html, "utf8");

  const princeBin = process.env.PRINCE_BIN?.trim() || "prince";

  try {
    execFileSync(princeBin, [htmlPath, "-o", pdfPath], {
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `Не удалось запустить Prince (${princeBin}). Установите Prince XML и задайте PRINCE_BIN или PATH. ` +
        `См. https://www.princexml.com/ — либо используйте TICKET_PDF_RENDERER=playwright.`,
      { cause: e },
    );
  }

  const pdfBytes = readFileSync(pdfPath);
  rmSync(dir, { recursive: true, force: true });
  return new Uint8Array(pdfBytes);
}
