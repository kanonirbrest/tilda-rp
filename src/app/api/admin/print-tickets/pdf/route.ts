import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { loadPrintTicketsForPdf, PrintTicketError, printTicketSheetTierLabel } from "@/lib/print-tickets";
import { renderDomRozhdestvaPrintBatchPdf } from "@/lib/ticket-pdf-dom-rozhdestva";

export const maxDuration = 300;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const fromSerial = Number.parseInt(url.searchParams.get("from") ?? "", 10);
  const toSerial = Number.parseInt(url.searchParams.get("to") ?? "", 10);
  if (!Number.isFinite(fromSerial) || !Number.isFinite(toSerial) || fromSerial < 1 || toSerial < fromSerial) {
    return jsonWithCors(req, { error: "BAD_RANGE", message: "Укажите from и to (номера билетов)." }, { status: 400 });
  }
  if (toSerial - fromSerial + 1 > 1000) {
    return jsonWithCors(req, { error: "BAD_RANGE", message: "За один файл не больше 1000 билетов." }, { status: 400 });
  }

  try {
    const tickets = await loadPrintTicketsForPdf({ fromSerial, toSerial });
    const pdf = await renderDomRozhdestvaPrintBatchPdf(
      tickets.map((t) => ({
        qrUrl: t.qrUrl,
        serialLabel: t.serialLabel,
        displayCode: t.displayCode,
        tierLabel: printTicketSheetTierLabel(t.tier),
      })),
    );
    const from = tickets[0]!.serialLabel;
    const to = tickets[tickets.length - 1]!.serialLabel;
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        ...adminCorsHeaders(req),
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="print-tickets-${from}-${to}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof PrintTicketError) {
      return jsonWithCors(req, { error: err.code, message: err.message }, { status: 404 });
    }
    console.error("[print-ticket] pdf", err);
    return jsonWithCors(req, { error: "PDF_FAILED", message: "Не удалось собрать PDF." }, { status: 503 });
  }
}
