/** Drops the Arabic article ("ال") and the English "Al-" so the initial is the real letter. */
function stripArticle(word: string): string {
  if (/^al-./i.test(word)) return word.slice(3);
  if (/^ال./u.test(word)) return word.slice(2);
  return word;
}

/**
 * Up to two initials from a full name. Abbreviated titles ("م.", "Eng.", "Dr.")
 * are skipped, so "م. سارة الجبوري" gives "سج" and "Eng. Sara Al-Jubouri" gives "SJ".
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const real = words.filter((w) => !w.endsWith("."));
  const pick = (real.length > 0 ? real : words).slice(0, 2);
  return pick
    .map((w) => Array.from(stripArticle(w))[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}
