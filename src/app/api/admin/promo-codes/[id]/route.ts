import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { normalizePromoCode } from "@/lib/promo-code";
import { normalizeSlotKind } from "@/lib/slot-kind";

const isoOrNull = z.union([z.string().datetime(), z.null()]);

const patchSchema = z.object({
  code: z.string().trim().min(2).max(40).optional(),
  active: z.boolean().optional(),
  slotKind: z.union([z.string().trim().max(64), z.null()]).optional(),
  discountKind: z.enum(["PERCENT", "FIXED_CENTS"]).optional(),
  discountValue: z.number().int().positive().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  validFrom: isoOrNull.optional(),
  validUntil: isoOrNull.optional(),
});


export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonWithCors(req, { message: "Некорректный JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return jsonWithCors(
      req,
      { message: "Проверьте поля", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const existing = await prisma.promoCode.findUnique({ where: { id } });
  if (!existing) {
    return jsonWithCors(req, { message: "Не найдено" }, { status: 404 });
  }

  const nextKind = d.discountKind ?? existing.discountKind;
  const nextValue = d.discountValue ?? existing.discountValue;
  if (nextKind === "PERCENT" && (nextValue < 1 || nextValue > 100)) {
    return jsonWithCors(req, { message: "Процент скидки: от 1 до 100" }, { status: 400 });
  }

  const data: {
    code?: string;
    active?: boolean;
    slotKind?: string | null;
    discountKind?: "PERCENT" | "FIXED_CENTS";
    discountValue?: number;
    maxUses?: number | null;
    validFrom?: Date | null;
    validUntil?: Date | null;
  } = {};
  if (d.code != null) data.code = normalizePromoCode(d.code);
  if (d.active != null) data.active = d.active;
  if (d.slotKind !== undefined) {
    data.slotKind =
      d.slotKind === null ? null
      : String(d.slotKind).trim() === "" ? null
      : normalizeSlotKind(String(d.slotKind));
  }
  if (d.discountKind != null) data.discountKind = d.discountKind;
  if (d.discountValue != null) data.discountValue = d.discountValue;
  if (d.maxUses !== undefined) data.maxUses = d.maxUses;
  if (d.validFrom !== undefined) {
    data.validFrom = d.validFrom === null ? null : new Date(d.validFrom);
  }
  if (d.validUntil !== undefined) {
    data.validUntil = d.validUntil === null ? null : new Date(d.validUntil);
  }

  if (Object.keys(data).length === 0) {
    return jsonWithCors(req, { message: "Нет полей для обновления" }, { status: 400 });
  }

  try {
    await prisma.promoCode.update({ where: { id }, data });
    return jsonWithCors(req, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return jsonWithCors(req, { message: "Такой код уже занят" }, { status: 409 });
    }
    console.error("[admin] promo patch", e);
    return jsonWithCors(req, { message: "Не удалось сохранить" }, { status: 500 });
  }
}
