import type { Prisma } from "@prisma/client";

/** Заказы, учитываемые в счётчике и фильтрах на /users. */
export const PAID_ORDER_WHERE = { status: "PAID" } satisfies Prisma.OrderWhereInput;
