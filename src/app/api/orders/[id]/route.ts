import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDisplayDateTime } from "@/lib/format-display-datetime";
import { dateKeyInTz, getExhibitionTimezone, timeKeyInTz } from "@/lib/exhibition-time";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      slot: true,
      lines: true,
      tickets: {
        orderBy: { createdAt: "asc" },
        where: { refundedAt: null },
        select: { publicToken: true },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const ticketTokens = order.tickets.map((t) => t.publicToken);
  const tz = getExhibitionTimezone();
  let adult = 0;
  let child = 0;
  let concession = 0;
  for (const line of order.lines) {
    if (line.tier === "ADULT") adult += line.quantity;
    else if (line.tier === "CHILD") child += line.quantity;
    else concession += line.quantity;
  }
  return NextResponse.json({
    status: order.status,
    slotTitle: order.slot.title,
    slotKind: order.slot.kind,
    giftOpenDate: order.slot.giftOpenDate,
    date: dateKeyInTz(order.slot.startsAt, tz),
    time: timeKeyInTz(order.slot.startsAt, tz),
    adult,
    child,
    concession,
    startsAt: formatDisplayDateTime(order.slot.startsAt.toISOString()),
    ticketToken: ticketTokens[0] ?? null,
    ticketTokens,
  });
}
