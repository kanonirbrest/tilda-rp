import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

const patchBody = z
  .object({
    title: z.string().min(1).max(500).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    capacity: z.number().int().positive().nullable().optional(),
    priceCents: z.number().int().nonnegative().optional(),
    priceAdultCents: z.number().int().nonnegative().nullable().optional(),
    priceChildCents: z.number().int().nonnegative().nullable().optional(),
    priceConcessionCents: z.number().int().nonnegative().nullable().optional(),
    currency: z.string().min(1).max(8).optional(),
    active: z.boolean().optional(),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), {
    message: "Нужно хотя бы одно поле",
  });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = requireAdmin(req);
  if (deny) return deny;

  const { id } = await ctx.params;
  let body: z.infer<typeof patchBody>;
  try {
    body = patchBody.parse(await req.json());
  } catch (e) {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: String(e) }, { status: 400 });
  }

  const data: Prisma.SlotUpdateInput = {};
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.startsAt !== undefined) data.startsAt = new Date(body.startsAt);
  if (body.capacity !== undefined) data.capacity = body.capacity;
  if (body.priceCents !== undefined) data.priceCents = body.priceCents;
  if (body.priceAdultCents !== undefined) data.priceAdultCents = body.priceAdultCents;
  if (body.priceChildCents !== undefined) data.priceChildCents = body.priceChildCents;
  if (body.priceConcessionCents !== undefined) data.priceConcessionCents = body.priceConcessionCents;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.active !== undefined) data.active = body.active;

  try {
    await prisma.slot.update({
      where: { id },
      data,
    });
  } catch {
    return jsonWithCors(req, { error: "NOT_FOUND" }, { status: 404 });
  }

  return jsonWithCors(req, { ok: true });
}
