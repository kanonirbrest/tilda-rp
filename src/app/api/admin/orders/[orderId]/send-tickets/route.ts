import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { SendOrderTicketsError, sendOrderTicketsEmail } from "@/lib/send-order-tickets";

/** PDF нескольких билетов может собираться долго. */
export const maxDuration = 300;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { orderId } = await ctx.params;
  let body: { email?: unknown } = {};
  try {
    const j = await req.json();
    if (j && typeof j === "object") body = j as typeof body;
  } catch {
    return jsonWithCors(req, { error: "VALIDATION", message: "Укажите email." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";

  try {
    const result = await sendOrderTicketsEmail(orderId, email);
    if (!result.sent) {
      return jsonWithCors(
        req,
        {
          error: "MAIL_NOT_CONFIGURED",
          message: "Почта на сервере не настроена: задайте Resend или SMTP.",
        },
        { status: 503 },
      );
    }
    return jsonWithCors(req, {
      ok: true,
      ticketCount: result.ticketCount,
      to: result.to,
    });
  } catch (err) {
    if (err instanceof SendOrderTicketsError) {
      return jsonWithCors(req, { error: err.code, message: err.message }, { status: err.status });
    }
    console.error("[admin] send-tickets", {
      orderId,
      message: err instanceof Error ? err.message : String(err),
    });
    return jsonWithCors(
      req,
      { error: "MAIL_FAILED", message: "Не удалось отправить письмо. Повторите позже." },
      { status: 502 },
    );
  }
}
