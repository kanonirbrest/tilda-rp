import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { AnketaForm } from "@/components/anketa-form";
import "./anketa.css";

const roboto = Roboto({
  subsets: ["latin", "cyrillic"],
  variable: "--anketa-sans",
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Анкета — DEI Tickets",
  description: "Контактная анкета DEI",
};

export default function AnketaPage() {
  return (
    <main className={`${roboto.variable} ${roboto.className} anketa-page`}>
      <div className="anketa-bg" aria-hidden>
        <span className="anketa-orb anketa-orb--a" />
        <span className="anketa-orb anketa-orb--b" />
      </div>
      <div className="anketa-shell">
        <header className="anketa-hero">
          <span className="anketa-brand">DEI</span>
          <span className="anketa-chip">Контактная анкета</span>
        </header>
        <div className="anketa-panel">
          <div className="anketa-panel__head">
            <span className="anketa-panel__icon" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
              </svg>
            </span>
            <div>
              <p className="anketa-overline">Будем на связи</p>
              <h1>Расскажите о себе</h1>
              <p className="anketa-lead">
                Оставьте контакты, чтобы получать новости о событиях и специальных предложениях.
              </p>
            </div>
          </div>
          <AnketaForm />
        </div>
      </div>
    </main>
  );
}
