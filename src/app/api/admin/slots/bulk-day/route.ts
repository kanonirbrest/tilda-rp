import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import {
  getExhibitionTimezone,
  wallDateAndTimeToUtc,
  wallDayUtcRange,
  timeKeyInTz,
} from "@/lib/exhibition-time";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

const bulkBody = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    firstHour: z.number().int().min(0).max(23),
    lastHour: z.number().int().min(0).max(23),
    title: z.string().min(1).max(500),
    capacity: z.number().int().positive().nullable().optional(),
    priceCents: z.number().int().nonnegative(),
    priceAdultCents: z.number().int().nonnegative().nullable().optional(),
    priceChildCents: z.number().int().nonnegative().nullable().optional(),
    priceConcessionCents: z.number().int().nonnegative().nullable().optional(),
    currency: z.string().min(1).max(8).optional(),
    active: z.boolean().optional(),
    /** не создавать слот, если на это время уже есть сеанс в этот календарный день (TZ выставки) */
    skipExisting: z.boolean().optional().default(true),
  })
  .refine((b) => b.firstHour <= b.lastHour, {
    message: "firstHour не больше lastHour",
    path: ["lastHour"],
  });

export async function POST(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  let body: z.infer<typeof bulkBody>;
  try {
    body = bulkBody.parse(await req.json());
  } catch (e) {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: String(e) }, { status: 400 });
  }

  const tz = getExhibitionTimezone();
  const range = wallDayUtcRange(body.date, tz);
  if (!range) {
    return jsonWithCors(req, { error: "BAD_DATE", message: "Некорректная дата" }, { status: 400 });
  }

  const existingRows = await prisma.slot.findMany({
    where: {
      startsAt: { gte: range.start, lte: range.end },
    },
    select: { startsAt: true },
  });
  const takenTimeKeys = new Set(existingRows.map((r) => timeKeyInTz(r.startsAt, tz)));

  const currency = body.currency ?? "BYN";
  const active = body.active ?? true;
  const cap = body.capacity ?? null;

  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (let h = body.firstHour; h <= body.lastHour; h++) {
      const timeKey = `${String(h).padStart(2, "0")}:00`;
      if (body.skipExisting && takenTimeKeys.has(timeKey)) {
        skipped += 1;
        continue;
      }
      const startsAt = wallDateAndTimeToUtc(body.date, timeKey, tz);
      if (!startsAt) continue;
      await tx.slot.create({
        data: {
          title: body.title.trim(),
          startsAt,
          capacity: cap,
          priceCents: body.priceCents,
          priceAdultCents: body.priceAdultCents ?? null,
          priceChildCents: body.priceChildCents ?? null,
          priceConcessionCents: body.priceConcessionCents ?? null,
          currency,
          active,
        },
      });
      takenTimeKeys.add(timeKey);
      created += 1;
    }
  });

  return jsonWithCors(req, { ok: true, created, skipped });
}
