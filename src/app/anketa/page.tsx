import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { AnketaForm } from "@/components/anketa-form";
import "./anketa.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--anketa-sans",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--anketa-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Анкета — DEI Tickets",
  description: "Оставьте контакты: фамилия, имя, телефон и email.",
};

export default function AnketaPage() {
  return (
    <main className={`${manrope.variable} ${syne.variable} ${manrope.className} anketa-page`}>
      <div className="anketa-shell">
        <p className="anketa-brand">DEI</p>
        <p className="anketa-lead">Оставьте контакты — фамилия, имя, телефон и email.</p>
        <div className="anketa-card">
          <AnketaForm />
        </div>
      </div>
    </main>
  );
}
