import type { ProxyOptions } from "vite";
import { defineConfig, loadEnv } from "vite";

/** GitHub Pages (project site): задайте VITE_BASE_PATH=/имя-репоз/ при сборке */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim() || "http://127.0.0.1:3000";

  const apiProxy: Record<string, string | ProxyOptions> = {
    "/api": {
      target: proxyTarget,
      changeOrigin: true,
      configure(proxy) {
        proxy.on("error", (err) => {
          console.error(
            `[admin-ui] Прокси /api → ${proxyTarget}: ${err.message}. Запущен ли Next.js? Порт совпадает с VITE_DEV_PROXY_TARGET?`,
          );
        });
      },
    },
  };

  return {
    base: env.VITE_BASE_PATH || "/",
    server: {
      proxy: apiProxy,
    },
    /** Иначе `npm run preview` отдаёт 502 на /api — туда не попадает dev-сервер */
    preview: {
      proxy: apiProxy,
    },
  };
});
