import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { PAID_ORDER_WHERE } from "@/lib/customer-paid-orders";
import { dateKeyInTz, getExhibitionTimezone, wallDayUtcRange } from "@/lib/exhibition-time";
import { formatDisplayDateTime } from "@/lib/format-display-datetime";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

const customerListSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  birthDate: true,
  createdAt: true,
  _count: { select: { orders: { where: PAID_ORDER_WHERE } } },
  orders: {
    where: { clubPromoTelegramUserId: { not: null } },
    select: { clubPromoTelegramUserId: true },
    take: 1,
  },
} satisfies Prisma.CustomerSelect;

type CustomerListRow = Prisma.CustomerGetPayload<{ select: typeof customerListSelect }>;

async function customerFilterFacets(
  tz: string,
  title: string | null,
  dateYmd: string | null,
): Promise<{ titles: string[]; dates: string[] }> {
  const paidOrderOnSlot = { some: PAID_ORDER_WHERE };
  const [titleSlots, dateSlots] = await Promise.all([
    prisma.slot.findMany({
      where: {
        orders: paidOrderOnSlot,
        ...(dateYmd ?
          (() => {
            const range = wallDayUtcRange(dateYmd, tz);
            return range ? { startsAt: { gte: range.start, lte: range.end } } : {};
          })()
        : {}),
      },
      select: { title: true },
      distinct: ["title"],
      orderBy: { title: "asc" },
    }),
    prisma.slot.findMany({
      where: {
        orders: paidOrderOnSlot,
        ...(title ? { title } : {}),
      },
      select: { startsAt: true },
    }),
  ]);

  const dates = new Set<string>();
  for (const s of dateSlots) {
    dates.add(dateKeyInTz(s.startsAt, tz));
  }

  return {
    titles: titleSlots.map((s) => s.title),
    dates: [...dates].sort().reverse(),
  };
}

async function customerIdsWithMinPaidOrders(minOrders: number): Promise<string[]> {
  if (minOrders <= 0) return [];
  const groups = await prisma.order.groupBy({
    by: ["customerId"],
    where: PAID_ORDER_WHERE,
    _count: { _all: true },
    having: {
      customerId: {
        _count: { gte: minOrders },
      },
    },
  });
  return groups.map((g) => g.customerId);
}

async function paginateCustomersByPaidOrderCount(
  where: Prisma.CustomerWhereInput,
  dir: "asc" | "desc",
  skip: number,
  take: number,
): Promise<{ ids: string[]; total: number }> {
  const matching = await prisma.customer.findMany({ where, select: { id: true } });
  const total = matching.length;
  if (total === 0) return { ids: [], total: 0 };

  const idList = matching.map((c) => c.id);
  const groups = await prisma.order.groupBy({
    by: ["customerId"],
    where: { ...PAID_ORDER_WHERE, customerId: { in: idList } },
    _count: { _all: true },
  });
  const countByCustomer = new Map(groups.map((g) => [g.customerId, g._count._all]));

  const sorted = [...idList].sort((a, b) => {
    const diff = (countByCustomer.get(a) ?? 0) - (countByCustomer.get(b) ?? 0);
    return dir === "asc" ? diff : -diff;
  });

  return { ids: sorted.slice(skip, skip + take), total };
}

function mapCustomerRow(c: CustomerListRow) {
  const fromBot = c.orders.some((o) => Boolean(o.clubPromoTelegramUserId?.trim()));
  const source = c._count.orders === 0 ? "anketa" : "tickets";
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
    createdAt: formatDisplayDateTime(c.createdAt.toISOString()),
    createdAtIso: c.createdAt.toISOString(),
    ordersCount: c._count.orders,
    source,
    fromBot,
  };
}

/**
 * Список пользователей (Customer) для страницы /users.
 * GET ?q=&title=&date=YYYY-MM-DD&minOrders=&sort=createdAt|ordersCount&dir=asc|desc&page=1&limit=20
 * minOrders: 0 = без оплаченных заказов; 1/2/3… = не меньше N оплаченных.
 * Фильтры title/date — покупатели с оплаченным заказом на это мероприятие / дату сеанса.
 */
export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const title = (url.searchParams.get("title") ?? "").trim();
  const dateYmd = (url.searchParams.get("date") ?? "").trim();
  const minOrdersRaw = (url.searchParams.get("minOrders") ?? "").trim();
  const minOrders =
    minOrdersRaw === "" ? null
    : Number.isFinite(Number.parseInt(minOrdersRaw, 10)) ?
      Math.max(0, Number.parseInt(minOrdersRaw, 10))
    : null;
  const sortRaw = (url.searchParams.get("sort") ?? "createdAt").trim();
  const sort = sortRaw === "ordersCount" ? "ordersCount" : "createdAt";
  const dirRaw = (url.searchParams.get("dir") ?? "desc").trim().toLowerCase();
  const dir = dirRaw === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
  const skip = (page - 1) * limit;
  const tz = getExhibitionTimezone();

  const and: Prisma.CustomerWhereInput[] = [];

  if (q.length > 0) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (title || dateYmd) {
    const slotWhere: Prisma.SlotWhereInput = {};
    if (title) slotWhere.title = title;
    if (dateYmd) {
      const range = wallDayUtcRange(dateYmd, tz);
      if (!range) {
        return jsonWithCors(req, { message: "date: ожидается YYYY-MM-DD" }, { status: 400 });
      }
      slotWhere.startsAt = { gte: range.start, lte: range.end };
    }
    and.push({
      orders: {
        some: { ...PAID_ORDER_WHERE, slot: slotWhere },
      },
    });
  }

  if (minOrders === 0) {
    and.push({ orders: { none: PAID_ORDER_WHERE } });
  } else if (minOrders != null && minOrders >= 1) {
    if (minOrders === 1) {
      and.push({ orders: { some: PAID_ORDER_WHERE } });
    } else {
      const ids = await customerIdsWithMinPaidOrders(minOrders);
      if (ids.length === 0) {
        return jsonWithCors(req, {
          total: 0,
          page,
          limit,
          totalPages: 1,
          facets: await customerFilterFacets(tz, title || null, dateYmd || null),
          customers: [],
          minOrders,
          sort,
          dir,
        });
      }
      and.push({ id: { in: ids } });
    }
  }

  const where: Prisma.CustomerWhereInput = and.length > 0 ? { AND: and } : {};
  const facetsPromise = customerFilterFacets(tz, title || null, dateYmd || null);

  let total: number;
  let rows: CustomerListRow[];

  if (sort === "ordersCount") {
    const [facets, paginated] = await Promise.all([
      facetsPromise,
      paginateCustomersByPaidOrderCount(where, dir, skip, limit),
    ]);
    total = paginated.total;
    if (paginated.ids.length === 0) {
      rows = [];
    } else {
      const found = await prisma.customer.findMany({
        where: { id: { in: paginated.ids } },
        select: customerListSelect,
      });
      const byId = new Map(found.map((r) => [r.id, r]));
      rows = paginated.ids.map((id) => byId.get(id)).filter((r): r is CustomerListRow => r != null);
    }
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return jsonWithCors(req, {
      total,
      page,
      limit,
      totalPages,
      facets,
      minOrders,
      sort,
      dir,
      customers: rows.map(mapCustomerRow),
    });
  }

  const [facets, counted, listed] = await Promise.all([
    facetsPromise,
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: dir },
      skip,
      take: limit,
      select: customerListSelect,
    }),
  ]);
  total = counted;
  rows = listed;

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return jsonWithCors(req, {
    total,
    page,
    limit,
    totalPages,
    facets,
    minOrders,
    sort,
    dir,
    customers: rows.map(mapCustomerRow),
  });
}
