import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_JULY_20 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy2007Page() {
  return <GardensTicketsPage eventDate={GARDENS_PERFORMANCE_JULY_20.date} />;
}
