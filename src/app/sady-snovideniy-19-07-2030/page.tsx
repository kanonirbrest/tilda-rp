import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_JULY_19_2030 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy19072030Page() {
  return (
    <GardensTicketsPage
      eventDate={GARDENS_PERFORMANCE_JULY_19_2030.date}
      eventTime={GARDENS_PERFORMANCE_JULY_19_2030.time}
    />
  );
}
