const DEFAULT_PRODUCTION_APP_BASE = "https://dei-tickets.onrender.com";

/** Публичный URL прода (Render / APP_BASE_URL на проде). */
export function getProductionAppBaseUrl(): string {
  const fromEnv =
    process.env.PRODUCTION_APP_BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "";
  if (fromEnv && !isLocalAppUrl(fromEnv)) {
    return fromEnv.replace(/\/$/, "");
  }
  return DEFAULT_PRODUCTION_APP_BASE;
}

function isLocalAppUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/** Прокси /api/public/* на прод в next dev, если локальная БД не подключена к проду. */
export function shouldProxyPublicApiToProduction(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.USE_LOCAL_PUBLIC_API?.trim().toLowerCase() === "true") return false;
  if (process.env.PRODUCTION_DATABASE_URL?.trim()) return false;
  return true;
}
