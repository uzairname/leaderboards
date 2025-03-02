/**
 * Parses any hex code contained in the string and returns it as a number.
 * Returns null if no valid hex code is found.
 */
export function parseColor(str: string): number | null {
  const match = str.match(/#?([0-9a-f]{6})/i)
  if (!match) return null
  if (match[1].length !== 6) return null
  return parseInt(match[1], 16)
}
