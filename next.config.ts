import type { NextConfig } from "next";

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
};

export default nextConfig;
