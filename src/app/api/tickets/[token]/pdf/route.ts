import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTicketPdf } from "@/lib/pdf-ticket";
import { getPublicAppBaseUrl } from "@/lib/request-origin";
import { linesSummaryRu, tierTicketSingularRu } from "@/lib/slot-pricing";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const ticket = await prisma.ticket.findUnique({
    where: { publicToken: token },
    include: {
      order: {
        include: {
          customer: true,
          slot: true,
          lines: true,
          tickets: { orderBy: { createdAt: "asc" }, select: { publicToken: true, tier: true } },
        },
      },
    },
  });

  if (!ticket || ticket.order.status !== "PAID") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const ordered = ticket.order.tickets;
  const idx = ordered.findIndex((t) => t.publicToken === ticket.publicToken);
  const multiPdf = ordered.length > 1;

  const base = getPublicAppBaseUrl();
  const qrUrl = `${base}/staff/quick?t=${ticket.publicToken}`;
  const lines = ticket.order.lines;
  const linesSummary = lines.length > 0 ? linesSummaryRu(lines) : undefined;

  const pdfBytes = await buildTicketPdf({
    title: ticket.order.slot.title,
    customerName: ticket.order.customer.name,
    startsAt: ticket.order.slot.startsAt,
    amountCents: ticket.order.amountCents,
    currency: ticket.order.currency,
    orderId: ticket.order.id,
    qrUrl,
    ticketTierLabel: ticket.tier ? tierTicketSingularRu(ticket.tier) : undefined,
    linesSummary,
    admissionCount: multiPdf ? 1 : ticket.admissionCount,
    ticketOrdinal:
      multiPdf && idx >= 0
        ? { index: idx + 1, total: ordered.length }
        : undefined,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ticket-${ticket.order.id.slice(0, 8)}-${ticket.publicToken.slice(0, 6)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
