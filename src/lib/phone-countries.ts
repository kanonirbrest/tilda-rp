export type PhoneCountry = {
  iso: string;
  name: string;
  dialCode: string;
  placeholder: string;
  minDigits: number;
  maxDigits: number;
  /** Шаблон маски: `#` — цифра. */
  mask: string;
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "by", name: "Беларусь", dialCode: "375", placeholder: "(00) 000-00-00", minDigits: 9, maxDigits: 9, mask: "(##) ###-##-##" },
  { iso: "ru", name: "Россия", dialCode: "7", placeholder: "(000) 000-00-00", minDigits: 10, maxDigits: 10, mask: "(###) ###-##-##" },
  { iso: "kz", name: "Казахстан", dialCode: "7", placeholder: "(000) 000-00-00", minDigits: 10, maxDigits: 10, mask: "(###) ###-##-##" },
  { iso: "ua", name: "Украина", dialCode: "380", placeholder: "(00) 000-00-00", minDigits: 9, maxDigits: 9, mask: "(##) ###-##-##" },
  { iso: "pl", name: "Польша", dialCode: "48", placeholder: "000-000-000", minDigits: 9, maxDigits: 9, mask: "###-###-###" },
  { iso: "lt", name: "Литва", dialCode: "370", placeholder: "(00) 000-000", minDigits: 8, maxDigits: 8, mask: "(##) ###-###" },
  { iso: "lv", name: "Латвия", dialCode: "371", placeholder: "00-000-000", minDigits: 8, maxDigits: 8, mask: "##-###-###" },
  { iso: "ee", name: "Эстония", dialCode: "372", placeholder: "0000-0000", minDigits: 7, maxDigits: 8, mask: "####-####" },
  { iso: "de", name: "Германия", dialCode: "49", placeholder: "0000-0000000", minDigits: 10, maxDigits: 11, mask: "####-#######" },
  { iso: "us", name: "США", dialCode: "1", placeholder: "(000) 000-0000", minDigits: 10, maxDigits: 10, mask: "(###) ###-####" },
  { iso: "gb", name: "Великобритания", dialCode: "44", placeholder: "0000-000000", minDigits: 10, maxDigits: 10, mask: "####-######" },
  { iso: "ge", name: "Грузия", dialCode: "995", placeholder: "000-00-00-00", minDigits: 9, maxDigits: 9, mask: "###-##-##-##" },
  { iso: "am", name: "Армения", dialCode: "374", placeholder: "00-000-000", minDigits: 8, maxDigits: 8, mask: "##-###-###" },
  { iso: "az", name: "Азербайджан", dialCode: "994", placeholder: "00-000-00-00", minDigits: 9, maxDigits: 9, mask: "##-###-##-##" },
  { iso: "uz", name: "Узбекистан", dialCode: "998", placeholder: "00-000-00-00", minDigits: 9, maxDigits: 9, mask: "##-###-##-##" },
  { iso: "il", name: "Израиль", dialCode: "972", placeholder: "00-000-0000", minDigits: 9, maxDigits: 9, mask: "##-###-####" },
  { iso: "tr", name: "Турция", dialCode: "90", placeholder: "(000) 000-00-00", minDigits: 10, maxDigits: 10, mask: "(###) ###-##-##" },
  { iso: "cn", name: "Китай", dialCode: "86", placeholder: "000-0000-0000", minDigits: 11, maxDigits: 11, mask: "###-####-####" },
  { iso: "fr", name: "Франция", dialCode: "33", placeholder: "0-00-00-00-00", minDigits: 9, maxDigits: 9, mask: "#-##-##-##-##" },
  { iso: "it", name: "Италия", dialCode: "39", placeholder: "000-000-0000", minDigits: 9, maxDigits: 10, mask: "###-###-####" },
];

const byIso = new Map(PHONE_COUNTRIES.map((c) => [c.iso, c]));

export function getPhoneCountry(iso: string): PhoneCountry {
  return byIso.get(iso) ?? PHONE_COUNTRIES[0];
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatLocalPhone(value: string, country: PhoneCountry): string {
  const digits = digitsOnly(value).slice(0, country.maxDigits);
  if (!digits) return "";

  let di = 0;
  let out = "";
  for (const ch of country.mask) {
    if (ch === "#") {
      if (di >= digits.length) break;
      out += digits[di++];
    } else if (di < digits.length) {
      out += ch;
    }
  }
  return out;
}

export function toE164Phone(iso: string, localValue: string): string {
  const country = getPhoneCountry(iso);
  const digits = digitsOnly(localValue);
  if (!digits) return "";
  return `+${country.dialCode}${digits}`;
}

export function isPhoneComplete(iso: string, localValue: string): boolean {
  const country = getPhoneCountry(iso);
  const digits = digitsOnly(localValue);
  return digits.length >= country.minDigits && digits.length <= country.maxDigits;
}
