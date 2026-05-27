import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../nightofmuseums/nightofmuseums.css";
import "./buy-tickets-smr.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--nom-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Билеты",
  description: "Купить билет на выставку Небо.Река",
};

export default function BuyTicketsSmrLayout({
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
