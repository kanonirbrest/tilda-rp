/** Публичный URL сайта: APP_BASE_URL или (на Render) RENDER_EXTERNAL_URL. */
export function getPublicAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) return render.replace(/\/$/, "");
  return "http://localhost:3000";
}

/** Публичный base URL из заголовков запроса (за прокси — x-forwarded-*). */
export function getRequestOrigin(req: Request): string {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim();
  if (!host) {
    return getPublicAppBaseUrl();
  }
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local =
    host.startsWith("127.") ||
    host.startsWith("localhost") ||
    host.startsWith("[::1]");
  const proto = forwardedProto || (local ? "http" : "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}
