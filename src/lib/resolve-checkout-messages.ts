/** Коды ошибки resolveCheckoutSlot (дублируют union в resolve-checkout-slot). */
export type ResolveCheckoutFailureCode =
  | "SLOT_NOT_FOUND"
  | "DATE_REQUIRED"
  | "TIME_REQUIRED"
  | "TIME_PAST"
  | "AMBIGUOUS";

/** Тексты для ответов при неудачном resolveCheckoutSlot (API заказа и /pay). */
export function messageForResolveFailure(code: ResolveCheckoutFailureCode, variant: "checkout" | "pay"): string {
  switch (code) {
    case "AMBIGUOUS":
      return variant === "checkout" ?
          "Несколько сеансов на это время — уточните слот у администратора."
        : "Несколько сеансов на это время — обратитесь к администратору.";
    case "TIME_PAST":
      return "Это время сеанса уже прошло. Выберите более позднее время.";
    case "SLOT_NOT_FOUND":
      return variant === "checkout" ?
          "Сеанс не найден. Проверьте slotId или пару date и time в запросе."
        : "Сеанс не найден. Проверьте дату, время и часовой пояс сеансов в базе.";
    case "DATE_REQUIRED":
    case "TIME_REQUIRED":
      return "Укажите slotId или пару date и time.";
  }
}
