import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTicketPdf } from "@/lib/pdf-ticket";
import { getPublicAppBaseUrl } from "@/lib/request-origin";
import { paidCentsForOrderTicketAtIndex } from "@/lib/ticket-refund-alloc";
import { tierTicketSingularRu } from "@/lib/slot-pricing";

/** На Vercel и др. поднимает лимит выполнения route (иначе PDF + очередь семафора могут обрезаться). На self-hosted `next start` часто игнорируется. */
export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const ticket = await prisma.ticket.findUnique({
    where: { publicToken: token },
    include: {
      order: {
        include: {
          slot: true,
          lines: true,
          tickets: {
            orderBy: { createdAt: "asc" },
            select: { publicToken: true, tier: true, refundedAt: true },
          },
        },
      },
    },
  });

  if (!ticket || ticket.order.status !== "PAID" || ticket.refundedAt) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const ordered = ticket.order.tickets;
  const idx = ordered.findIndex((t) => t.publicToken === ticket.publicToken);
  const multiPdf = ordered.length > 1;
  const ticketPriceCents =
    idx >= 0 ?
      paidCentsForOrderTicketAtIndex(ticket.order, idx, ordered.length)
    : ticket.order.amountCents;

  const base = getPublicAppBaseUrl();
  const qrUrl = `${base}/staff/quick?t=${ticket.publicToken}`;

  try {
    const pdfBytes = await buildTicketPdf({
      title: ticket.order.slot.title,
      startsAt: ticket.order.slot.startsAt,
      amountCents: ticketPriceCents,
      currency: ticket.order.currency,
      orderId: ticket.order.id,
      qrUrl,
      ticketTierLabel: ticket.tier ? tierTicketSingularRu(ticket.tier) : undefined,
      admissionCount: multiPdf ? 1 : ticket.admissionCount,
      ticketOrdinal:
        multiPdf && idx >= 0
          ? { index: idx + 1, total: ordered.length }
          : undefined,
      slotKind: ticket.order.slot.kind,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ticket-${ticket.order.id.slice(0, 8)}-${ticket.publicToken.slice(0, 6)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ticket pdf] render failed", {
      orderId: ticket.order.id,
      tokenPrefix: token.slice(0, 8),
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "PDF_RENDER_FAILED",
        hint:
          process.env.NODE_ENV === "development" ? message : "Повторите позже или откройте логи сервера.",
      },
      { status: 503 },
    );
  }
}
