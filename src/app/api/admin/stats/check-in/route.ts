import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import {
  type CheckInStatsStatus,
  queryCheckInStats,
} from "@/lib/admin-check-in-stats";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

function parseStatus(raw: string | null): CheckInStatsStatus | null {
  const s = raw?.trim();
  if (!s || s === "all") return "all";
  if (s === "checked_in" || s === "visited") return "checked_in";
  if (s === "not_checked_in" || s === "not_visited") return "not_checked_in";
  return null;
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() ?? "";
  if (!date) {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: "Укажите date=YYYY-MM-DD" }, { status: 400 });
  }

  const status = parseStatus(url.searchParams.get("status"));
  if (!status) {
    return jsonWithCors(
      req,
      { error: "BAD_REQUEST", message: "status: all | checked_in | not_checked_in" },
      { status: 400 },
    );
  }

  const slotId = url.searchParams.get("slotId")?.trim() || null;
  const result = await queryCheckInStats({ dateYmd: date, slotId, status });
  if ("error" in result) {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: "Некорректная дата" }, { status: 400 });
  }

  return jsonWithCors(req, result);
}
