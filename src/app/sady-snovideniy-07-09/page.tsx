import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_SEPTEMBER_7 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy0709Page() {
  return (
    <GardensTicketsPage
      eventDate={GARDENS_PERFORMANCE_SEPTEMBER_7.date}
      eventTime={GARDENS_PERFORMANCE_SEPTEMBER_7.time}
    />
  );
}
