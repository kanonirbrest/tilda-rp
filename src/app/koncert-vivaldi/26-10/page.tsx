import type { Metadata } from "next";
import { VivaldiTicketsPage } from "@/components/vivaldi-tickets-page";
import { buildVivaldiSeatMap } from "@/lib/vivaldi/seat-map";
import {
  formatVivaldiPerformanceTitle,
  VIVALDI_PERFORMANCE_OCTOBER_26,
} from "@/lib/vivaldi/schedule";

export const metadata: Metadata = {
  title: "Времена года. Антонио Вивальди — 26 октября — билеты",
  description: "Времена года. Антонио Вивальди, 26 октября 2026, 20:00. Выбор мест и покупка билетов.",
};

export default function KoncertVivaldiOctober26Page() {
  const show = VIVALDI_PERFORMANCE_OCTOBER_26;
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
