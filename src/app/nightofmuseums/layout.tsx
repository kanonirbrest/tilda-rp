import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./nightofmuseums.css";

/** Те же начертания Inter, что на buy-tickets (public/buy-tickets/slot.html → Google Fonts Inter 300–700). */
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--nom-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ночь музеев — билеты",
  description: "Оформление билетов на Ночь музеев",
};

export default function NightOfMuseumsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${inter.variable} ${inter.className} min-h-full flex-1 bg-transparent`}>{children}</div>
  );
}
