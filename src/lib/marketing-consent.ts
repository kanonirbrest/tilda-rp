import type { Prisma, PrismaClient } from "@prisma/client";

type CustomerDb = Pick<PrismaClient | Prisma.TransactionClient, "customer">;

/**
 * Галочка «согласен на рассылку» при оформлении заказа.
 * Без галочки покупателя не трогаем — он не попадает в базу рассылок.
 * С галочкой: фиксируем согласие и снимаем ранее проставленный отказ (новое согласие).
 */
export async function applyMarketingConsentAtCheckout(
  tx: CustomerDb,
  customerId: string,
  consented: boolean,
  at: Date,
): Promise<void> {
  if (!consented) return;
  await tx.customer.update({
    where: { id: customerId },
    data: {
      marketingConsentAt: at,
      marketingOptOutAt: null,
    },
  });
}

/** Активная подписка на рассылку: было согласие и нет отказа после него (или отказ старее согласия). */
export function isCustomerInMarketingList(consentAt: Date | null, optOutAt: Date | null): boolean {
  if (!consentAt) return false;
  if (!optOutAt) return true;
  return consentAt.getTime() > optOutAt.getTime();
}
