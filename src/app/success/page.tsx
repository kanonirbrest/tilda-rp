import { SuccessClient } from "./ui";

function parseBepaidReturn(
  raw: string | string[] | undefined,
): "declined" | "fail" | "cancel" | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const s = v?.trim().toLowerCase();
  if (s === "declined" || s === "fail" || s === "cancel") return s;
  return null;
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    /** наши URL decline/fail/cancel */
    bepaid?: string;
    /** bePaid дописывает к return (successful / failed и т.д.) */
    status?: string;
  }>;
}) {
  const sp = await searchParams;
  const { orderId } = sp;
  const supportEmail = process.env.SUPPORT_EMAIL || "info@dei.by";
  const bepaidReturn = parseBepaidReturn(sp.bepaid);
  const gatewayStatusParam =
    typeof sp.status === "string" && sp.status.trim() !== "" ? sp.status.trim() : null;

  if (!orderId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center text-zinc-600 sm:px-6">
        Не указан заказ.
      </div>
    );
  }

  return (
    <SuccessClient
      orderId={orderId}
      supportEmail={supportEmail}
      bepaidReturn={bepaidReturn}
      gatewayStatusParam={gatewayStatusParam}
    />
  );
}
