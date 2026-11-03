import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStaffFromCookies } from "@/lib/auth-staff";
import { formatMinorUnits } from "@/lib/money";
import { formatDisplayDateTime } from "@/lib/format-display-datetime";
import {
  dateKeyInTz,
  formatDateKeyRu,
  getExhibitionTimezone,
  sessionDayMismatchMessage,
} from "@/lib/exhibition-time";
import { isNeboGiftOpenDateSlot } from "@/lib/nebo-reka/ensure-gift-slot";
import { isTicketCheckInDayOpen } from "@/lib/ticket-check-in-day";

const schema = z.object({
  token: z.string().min(10).max(200),
});

export async function POST(req: Request) {
  const staff = await getStaffFromCookies();
  if (!staff) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION" }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { publicToken: parsed.data.token },
    include: {
      order: { include: { customer: true, slot: true } },
    },
  });

  if (!ticket) {
    return NextResponse.json({ found: false });
  }

  const paid = ticket.order.status === "PAID" && ticket.refundedAt == null;
  const giftOpenDate = isNeboGiftOpenDateSlot(ticket.order.slot);
  const tz = getExhibitionTimezone();
  const sessionDate = formatDateKeyRu(dateKeyInTz(ticket.order.slot.startsAt, tz));
  const todayDate = formatDateKeyRu(dateKeyInTz(new Date(), tz));
  const sessionToday = giftOpenDate || isTicketCheckInDayOpen(ticket.order.slot);
  return NextResponse.json({
    found: true,
    paid,
    refunded: Boolean(ticket.refundedAt) || ticket.order.status === "REFUNDED",
    used: Boolean(ticket.usedAt),
    usedAt: ticket.usedAt != null ? formatDisplayDateTime(ticket.usedAt.toISOString()) : null,
    giftOpenDate,
    sessionToday,
    sessionDate,
    todayDate,
    dayError: sessionToday ? null : sessionDayMismatchMessage(sessionDate, todayDate),
    customerName: ticket.order.customer.name,
    email: ticket.order.customer.email,
    phone: ticket.order.customer.phone,
    slotTitle: ticket.order.slot.title,
    startsAt: formatDisplayDateTime(ticket.order.slot.startsAt.toISOString()),
    amountCents: ticket.order.amountCents,
    amountDisplay: formatMinorUnits(ticket.order.amountCents, ticket.order.currency),
    currency: ticket.order.currency,
    orderId: ticket.order.id,
    admissionCount: ticket.admissionCount,
  });
}
