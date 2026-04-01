import { defineConfig } from "vite";

/** GitHub Pages (project site): задайте VITE_BASE_PATH=/имя-репоз/ при сборке */
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
});
