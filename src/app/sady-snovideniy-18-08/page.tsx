import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_AUGUST_18 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy1808Page() {
  return (
    <GardensTicketsPage
      eventDate={GARDENS_PERFORMANCE_AUGUST_18.date}
      eventTime={GARDENS_PERFORMANCE_AUGUST_18.time}
    />
  );
}
