import type { Metadata } from "next";
import { VivaldiTicketsPage } from "@/components/vivaldi-tickets-page";
import { buildVivaldiSeatMap } from "@/lib/vivaldi/seat-map";
import {
  formatVivaldiPerformanceTitle,
  VIVALDI_PERFORMANCE_OCTOBER_13,
} from "@/lib/vivaldi/schedule";

export const metadata: Metadata = {
  title: "Времена года. Антонио Вивальди — 13 октября — билеты",
  description: "Времена года. Антонио Вивальди, 13 октября 2026, 20:00. Выбор мест и покупка билетов.",
};

export default function KoncertVivaldiPage() {
  const show = VIVALDI_PERFORMANCE_OCTOBER_13;
  return (
    <VivaldiTicketsPage
      initialSeats={buildVivaldiSeatMap(show.date)}
      date={show.date}
      time={show.time}
      title={formatVivaldiPerformanceTitle(show)}
      volumeDiscount={show.volumeDiscount}
    />
  );
}
