import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStaffFromCookies } from "@/lib/auth-staff";
import { formatMinorUnits } from "@/lib/money";

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

  return NextResponse.json({
    found: true,
    paid: ticket.order.status === "PAID",
    used: Boolean(ticket.usedAt),
    usedAt: ticket.usedAt?.toISOString() ?? null,
    customerName: ticket.order.customer.name,
    email: ticket.order.customer.email,
    phone: ticket.order.customer.phone,
    slotTitle: ticket.order.slot.title,
    startsAt: ticket.order.slot.startsAt.toISOString(),
    amountCents: ticket.order.amountCents,
    amountDisplay: formatMinorUnits(ticket.order.amountCents, ticket.order.currency),
    currency: ticket.order.currency,
    orderId: ticket.order.id,
    admissionCount: ticket.admissionCount,
  });
}
