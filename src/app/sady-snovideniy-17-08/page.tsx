import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_AUGUST_17 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy1708Page() {
  return (
    <GardensTicketsPage
      eventDate={GARDENS_PERFORMANCE_AUGUST_17.date}
      eventTime={GARDENS_PERFORMANCE_AUGUST_17.time}
    />
  );
}
