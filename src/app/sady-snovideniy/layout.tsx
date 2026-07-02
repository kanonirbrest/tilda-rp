import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./sady-snovideniy.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--god-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Сады сновидений — билеты",
  description:
    "6 июля — премьера иммерсивной танцевальной мистерии «Сады сновидений» на выставке «Небо.Река». Билеты от 90 BYN, выбор мест на схеме.",
  openGraph: {
    title: "Сады сновидений — билеты",
    description:
      "6 июля — иммерсивная танцевальная мистерия на «Небо.Река». Вход на выставку 18:30, шоу в 20:00.",
    images: [{ url: "/sady-snovideniy/poster.png", width: 720, height: 1018, alt: "Сады сновидений" }],
  },
};

export default function SadySnovideniyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${inter.variable} ${inter.className} god-root`}>{children}</div>
  );
}
