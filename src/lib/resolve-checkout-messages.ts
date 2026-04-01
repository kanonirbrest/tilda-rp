/** Коды ошибки resolveCheckoutSlot (дублируют union в resolve-checkout-slot). */
export type ResolveCheckoutFailureCode =
  | "SLOT_NOT_FOUND"
  | "DATE_REQUIRED"
  | "TIME_REQUIRED"
  | "AMBIGUOUS";

/** Тексты для UI при неудачном resolveCheckoutSlot (без DATE_REQUIRED/TIME_REQUIRED — там редирект на /tickets). */
export function messageForResolveFailure(code: ResolveCheckoutFailureCode, variant: "checkout" | "pay"): string {
  switch (code) {
    case "AMBIGUOUS":
      return variant === "checkout" ?
          "Несколько сеансов на это время — уточните слот у администратора."
        : "Несколько сеансов на это время — обратитесь к администратору.";
    case "SLOT_NOT_FOUND":
      return variant === "checkout" ?
          "Сеанс не найден. Проверьте дату и время в ссылке с сайта или выберите слот в списке."
        : "Сеанс не найден. Проверьте дату, время и часовой пояс сеансов в базе.";
    case "DATE_REQUIRED":
    case "TIME_REQUIRED":
      return "Укажите slotId или пару date и time.";
  }
}
