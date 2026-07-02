import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../nightofmuseums/nightofmuseums.css";
import "../buy-tickets-smr/buy-tickets-smr.css";
import "./belye-nochi-18.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--nom-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Белые ночи 18+ — билеты",
  description:
    "11 июля — вечеринка «Белые ночи» R&B 2000-х на «Небо.Река». DJ Kira Miller & Bazhen, dress code white only. Билеты 60 BYN.",
  openGraph: {
    title: "Белые ночи 18+ — билеты",
    description: "R&B 2000-х, 11 июля, 22:00–03:00. Dress code: white only.",
    images: [{ url: "/belye-nochi-18/poster.png", width: 720, height: 1018, alt: "Белые ночи" }],
  },
};

export default function BelyeNochi18Layout({
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
