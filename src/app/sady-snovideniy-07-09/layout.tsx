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
  title: "Сады сновидений — 7 сентября — билеты",
  description:
    "Иммерсивная танцевальная мистерия «Сады сновидений», 7 сентября 2026, вход 18:30, шоу 20:00. Выбор мест на схеме зала.",
};

export default function SadySnovideniy0709Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${inter.variable} ${inter.className} god-root`}>{children}</div>
  );
}
