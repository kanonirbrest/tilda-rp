import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../nightofmuseums/nightofmuseums.css";
import "../buy-tickets-smr/buy-tickets-smr.css";
import "../dom-rozhdestva/dom-rozhdestva.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--nom-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Регистрация билета — Дом Рождества",
  description: "Выберите дату и время посещения «Дома Рождества» по печатному билету",
};

export default function PrintRegisterLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <link rel="stylesheet" href="https://static.tildacdn.biz/css/tilda-forms-1.0.min.css" />
      <div className={`${inter.variable} ${inter.className} nom-tilda-root`}>{children}</div>
    </>
  );
}
