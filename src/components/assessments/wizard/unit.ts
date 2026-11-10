/** Display unit of an indicator value: system units are translated (indicators.units), user units are shown as typed. */
export function displayUnit(
  ind: { isSystem: boolean; unit: string },
  t: { has: (k: string) => boolean; (k: string): string },
): string {
  return ind.isSystem && t.has(`units.${ind.unit}`) ? t(`units.${ind.unit}`) : ind.unit;
}
