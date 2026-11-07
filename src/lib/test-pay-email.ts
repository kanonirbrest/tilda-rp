/**
 * Тестовая почта: сумма заказа всегда 0,10 BYN, в том числе на проде.
 * Витринная цена (subtotal) не меняется, скидка добирает разницу.
 * Выключить на сервере: TEST_PAY_EMAIL=off
 */
export const TEST_PAY_EMAIL_DEFAULT = "test-pay@dei.by";
/** 0,10 BYN в копейках. */
export const TEST_PAY_AMOUNT_CENTS = 10;

export function isTestPayEmail(email: string): boolean {
  const raw = process.env.TEST_PAY_EMAIL;
  const configured = (raw === undefined ? TEST_PAY_EMAIL_DEFAULT : raw).trim().toLowerCase();
  if (!configured || configured === "off" || configured === "false") return false;
  return email.trim().toLowerCase() === configured;
}

/**
 * Сумма к оплате для тестовой почты. null — обычная цена.
 * Не поднимает цену выше уже посчитанной (промокод на 0 остаётся 0).
 */
export function testPayAmountCents(email: string, amountCents: number): number | null {
  if (!isTestPayEmail(email) || amountCents <= 0) return null;
  return Math.min(TEST_PAY_AMOUNT_CENTS, amountCents);
}
