import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_SEPTEMBER_8 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy0809Page() {
  return (
    <GardensTicketsPage
      eventDate={GARDENS_PERFORMANCE_SEPTEMBER_8.date}
      eventTime={GARDENS_PERFORMANCE_SEPTEMBER_8.time}
    />
  );
}
