import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./nightofmuseums.css";

/** Как на buy-tickets: Inter + вес 200 для полей/stepper (см. .dei-plain-checkout в slot.html). */
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["200", "300", "400", "500", "600", "700"],
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
    <>
      {/* Те же базовые стили полей, что в попапе buy-tickets (Tilda Forms). */}
      <link rel="stylesheet" href="https://static.tildacdn.biz/css/tilda-forms-1.0.min.css" />
      <div
        className={`${inter.variable} ${inter.className} min-h-full flex-1 bg-transparent nom-tilda-root`}
      >
        {children}
      </div>
    </>
  );
}
