import { NextResponse } from "next/server";
import { z } from "zod";
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
import { findTicketByScannedToken, isPrintTicketAwaitingRegistration } from "@/lib/print-tickets";

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

  const ticket = await findTicketByScannedToken(parsed.data.token);

  if (!ticket) {
    return NextResponse.json({ found: false });
  }

  if (!ticket.order || isPrintTicketAwaitingRegistration(ticket)) {
    return NextResponse.json({
      found: true,
      paid: false,
      notRegistered: ticket.source === "PRINT",
      refunded: Boolean(ticket.refundedAt),
      used: Boolean(ticket.usedAt),
      usedAt: ticket.usedAt != null ? formatDisplayDateTime(ticket.usedAt.toISOString()) : null,
      giftOpenDate: false,
      sessionToday: false,
      sessionDate: "",
      todayDate: "",
      dayError: null,
      customerName: ticket.source === "PRINT" ? "Печатный билет" : "",
      email: "",
      phone: "",
      slotTitle: ticket.source === "PRINT" ? "Сначала регистрация по QR" : "",
      startsAt: "",
      amountCents: 0,
      amountDisplay: "",
      currency: "BYN",
      orderId: "",
      admissionCount: ticket.admissionCount,
    });
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
