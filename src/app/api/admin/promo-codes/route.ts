import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { normalizePromoCode } from "@/lib/promo-code";

const createSchema = z.object({
  code: z.string().trim().min(2).max(40),
  discountKind: z.enum(["PERCENT", "FIXED_CENTS"]),
  discountValue: z.number().int().positive(),
  maxUses: z.number().int().positive().nullable().optional(),
  validFrom: z.union([z.string().datetime(), z.null()]).optional(),
  validUntil: z.union([z.string().datetime(), z.null()]).optional(),
  active: z.boolean().optional(),
});

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const promos = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
  });
  const ids = promos.map((p) => p.id);
  const reservedRows =
    ids.length === 0 ?
      []
    : await prisma.order.groupBy({
        by: ["promoCodeId"],
        where: {
          promoCodeId: { in: ids },
          status: { in: ["PENDING", "PAID"] },
        },
        _count: { _all: true },
      });
  const reservedMap = new Map(
    reservedRows.map((r) => [r.promoCodeId!, r._count._all]),
  );

  return jsonWithCors(
    req,
    promos.map((p) => ({
      id: p.id,
      code: p.code,
      active: p.active,
      discountKind: p.discountKind,
      discountValue: p.discountValue,
      maxUses: p.maxUses,
      validFrom: p.validFrom?.toISOString() ?? null,
      validUntil: p.validUntil?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      reservedOrders: reservedMap.get(p.id) ?? 0,
    })),
  );
}

export async function POST(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonWithCors(req, { message: "Некорректный JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return jsonWithCors(
      req,
      { message: "Проверьте поля", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  if (d.discountKind === "PERCENT" && (d.discountValue < 1 || d.discountValue > 100)) {
    return jsonWithCors(req, { message: "Процент скидки: от 1 до 100" }, { status: 400 });
  }

  const code = normalizePromoCode(d.code);
  try {
    const row = await prisma.promoCode.create({
      data: {
        code,
        active: d.active ?? true,
        discountKind: d.discountKind,
        discountValue: d.discountValue,
        maxUses: d.maxUses ?? null,
        validFrom: d.validFrom ? new Date(d.validFrom) : null,
        validUntil: d.validUntil ? new Date(d.validUntil) : null,
      },
    });
    return jsonWithCors(req, { ok: true, id: row.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return jsonWithCors(req, { message: "Такой код уже существует" }, { status: 409 });
    }
    console.error("[admin] promo create", e);
    return jsonWithCors(req, { message: "Не удалось создать промокод" }, { status: 500 });
  }
}
