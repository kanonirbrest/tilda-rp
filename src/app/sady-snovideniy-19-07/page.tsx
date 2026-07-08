import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_JULY_19_1700 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy1907Page() {
  return (
    <GardensTicketsPage
      eventDate={GARDENS_PERFORMANCE_JULY_19_1700.date}
      eventTime={GARDENS_PERFORMANCE_JULY_19_1700.time}
    />
  );
}
