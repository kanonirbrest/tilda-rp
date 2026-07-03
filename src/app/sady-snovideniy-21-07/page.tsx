import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_JULY_21 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniy2107Page() {
  return <GardensTicketsPage eventDate={GARDENS_PERFORMANCE_JULY_21.date} />;
}
