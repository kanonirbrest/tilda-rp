import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { querySalesStats } from "@/lib/admin-sales-stats";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() ?? "";
  if (!date) {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: "Укажите date=YYYY-MM-DD" }, { status: 400 });
  }

  const slotId = url.searchParams.get("slotId")?.trim() || null;
  const result = await querySalesStats({ dateYmd: date, slotId });
  if ("error" in result) {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: "Некорректная дата" }, { status: 400 });
  }

  return jsonWithCors(req, result);
}
