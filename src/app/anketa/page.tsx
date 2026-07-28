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
  description: "Контактная анкета DEI",
};

export default function AnketaPage() {
  return (
    <main className={`${manrope.variable} ${syne.variable} ${manrope.className} anketa-page`}>
      <div className="anketa-bg" aria-hidden>
        <span className="anketa-orb anketa-orb--a" />
        <span className="anketa-orb anketa-orb--b" />
        <span className="anketa-grid-fade" />
      </div>
      <div className="anketa-shell">
        <header className="anketa-hero">
          <p className="anketa-brand">DEI</p>
        </header>
        <div className="anketa-panel">
          <AnketaForm />
        </div>
      </div>
    </main>
  );
}
