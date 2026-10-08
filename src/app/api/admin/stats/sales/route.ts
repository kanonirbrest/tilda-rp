import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { querySalesStats } from "@/lib/admin-sales-stats";
import { parseOptionalSlotKind } from "@/lib/slot-kind";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() || null;
  const from = url.searchParams.get("from")?.trim() || null;
  const to = url.searchParams.get("to")?.trim() || null;
  if (!date && !from) {
    return jsonWithCors(
      req,
      { error: "BAD_REQUEST", message: "Укажите date=YYYY-MM-DD или from и to" },
      { status: 400 },
    );
  }

  const slotId = url.searchParams.get("slotId")?.trim() || null;
  const slotKind = parseOptionalSlotKind(url.searchParams.get("kind"));
  const result = await querySalesStats({ dateYmd: date, fromYmd: from, toYmd: to, slotId, slotKind });
  if ("error" in result) {
    const message =
      result.error === "RANGE_TOO_LONG" ? "Период не длиннее 366 дней" : "Некорректная дата";
    return jsonWithCors(req, { error: "BAD_REQUEST", message }, { status: 400 });
  }

  return jsonWithCors(req, result);
}
