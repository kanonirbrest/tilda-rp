type MarketingConsentFieldProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
};

export function MarketingConsentField({
  checked,
  onChange,
  disabled,
  id = "dei-marketing-consent",
}: MarketingConsentFieldProps) {
  return (
    <label className="dei-marketing-consent" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        name="deiMarketingConsent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="dei-marketing-consent__text">
        Я согласен получать информационные и рекламные рассылки
      </span>
    </label>
  );
}
