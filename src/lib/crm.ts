type CrmPayload = {
  event: "ticket_paid" | "ticket_used";
  customerName: string;
  email: string;
  phone: string;
  amountCents: number;
  currency: string;
  orderId: string;
  ticketToken: string;
  slotTitle: string;
  slotStartsAt: string;
  usedAt?: string | null;
};

export async function sendCrmWebhook(payload: CrmPayload): Promise<void> {
  const url = process.env.TILDA_CRM_WEBHOOK_URL;
  if (!url) {
    if (process.env.NODE_ENV === "development") {
      console.info("[CRM] TILDA_CRM_WEBHOOK_URL не задан, пропуск:", payload.event);
    }
    return;
  }

  const secret = process.env.TILDA_CRM_WEBHOOK_SECRET;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CRM webhook ${res.status}: ${text.slice(0, 500)}`);
  }
}
