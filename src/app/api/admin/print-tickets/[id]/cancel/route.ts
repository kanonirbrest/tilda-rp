import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { cancelPrintTicketReservation, PrintTicketError } from "@/lib/print-tickets";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  try {
    await cancelPrintTicketReservation(id);
    return jsonWithCors(req, { ok: true });
  } catch (err) {
    if (err instanceof PrintTicketError) {
      const status = err.code === "NOT_FOUND" || err.code === "NOT_PRINT" ? 404 : 409;
      return jsonWithCors(req, { error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
