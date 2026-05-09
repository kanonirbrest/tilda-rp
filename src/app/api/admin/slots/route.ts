import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { getExhibitionTimezone, dateKeyInTz, timeKeyInTz } from "@/lib/exhibition-time";
import { expireStalePendingOrders } from "@/lib/expire-pending-orders";
import { normalizeSlotKind } from "@/lib/slot-kind";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

async function slotStatsMap(slotIds: string[]) {
  const map = new Map<string, { soldPaid: number; pendingReserved: number }>();
  for (const id of slotIds) map.set(id, { soldPaid: 0, pendingReserved: 0 });
  if (slotIds.length === 0) return map;

  const rows = await prisma.orderLine.findMany({
    where: {
      order: {
        slotId: { in: slotIds },
        status: { in: ["PAID", "PENDING"] },
      },
    },
    select: {
      quantity: true,
      order: { select: { status: true, slotId: true } },
    },
  });
  for (const row of rows) {
    const sid = row.order.slotId;
    const m = map.get(sid);
    if (!m) continue;
    if (row.order.status === "PAID") m.soldPaid += row.quantity;
    else m.pendingReserved += row.quantity;
  }
  return map;
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  await expireStalePendingOrders();

  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") !== "all";

  const slots = await prisma.slot.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { startsAt: "asc" },
  });

  const tz = getExhibitionTimezone();
  const stats = await slotStatsMap(slots.map((s) => s.id));

  const payload = slots.map((s) => {
    const st = stats.get(s.id)!;
    return {
      id: s.id,
      kind: s.kind,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      dateKey: dateKeyInTz(s.startsAt, tz),
      timeKey: timeKeyInTz(s.startsAt, tz),
      capacity: s.capacity,
      soldPaid: st.soldPaid,
      pendingReserved: st.pendingReserved,
      priceCents: s.priceCents,
      priceAdultCents: s.priceAdultCents,
      priceChildCents: s.priceChildCents,
      priceConcessionCents: s.priceConcessionCents,
      currency: s.currency,
      active: s.active,
    };
  });

  return jsonWithCors(req, { timezone: tz, slots: payload });
}

const createBody = z.object({
  kind: z.string().trim().max(64).optional(),
  title: z.string().min(1).max(500),
  startsAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().positive().nullable().optional(),
  priceCents: z.number().int().nonnegative(),
  priceAdultCents: z.number().int().nonnegative().nullable().optional(),
  priceChildCents: z.number().int().nonnegative().nullable().optional(),
  priceConcessionCents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  active: z.boolean().optional(),
});

export async function POST(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  let body: z.infer<typeof createBody>;
  try {
    body = createBody.parse(await req.json());
  } catch (e) {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: String(e) }, { status: 400 });
  }

  const slot = await prisma.slot.create({
    data: {
      title: body.title.trim(),
      kind: normalizeSlotKind(body.kind),
      startsAt: new Date(body.startsAt),
      capacity: body.capacity ?? null,
      priceCents: body.priceCents,
      priceAdultCents: body.priceAdultCents ?? null,
      priceChildCents: body.priceChildCents ?? null,
      priceConcessionCents: body.priceConcessionCents ?? null,
      currency: body.currency ?? "BYN",
      active: body.active ?? true,
    },
  });

  return jsonWithCors(req, { slot: { id: slot.id } }, { status: 201 });
}
