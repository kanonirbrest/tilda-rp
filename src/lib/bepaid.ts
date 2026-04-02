/**
 * Создание сессии оплаты в bePaid (hosted checkout / payment token).
 * Документация: https://docs.bepaid.by/en/integration/widget/payment_token/
 *
 * Старый URL `https://gateway.bepaid.by/beyag/payments` отвечает 404 — используйте checkout API.
 * Переопределение: `BEPAID_API_URL` (по умолчанию `https://checkout.bepaid.by/ctp/api/checkouts`).
 */
export type CreatePaymentResult = {
  /** Токен checkout; в БД в `Order.bepaidUid` для сопоставления с вебхуком */
  bepaidUid: string;
  redirectUrl: string;
};

const DEFAULT_BEPAID_CHECKOUT_URL = "https://checkout.bepaid.by/ctp/api/checkouts";

function maskEmail(email: string): string {
  const e = email.trim();
  const at = e.indexOf("@");
  if (at <= 0) return "(no-email)";
  const user = e.slice(0, at);
  const domain = e.slice(at + 1);
  const u = user.length <= 2 ? `${user[0] ?? "?"}*` : `${user.slice(0, 2)}…`;
  return `${u}@${domain}`;
}

/**
 * Render/прод часто оставляют старый `BEPAID_API_URL` → gateway …/beyag/payments → 404.
 * Пустая строка в env тоже считается «не задано».
 */
function resolveBepaidApiUrl(): string {
  const raw = process.env.BEPAID_API_URL?.trim();
  if (!raw) {
    console.info("[bePaid] BEPAID_API_URL не задан → дефолт Checkout", { url: DEFAULT_BEPAID_CHECKOUT_URL });
    return DEFAULT_BEPAID_CHECKOUT_URL;
  }
  const lower = raw.toLowerCase();
  if (lower.includes("gateway.bepaid.by") && lower.includes("beyag")) {
    console.warn(
      "[bePaid] BEPAID_API_URL указывает на устаревший Beyag gateway (даёт 404). Используем Checkout API:",
      DEFAULT_BEPAID_CHECKOUT_URL,
    );
    return DEFAULT_BEPAID_CHECKOUT_URL;
  }
  const normalized = raw.replace(/\/+$/, "");
  console.info("[bePaid] BEPAID_API_URL из env", { url: normalized });
  return normalized;
}

/**
 * POST с тем же телом на каждый hop. Иначе при 302 fetch может сходить GET без body → 422 «checkout is missing».
 */
async function bepaidPostJson(url: string, headers: Record<string, string>, payload: object): Promise<Response> {
  const body = JSON.stringify(payload);
  const bodyBytes = Buffer.byteLength(body, "utf8");
  const merged: Record<string, string> = {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json",
  };

  let current = url.replace(/\/+$/, "");
  console.info("[bePaid] HTTP POST старт", {
    initialUrl: current,
    bodyBytes,
    payloadKeys: Object.keys(payload),
    checkoutKeys:
      payload && typeof payload === "object" && "checkout" in payload
        ? Object.keys((payload as { checkout: object }).checkout)
        : [],
  });

  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(current, {
      method: "POST",
      headers: merged,
      body,
      redirect: "manual",
    });

    const resUrl = typeof res.url === "string" ? res.url : current;
    console.info("[bePaid] HTTP ответ", {
      hop,
      requestUrl: current,
      responseUrl: resUrl,
      status: res.status,
      contentType: res.headers.get("content-type"),
    });

    if (res.status < 300 || res.status >= 400) {
      return res;
    }

    const loc = res.headers.get("location");
    if (!loc) {
      console.warn("[bePaid] редирект без Location, возвращаем ответ как есть", { status: res.status });
      return res;
    }
    const next = new URL(loc, current).href;
    console.info("[bePaid] редирект, повтор POST с тем же телом", {
      hop,
      from: current,
      to: next,
      status: res.status,
    });
    current = next;
  }

  throw new Error(`BEPAID_TOO_MANY_REDIRECTS lastUrl=${current}`);
}

function splitCustomerName(full: string): { first: string; last: string } {
  const t = full.trim();
  if (!t) return { first: "—", last: "—" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0]!, last: parts[0]! };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

export async function createBepaidPayment(opts: {
  orderId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail: string;
  customerName: string;
  /** Как пользователь зашёл на сайт (host/proto), для return_url и вебхука */
  publicBaseUrl: string;
}): Promise<CreatePaymentResult> {
  const shopId = process.env.BEPAID_SHOP_ID;
  const secret = process.env.BEPAID_SECRET_KEY;
  const apiUrl = resolveBepaidApiUrl();

  if (!shopId || !secret) {
    console.warn("[bePaid] пропуск: нет BEPAID_SHOP_ID или BEPAID_SECRET_KEY");
    throw new Error("BEPAID_NOT_CONFIGURED");
  }

  const base = opts.publicBaseUrl.replace(/\/$/, "");
  const notificationUrl = `${base}/api/webhooks/bepaid`;
  /** После оплаты bePaid ведёт на success_url (не только return_url), см. customer_return в доке bePaid. */
  const returnUrl = `${base}/success?orderId=${encodeURIComponent(opts.orderId)}`;

  const credentials = Buffer.from(`${shopId}:${secret}`).toString("base64");

  /** https://docs.bepaid.by/ru/using_api/testing/ — без списания в процессинге, нужны тестовые карты */
  const bepaidTest = process.env.BEPAID_TEST === "true";

  const { first, last } = splitCustomerName(opts.customerName);

  console.info("[bePaid] создание checkout", {
    orderId: opts.orderId,
    amountCents: opts.amountCents,
    currency: opts.currency,
    bepaidTest,
    publicBaseUrl: base,
    notificationUrl,
    returnUrl,
    customerEmail: maskEmail(opts.customerEmail),
    descriptionPreview: opts.description.slice(0, 80),
    shopIdLength: shopId.length,
    apiUrl,
  });

  const body = {
    checkout: {
      transaction_type: "payment" as const,
      ...(bepaidTest ? { test: true } : {}),
      settings: {
        notification_url: notificationUrl,
        return_url: returnUrl,
        success_url: returnUrl,
        decline_url: `${returnUrl}&bepaid=declined`,
        fail_url: `${returnUrl}&bepaid=fail`,
        cancel_url: `${returnUrl}&bepaid=cancel`,
        language: "ru",
        /** секунды до авто-редиректа на success_url после успеха (документация checkout) */
        auto_return: 3,
      },
      /** Без способов оплаты часть витрин отклоняет сессию; карта — универсальный минимум */
      payment_method: {
        types: ["credit_card" as const],
      },
      order: {
        amount: opts.amountCents,
        currency: opts.currency,
        description: opts.description,
        tracking_id: opts.orderId,
      },
      customer: {
        email: opts.customerEmail.trim(),
        first_name: first,
        last_name: last,
      },
    },
  };

  const res = await bepaidPostJson(apiUrl, {
    "X-API-Version": "2",
    Authorization: `Basic ${credentials}`,
  }, body);

  const responseUrl = typeof res.url === "string" ? res.url : apiUrl;
  const rawText = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json != null ? JSON.stringify(json) : rawText.slice(0, 2000);
    console.error("[bePaid] ошибка HTTP", {
      orderId: opts.orderId,
      status: res.status,
      initialApiUrl: apiUrl,
      responseUrl,
      bodySnippet: rawText.slice(0, 500),
      parsedJson: json,
    });
    throw new Error(`BEPAID_HTTP_${res.status} initialUrl=${apiUrl} responseUrl=${responseUrl}: ${msg}`);
  }

  if (json == null) {
    console.error("[bePaid] тело ответа не JSON", {
      orderId: opts.orderId,
      responseUrl,
      bodySnippet: rawText.slice(0, 500),
    });
    throw new Error(`BEPAID_BAD_JSON responseUrl=${responseUrl}: ${rawText.slice(0, 500)}`);
  }

  const checkout = json?.checkout as Record<string, unknown> | undefined;
  const token = checkout?.token as string | undefined;
  const redirectFromCheckout = checkout?.redirect_url as string | undefined;

  if (token && redirectFromCheckout) {
    let redirectHost = redirectFromCheckout;
    try {
      redirectHost = new URL(redirectFromCheckout).host;
    } catch {
      /* ignore */
    }
    console.info("[bePaid] checkout создан", {
      orderId: opts.orderId,
      tokenLen: token.length,
      tokenTail: token.slice(-8),
      redirectHost,
    });
    return { bepaidUid: token, redirectUrl: redirectFromCheckout };
  }

  /** Резерв: старый формат Beyag, если задан свой BEPAID_API_URL */
  const payment = json?.payment as Record<string, unknown> | undefined;
  const legacyUid = (payment?.uid ?? json?.uid) as string | undefined;
  const legacyRedirect = (payment?.redirect_url ?? json?.redirect_url) as string | undefined;
  if (legacyUid && legacyRedirect) {
    console.info("[bePaid] ответ в legacy-формате Beyag", {
      orderId: opts.orderId,
      uid: legacyUid,
    });
    return { bepaidUid: legacyUid, redirectUrl: legacyRedirect };
  }

  console.error("[bePaid] неожиданная форма ответа", {
    orderId: opts.orderId,
    responseUrl,
    jsonKeys: json ? Object.keys(json) : [],
    json,
  });
  throw new Error(`BEPAID_UNEXPECTED_RESPONSE: ${JSON.stringify(json)}`);
}
