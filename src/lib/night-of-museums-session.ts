import { NIGHT_OF_MUSEUMS_SLOT_KIND } from "@/lib/slot-kind";
import {
  formatEventSessionRangeForUi,
  parseEventSessionTimeRangeFromTitle,
} from "@/lib/event-session-title";

/** @deprecated Используйте `parseEventSessionTimeRangeFromTitle(title, NIGHT_OF_MUSEUMS_SLOT_KIND)`. */
export function parseNightOfMuseumsTimeRangeFromTitle(title: string): string | null {
  return parseEventSessionTimeRangeFromTitle(title, NIGHT_OF_MUSEUMS_SLOT_KIND);
}

/** @deprecated Используйте `formatEventSessionRangeForUi`. */
export function formatNightSessionRangeForUi(raw: string): string {
  return formatEventSessionRangeForUi(raw);
}
