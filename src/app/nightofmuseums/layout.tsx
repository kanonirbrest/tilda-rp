import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./nightofmuseums.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
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
