import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStaffFromCookies } from "@/lib/auth-staff";
import { sendCrmWebhook } from "@/lib/crm";

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

  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { publicToken: parsed.data.token },
      include: { order: { include: { customer: true, slot: true } } },
    });
    if (!ticket) {
      return { type: "NOT_FOUND" as const };
    }
    if (ticket.order.status !== "PAID") {
      return { type: "NOT_PAID" as const };
    }
    if (ticket.usedAt) {
      return {
        type: "ALREADY_USED" as const,
        usedAt: ticket.usedAt.toISOString(),
      };
    }

    await tx.ticket.update({
      where: { id: ticket.id },
      data: { usedAt: new Date(), usedById: staff.id },
    });

    return {
      type: "OK" as const,
      ticket,
    };
  });

  if (result.type === "NOT_FOUND") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (result.type === "NOT_PAID") {
    return NextResponse.json({ error: "NOT_PAID" }, { status: 400 });
  }
  if (result.type === "ALREADY_USED") {
    return NextResponse.json({ error: "ALREADY_USED", usedAt: result.usedAt }, { status: 409 });
  }

  const t = result.ticket;
  try {
    await sendCrmWebhook({
      event: "ticket_used",
      customerName: t.order.customer.name,
      email: t.order.customer.email,
      phone: t.order.customer.phone,
      amountCents: t.order.amountCents,
      currency: t.order.currency,
      orderId: t.order.id,
      ticketToken: t.publicToken,
      slotTitle: t.order.slot.title,
      slotStartsAt: t.order.slot.startsAt.toISOString(),
      usedAt: new Date().toISOString(),
      admissionCount: t.admissionCount,
    });
  } catch (e) {
    console.error("CRM ticket_used", e);
  }

  return NextResponse.json({ ok: true });
}
