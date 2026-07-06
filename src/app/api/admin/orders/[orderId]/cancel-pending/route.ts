import { cancelPendingOrder } from "@/lib/expire-pending-orders";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { orderId } = await ctx.params;
  const cancelled = await cancelPendingOrder(orderId);
  if (!cancelled) {
    return jsonWithCors(
      req,
      {
        error: "ORDER_NOT_PENDING",
        message: "Заявка не найдена или уже не в статусе PENDING.",
      },
      { status: 409 },
    );
  }

  return jsonWithCors(req, { ok: true, orderId, status: "CANCELLED" });
}
