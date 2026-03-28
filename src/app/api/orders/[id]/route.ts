import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { slot: true, ticket: true },
  });
  if (!order) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({
    status: order.status,
    slotTitle: order.slot.title,
    startsAt: order.slot.startsAt.toISOString(),
    ticketToken: order.ticket?.publicToken ?? null,
  });
}
