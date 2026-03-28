/**
 * Создание платежа в bePaid (Beyag).
 * Точное тело запроса и поля ответа — сверьте с актуальной документацией вашего договора:
 * https://docs.bepaid.by/ (или раздел, выданный менеджером).
 */
export type CreatePaymentResult = {
  bepaidUid: string;
  redirectUrl: string;
};

export async function createBepaidPayment(opts: {
  orderId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail: string;
  /** Как пользователь зашёл на сайт (host/proto), для return_url и вебхука */
  publicBaseUrl: string;
}): Promise<CreatePaymentResult> {
  const shopId = process.env.BEPAID_SHOP_ID;
  const secret = process.env.BEPAID_SECRET_KEY;
  const apiUrl = process.env.BEPAID_API_URL || "https://gateway.bepaid.by/beyag/payments";

  if (!shopId || !secret) {
    throw new Error("BEPAID_NOT_CONFIGURED");
  }

  const base = opts.publicBaseUrl.replace(/\/$/, "");
  const notificationUrl = `${base}/api/webhooks/bepaid`;
  const returnUrl = `${base}/success?orderId=${encodeURIComponent(opts.orderId)}`;

  const credentials = Buffer.from(`${shopId}:${secret}`).toString("base64");

  const body = {
    request: {
      amount: opts.amountCents,
      currency: opts.currency,
      description: opts.description,
      tracking_id: opts.orderId,
      notification_url: notificationUrl,
      return_url: returnUrl,
      email: opts.customerEmail,
    },
  };

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = JSON.stringify(json);
    throw new Error(`BEPAID_HTTP_${res.status}: ${msg}`);
  }

  const payment = json?.payment as Record<string, unknown> | undefined;
  const uid = (payment?.uid ?? json?.uid) as string | undefined;
  const redirect = (payment?.redirect_url ?? json?.redirect_url) as string | undefined;

  if (!uid || !redirect) {
    throw new Error(`BEPAID_UNEXPECTED_RESPONSE: ${JSON.stringify(json)}`);
  }

  return { bepaidUid: uid, redirectUrl: redirect };
}
