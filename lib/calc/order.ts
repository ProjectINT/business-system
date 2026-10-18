/** Code-unit order: independent of locale, unlike localeCompare. */
export function compareText(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}
