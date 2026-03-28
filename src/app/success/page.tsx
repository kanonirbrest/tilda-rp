import { SuccessClient } from "./ui";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  const supportEmail = process.env.SUPPORT_EMAIL || "support@example.com";

  if (!orderId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center text-zinc-600 sm:px-6">
        Не указан заказ.
      </div>
    );
  }

  return <SuccessClient orderId={orderId} supportEmail={supportEmail} />;
}
