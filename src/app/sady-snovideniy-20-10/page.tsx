import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_OCTOBER_20 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy2010Page() {
  return (
    <GardensTicketsPage
      eventDate={GARDENS_PERFORMANCE_OCTOBER_20.date}
      eventTime={GARDENS_PERFORMANCE_OCTOBER_20.time}
    />
  );
}
