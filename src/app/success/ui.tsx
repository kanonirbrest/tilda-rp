"use client";

import { useEffect, useState } from "react";

type Status =
  | "loading"
  | "paid"
  | "pending"
  | "pending_timeout"
  | "payment_incomplete"
  | "other"
  | "error";

const MAX_PENDING_POLLS = 30;

/** Параметр status из query при возврате с bePaid (customer_return). Только явные провалы — иначе опрашиваем API (pending и пр.). */
function gatewayIndicatesFailure(gatewayStatus: string | null): boolean {
  if (gatewayStatus == null) return false;
  const s = gatewayStatus.toLowerCase().trim();
  const fail = new Set([
    "failed",
    "fail",
    "error",
    "declined",
    "unsuccessful",
    "cancelled",
    "canceled",
    "expired",
    "rejected",
  ]);
  return fail.has(s);
}

export function SuccessClient({
  orderId,
  supportEmail,
  bepaidReturn,
  gatewayStatusParam,
}: {
  orderId: string;
  supportEmail: string;
  bepaidReturn: "declined" | "fail" | "cancel" | null;
  gatewayStatusParam: string | null;
}) {
  const [status, setStatus] = useState<Status>(() => {
    if (bepaidReturn != null) return "payment_incomplete";
    if (gatewayIndicatesFailure(gatewayStatusParam)) return "payment_incomplete";
    return "loading";
  });
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  const [slotTitle, setSlotTitle] = useState<string>("");

  useEffect(() => {
    if (bepaidReturn != null || gatewayIndicatesFailure(gatewayStatusParam)) {
      return;
    }

    let cancelled = false;
    let tries = 0;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
        const data = (await res.json()) as {
          status?: string;
          ticketToken?: string | null;
          slotTitle?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          return;
        }
        setSlotTitle(data.slotTitle || "");
        if (data.status === "PAID") {
          setTicketToken(data.ticketToken ?? null);
          setStatus("paid");
          return;
        }
        if (data.status === "PENDING") {
          tries += 1;
          if (tries >= MAX_PENDING_POLLS) {
            setStatus("pending_timeout");
            return;
          }
          setStatus("pending");
          setTimeout(poll, 2000);
          return;
        }
        setStatus("other");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [orderId, bepaidReturn, gatewayStatusParam]);

  const pdfHref =
    ticketToken != null ? `/api/tickets/${encodeURIComponent(ticketToken)}/pdf` : null;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Оплата</h1>

      {status === "loading" ? (
        <p className="text-zinc-600">Проверяем статус заказа…</p>
      ) : null}

      {status === "payment_incomplete" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
          <p className="font-medium">Платёж не завершён или отклонён.</p>
          <p className="mt-2 text-red-900">
            Заказ в системе может оставаться в ожидании — это нормально, пока оплата не прошла. Если
            деньги всё же списались, сохраните номер заказа и напишите на{" "}
            <a className="font-medium underline" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </div>
      ) : null}

      {status === "pending" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Ожидаем подтверждение от платёжной системы. Страница обновится автоматически после
          обработки вебхука. Если окно закрыто — проверьте почту или откройте эту страницу снова.
        </div>
      ) : null}

      {status === "pending_timeout" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Подтверждение так и не пришло.</p>
          <p className="mt-2 text-amber-900">
            Возможно, оплата не прошла, или уведомление от bePaid задерживается. Проверьте операцию в
            личном кабинете bePaid / выписке. Если оплата прошла, но билета нет — напишите на{" "}
            <a className="font-medium underline" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>{" "}
            с номером заказа ниже.
          </p>
        </div>
      ) : null}

      {status === "paid" ? (
        <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <p className="font-medium">Оплата прошла успешно.</p>
          {slotTitle ? <p className="text-sm">{slotTitle}</p> : null}
          {pdfHref ? (
            <a
              href={pdfHref}
              className="inline-flex w-fit items-center rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white"
            >
              Скачать билет (PDF)
            </a>
          ) : null}
          <p className="text-sm text-emerald-900">
            Копия билета также отправлена на указанный email (проверьте папку «Спам»).
          </p>
        </div>
      ) : null}

      {status === "error" || status === "other" ? (
        <p className="text-zinc-600">
          Не удалось получить статус. Сохраните номер заказа и напишите на{" "}
          <a className="underline" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          .
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">Ошиблись в email или телефоне?</p>
        <p className="mt-1">
          Напишите нам на{" "}
          <a className="font-medium underline" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>{" "}
          и укажите номер заказа: <span className="font-mono text-xs">{orderId}</span>
        </p>
      </div>
    </div>
  );
}
