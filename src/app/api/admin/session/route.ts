import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  return jsonWithCors(req, { ok: true });
}
