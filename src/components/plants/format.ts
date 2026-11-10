/** Western digits in both languages, as in the prototype; separators follow the locale. */
export function numberFormat(locale: string, fractionDigits = 0): Intl.NumberFormat {
  return new Intl.NumberFormat(locale === "ar" ? "ar-u-nu-latn" : locale, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  });
}
