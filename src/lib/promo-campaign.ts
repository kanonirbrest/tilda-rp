import { DateTime } from "luxon";
import { EXHIBITION_TIMEZONE_DEFAULT, getExhibitionTimezone } from "@/lib/exhibition-time";

const DEFAULT_CAMPAIGN_UNTIL = "01.07.2026";

/** Конец акции включительно (Europe/Minsk), из PROMO_CAMPAIGN_VALID_UNTIL или 01.07.2026. */
export function promoCampaignValidUntilRaw(): string {
  return process.env.PROMO_CAMPAIGN_VALID_UNTIL?.trim() || DEFAULT_CAMPAIGN_UNTIL;
}

function campaignEndDateTime(raw: string): DateTime | null {
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const tz = getExhibitionTimezone() || EXHIBITION_TIMEZONE_DEFAULT;
  const end = DateTime.fromObject(
    { year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 },
    { zone: tz },
  );
  return end.isValid ? end : null;
}

export function isPromoCampaignExpired(now = new Date()): boolean {
  const end = campaignEndDateTime(promoCampaignValidUntilRaw());
  if (!end) return false;
  const tz = getExhibitionTimezone() || EXHIBITION_TIMEZONE_DEFAULT;
  return DateTime.fromJSDate(now, { zone: tz }) > end;
}

export function promoCampaignValidUntilDate(): Date | null {
  return campaignEndDateTime(promoCampaignValidUntilRaw())?.toJSDate() ?? null;
}
