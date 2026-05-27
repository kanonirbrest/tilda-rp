import { DEI_POLICY_URL } from "@/lib/policy-consent";

type PolicyConsentFieldProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
};

export function PolicyConsentField({
  checked,
  onChange,
  disabled,
  id = "dei-policy-consent",
}: PolicyConsentFieldProps) {
  return (
    <label className="dei-policy-consent" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        name="deiPolicyConsent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="dei-policy-consent__text">
        {"Я согласен с\u00a0"}
        <a href={DEI_POLICY_URL} target="_blank" rel="noopener noreferrer">
          Политикой обработки персональных данных
        </a>
      </span>
    </label>
  );
}
