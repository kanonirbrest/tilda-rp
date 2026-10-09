import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../sady-snovideniy/sady-snovideniy.css";
import "./vivaldi.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--god-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Времена года. Антонио Вивальди — билеты",
  description: "Времена года. Антонио Вивальди. Выбор мест и покупка билетов.",
};

export default function KoncertVivaldiLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className={`${inter.variable} ${inter.className} god-root`}>{children}</div>;
}
