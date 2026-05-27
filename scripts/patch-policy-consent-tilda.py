#!/usr/bin/env python3
"""Добавляет обязательный чекбокс политики персональных данных в HTML Тильды."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "public/buy-tickets/calendar.html",
    ROOT / "public/buy-tickets/slot.html",
    ROOT / "public/buy-tickets-summer/calendar.html",
    ROOT / "public/buy-tickets-summer/slot.html",
]

POLICY_FUNCS = """
  var DEI_POLICY_URL = "https://dei.by/policy";
  var DEI_POLICY_CONSENT_ERROR =
    "Вы не согласились с Политикой обработки персональных данных (https://dei.by/policy)";

  function deiEnsurePolicyConsentCheckbox(form) {
    if (!form || form.querySelector('input[name="deiPolicyConsent"]')) return;
    var submitWrap = form.querySelector(".tn-form__submit");
    var wrap = document.createElement("div");
    wrap.className = "t-input-group t-input-group_cb dei-policy-consent-group";
    wrap.style.marginBottom = "16px";
    wrap.innerHTML =
      '<div class="t-input-block">' +
      '<label class="t-checkbox__control t-checkbox__control_flex" style="font-size:14px;font-weight:200;color:rgb(255,255,255);">' +
      '<input type="checkbox" name="deiPolicyConsent" value="yes" class="t-checkbox js-tilda-rule">' +
      '<div class="t-checkbox__indicator"></div>' +
      '<span class="t-checkbox__labeltext">Я согласен с\\u00a0<a href="' +
      DEI_POLICY_URL +
      '" target="_blank" rel="noopener noreferrer">Политикой обработки персональных данных</a></span>' +
      "</label></div>";
    if (submitWrap && submitWrap.parentNode) {
      submitWrap.parentNode.insertBefore(wrap, submitWrap);
    } else {
      form.appendChild(wrap);
    }
  }
"""

POLICY_CSS = """
#form1961449631 .dei-policy-consent-group a {
  color: #ff6282;
  color: var(--dei-cal-day-accent, #ff6282);
  text-decoration: underline;
}
#form1961449631 .dei-policy-consent-group a:hover {
  opacity: 0.9;
}
"""

ANCHOR_IS_TICKET = """  function deiIsTicketForm(form) {
    if (!form) return false;
    return form.id === FORM_ID || form.getAttribute("name") === FORM_ID;
  }

  function doCheckout(form) {"""

REPLACEMENT_IS_TICKET = """  function deiIsTicketForm(form) {
    if (!form) return false;
    return form.id === FORM_ID || form.getAttribute("name") === FORM_ID;
  }
""" + POLICY_FUNCS + """
  function doCheckout(form) {"""

ANCHOR_CONSENT = """    if (consent && !consent.checked) {
      deiShowFormError(form, "Нужно согласие с условиями приобретения и офертой.");
      form.dataset.deiSending = "0";
      return;
    }
    if (!date) {"""

REPLACEMENT_CONSENT = """    if (consent && !consent.checked) {
      deiShowFormError(form, "Нужно согласие с условиями приобретения и офертой.");
      form.dataset.deiSending = "0";
      return;
    }
    deiEnsurePolicyConsentCheckbox(form);
    var policyConsent = form.querySelector('input[name="deiPolicyConsent"]');
    if (!policyConsent || !policyConsent.checked) {
      deiShowFormError(form, DEI_POLICY_CONSENT_ERROR);
      form.dataset.deiSending = "0";
      return;
    }
    if (!date) {"""

MOUNT_PAIRS = [
    (
        """      slot.appendChild(form);

      deiSyncPlainCountDisplays();""",
        """      slot.appendChild(form);
      deiEnsurePolicyConsentCheckbox(form);

      deiSyncPlainCountDisplays();""",
    ),
    (
        """        slot.appendChild(form);

        deiSyncPlainCountDisplays();""",
        """        slot.appendChild(form);
        deiEnsurePolicyConsentCheckbox(form);

        deiSyncPlainCountDisplays();""",
    ),
]

ANCHOR_TRYHOOK = """      hookForm(form);
      deiEnsurePromoFieldAfterPhone(form);
    });"""

REPLACEMENT_TRYHOOK = """      hookForm(form);
      deiEnsurePromoFieldAfterPhone(form);
      deiEnsurePolicyConsentCheckbox(form);
    });"""

ANCHOR_CSS = """#rec1961449631:has(#dei-plain-checkout-root) #form1961449631 .t-checkbox__labeltext,
#rec1961449631:has(#dei-plain-checkout-root) #form1961449631 .t-checkbox__label {
  font-family: var(--t-text-font, Arial), Arial, sans-serif !important;
  font-size: 14px !important;
  font-weight: 200 !important;
  line-height: 1.45 !important;
  color: rgba(255, 255, 255, 0.92) !important;
}
#rec1961449631:has(#dei-plain-checkout-root) #form1961449631 button.t-submit {"""

REPLACEMENT_CSS = ANCHOR_CSS.replace(
    "#rec1961449631:has(#dei-plain-checkout-root) #form1961449631 button.t-submit {",
    POLICY_CSS
    + "#rec1961449631:has(#dei-plain-checkout-root) #form1961449631 button.t-submit {",
)


def patch(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if 'name="deiPolicyConsent"' in text and "deiEnsurePolicyConsentCheckbox" in text:
        print(f"skip (already patched): {path}")
        return False
    orig = text
    steps: list[tuple[str, str]] = [
        (ANCHOR_IS_TICKET, REPLACEMENT_IS_TICKET),
        (ANCHOR_CONSENT, REPLACEMENT_CONSENT),
        (ANCHOR_TRYHOOK, REPLACEMENT_TRYHOOK),
        (ANCHOR_CSS, REPLACEMENT_CSS),
    ]
    for anchor, repl in steps:
        if anchor not in text:
            raise ValueError(f"anchor missing in {path}: {anchor[:60]!r}...")
        text = text.replace(anchor, repl, 1)
    if not any(a in text for a, _ in MOUNT_PAIRS):
        raise ValueError(f"mount anchor missing in {path}")
    for anchor, repl in MOUNT_PAIRS:
        if anchor in text:
            text = text.replace(anchor, repl, 1)
            break
    if text == orig:
        return False
    path.write_text(text, encoding="utf-8")
    print(f"patched: {path}")
    return True


def main() -> None:
    for p in FILES:
        if not p.is_file():
            raise SystemExit(f"missing: {p}")
        patch(p)


if __name__ == "__main__":
    main()
