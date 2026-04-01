import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";

/** Абсолютный URL для редиректа (тот же base, что и для createOrderCheckout callbacks). */
export function absoluteRedirectFromRequest(req: Request, pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const base = getRequestOrigin(req);
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function payHtmlError(status: number, message: string): NextResponse {
  const esc = escapeHtml(message);
  const body = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>Ошибка</title></head><body style="font-family:system-ui,sans-serif;padding:1.5rem;max-width:32rem"><p>${esc}</p><p><a href="/tickets">К билетам</a></p></body></html>`;
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
