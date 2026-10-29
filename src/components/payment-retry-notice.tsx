"use client";

import { useEffect, useState } from "react";
import { paymentRetryFromLocation } from "@/lib/storefront-return";

/** Показывается, когда покупателя вернули на витрину после отказа в оплате. */
export function PaymentRetryNotice({ className }: { className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(paymentRetryFromLocation());
  }, []);
  if (!show) return null;
  return (
    <p className={className} role="status">
      Оплата не прошла. Попробуйте ещё раз.
    </p>
  );
}
