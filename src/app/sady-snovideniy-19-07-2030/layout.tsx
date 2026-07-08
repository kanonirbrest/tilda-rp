import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../sady-snovideniy/sady-snovideniy.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--god-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Сады сновидений — 19 июля, 20:30 — билеты",
  description:
    "Иммерсивная танцевальная мистерия «Сады сновидений», 19 июля 2026, вход 19:00, шоу 20:30. Выбор мест на схеме зала.",
};

export default function SadySnovideniy19072030Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${inter.variable} ${inter.className} god-root`}>{children}</div>
  );
}
