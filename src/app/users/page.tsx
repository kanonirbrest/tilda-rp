import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { UsersDirectory } from "@/components/users-directory";
import "./users.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--users-sans",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--users-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Пользователи — DEI Tickets",
  description: "Список пользователей из базы покупателей",
  robots: { index: false, follow: false },
};

export default function UsersPage() {
  return (
    <div className={`${manrope.variable} ${syne.variable} ${manrope.className}`}>
      <UsersDirectory />
    </div>
  );
}
