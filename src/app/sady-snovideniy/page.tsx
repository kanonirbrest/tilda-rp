import { GardensTicketsPage } from "@/components/gardens-tickets-page";
import { GARDENS_PERFORMANCE_JULY_6 } from "@/lib/gardens-of-dreams/schedule";

export default function SadySnovideniyPage() {
  return <GardensTicketsPage eventDate={GARDENS_PERFORMANCE_JULY_6.date} />;
}
