import { defineConfig, loadEnv } from "vite";

/** GitHub Pages (project site): задайте VITE_BASE_PATH=/имя-репоз/ при сборке */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim() || "http://127.0.0.1:3000";

  return {
    base: env.VITE_BASE_PATH || "/",
    server: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
