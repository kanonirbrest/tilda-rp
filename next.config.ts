import type { NextConfig } from "next";
import {
  getProductionAppBaseUrl,
  shouldProxyPublicApiToProduction,
} from "./src/lib/production-app-base";

/**
 * HMR (webpack-hmr / turbopack) по IP в LAN: иначе Next блокирует WebSocket как cross-origin.
 * Берём хост из APP_BASE_URL или из ALLOWED_DEV_ORIGINS (через запятую).
 */
function allowedDevOriginsFromEnv(): string[] {
  const manual = process.env.ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (manual.length) return manual;
  const base = process.env.APP_BASE_URL;
  if (!base) return [];
  try {
    const { hostname } = new URL(base);
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return [hostname];
    }
  } catch {
    /* ignore */
  }
  return [];
}

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: allowedDevOriginsFromEnv(),
  /** В `next dev` не показывать меню в углу (Route / Bundler / Preferences). На прод не влияет. */
  devIndicators: false,
  /** С Тильды и старых ссылок часто ведут на `/tickets`, а приложение — `/buy-tickets`. */
  async redirects() {
    return [{ source: "/tickets", destination: "/buy-tickets", permanent: true }];
  },
  /**
   * Билеты — полный HTML Тильды из `public/` без iframe (высота = документ).
   * beforeFiles: раньше матчинга App Router, иначе сработал бы пустой сегмент.
   */
  async rewrites() {
    const publicApiProxy = shouldProxyPublicApiToProduction() ?
      [
        {
          source: "/api/public/:path*",
          destination: `${getProductionAppBaseUrl()}/api/public/:path*`,
        },
      ]
    : [];

    return {
      beforeFiles: [
        ...publicApiProxy,
        { source: "/buy-tickets", destination: "/buy-tickets/calendar.html" },
        { source: "/buy-tickets/select", destination: "/buy-tickets/slot.html" },
        { source: "/buy-tickets-summer", destination: "/buy-tickets-summer/calendar.html" },
        {
          source: "/buy-tickets-summer/select",
          destination: "/buy-tickets-summer/slot.html",
        },
      ],
    };
  },
};

export default nextConfig;
