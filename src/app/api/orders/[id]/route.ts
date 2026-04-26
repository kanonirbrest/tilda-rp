import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      slot: true,
      tickets: { orderBy: { createdAt: "asc" }, select: { publicToken: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const ticketTokens = order.tickets.map((t) => t.publicToken);
  return NextResponse.json({
    status: order.status,
    slotTitle: order.slot.title,
    startsAt: order.slot.startsAt.toISOString(),
    ticketToken: ticketTokens[0] ?? null,
    ticketTokens,
  });
}
