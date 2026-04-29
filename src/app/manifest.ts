import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DEI Tickets Staff Scanner",
    short_name: "DEI Scan",
    description: "Сканер QR для персонала: быстрая проверка билетов.",
    start_url: "/staff/scan",
    scope: "/staff/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#18181b",
    lang: "ru",
    icons: [
      {
        src: "/staff/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
