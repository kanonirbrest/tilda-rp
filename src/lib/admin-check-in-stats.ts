import { prisma } from "@/lib/prisma";
import { paidActiveTicketsWhereForDay } from "@/lib/admin-day-ticket-filter";
import {
  dateKeyInTz,
  getExhibitionTimezone,
  timeKeyInTz,
  wallDayUtcRange,
} from "@/lib/exhibition-time";

export type CheckInStatsStatus = "all" | "checked_in" | "not_checked_in";

export type CheckInStatsBySlot = {
  slotId: string;
  title: string;
  timeKey: string;
  ticketsTotal: number;
  ticketsCheckedIn: number;
  ticketsNotCheckedIn: number;
  peopleTotal: number;
  peopleCheckedIn: number;
  peopleNotCheckedIn: number;
};

export type CheckInStatsResult = {
  timezone: string;
  date: string;
  slotId: string | null;
  status: CheckInStatsStatus;
  ticketsTotal: number;
  ticketsCheckedIn: number;
  ticketsNotCheckedIn: number;
  peopleTotal: number;
  peopleCheckedIn: number;
  peopleNotCheckedIn: number;
  /** Билеты по выбранному фильтру status. */
  countTickets: number;
  /** Люди (admissionCount) по выбранному фильтру status. */
  countPeople: number;
  bySlot: CheckInStatsBySlot[];
};

type TicketRow = {
  usedAt: Date | null;
  admissionCount: number;
  order: {
    slotId: string;
    slot: { title: string; startsAt: Date };
  };
};

function accumulateSlot(
  map: Map<string, CheckInStatsBySlot & { startsAt: Date }>,
  t: TicketRow,
  checked: boolean,
) {
  const sid = t.order.slotId;
  let row = map.get(sid);
  if (!row) {
    row = {
      slotId: sid,
      title: t.order.slot.title,
      timeKey: "",
      startsAt: t.order.slot.startsAt,
      ticketsTotal: 0,
      ticketsCheckedIn: 0,
      ticketsNotCheckedIn: 0,
      peopleTotal: 0,
      peopleCheckedIn: 0,
      peopleNotCheckedIn: 0,
    };
    map.set(sid, row);
  }
  row.ticketsTotal += 1;
  row.peopleTotal += t.admissionCount;
  if (checked) {
    row.ticketsCheckedIn += 1;
    row.peopleCheckedIn += t.admissionCount;
  } else {
    row.ticketsNotCheckedIn += 1;
    row.peopleNotCheckedIn += t.admissionCount;
  }
}

export async function queryCheckInStats(params: {
  dateYmd: string;
  slotId?: string | null;
  status?: CheckInStatsStatus;
}): Promise<CheckInStatsResult | { error: "INVALID_DATE" }> {
  const tz = getExhibitionTimezone();
  const range = wallDayUtcRange(params.dateYmd, tz);
  if (!range) return { error: "INVALID_DATE" };

  const status: CheckInStatsStatus = params.status ?? "all";
  const slotId = params.slotId?.trim() || null;
  const baseWhere = paidActiveTicketsWhereForDay(range, slotId);

  const tickets = await prisma.ticket.findMany({
    where: baseWhere,
    select: {
      usedAt: true,
      admissionCount: true,
      order: {
        select: {
          slotId: true,
          slot: { select: { title: true, startsAt: true } },
        },
      },
    },
  });

  let ticketsTotal = 0;
  let ticketsCheckedIn = 0;
  let peopleTotal = 0;
  let peopleCheckedIn = 0;
  const slotMap = new Map<string, CheckInStatsBySlot & { startsAt: Date }>();

  for (const t of tickets) {
    const checked = t.usedAt != null;
    ticketsTotal += 1;
    peopleTotal += t.admissionCount;
    if (checked) {
      ticketsCheckedIn += 1;
      peopleCheckedIn += t.admissionCount;
    }
    if (!slotId) accumulateSlot(slotMap, t, checked);
  }

  const ticketsNotCheckedIn = ticketsTotal - ticketsCheckedIn;
  const peopleNotCheckedIn = peopleTotal - peopleCheckedIn;

  let countTickets = ticketsTotal;
  let countPeople = peopleTotal;
  if (status === "checked_in") {
    countTickets = ticketsCheckedIn;
    countPeople = peopleCheckedIn;
  } else if (status === "not_checked_in") {
    countTickets = ticketsNotCheckedIn;
    countPeople = peopleNotCheckedIn;
  }

  const bySlot = [...slotMap.values()]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((row) => ({
      slotId: row.slotId,
      title: row.title,
      timeKey: timeKeyInTz(row.startsAt, tz),
      ticketsTotal: row.ticketsTotal,
      ticketsCheckedIn: row.ticketsCheckedIn,
      ticketsNotCheckedIn: row.ticketsNotCheckedIn,
      peopleTotal: row.peopleTotal,
      peopleCheckedIn: row.peopleCheckedIn,
      peopleNotCheckedIn: row.peopleNotCheckedIn,
    }));

  return {
    timezone: tz,
    date: params.dateYmd,
    slotId,
    status,
    ticketsTotal,
    ticketsCheckedIn,
    ticketsNotCheckedIn,
    peopleTotal,
    peopleCheckedIn,
    peopleNotCheckedIn,
    countTickets,
    countPeople,
    bySlot,
  };
}

/** dateKey слота в TZ выставки (для сверки с UI). */
export function slotDateKeyInExhibitionTz(startsAt: Date): string {
  return dateKeyInTz(startsAt, getExhibitionTimezone());
}
