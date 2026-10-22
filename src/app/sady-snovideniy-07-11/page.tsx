import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_NOVEMBER_7 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy0711Page() {
  return (
    <GardensTicketsPage
      eventDate={GARDENS_PERFORMANCE_NOVEMBER_7.date}
      eventTime={GARDENS_PERFORMANCE_NOVEMBER_7.time}
    />
  );
}
