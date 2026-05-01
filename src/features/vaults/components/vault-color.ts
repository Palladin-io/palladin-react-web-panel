/**
 * Convert a hex colour (`#RRGGBB`) into an `rgba()` string with the given
 * alpha. Used to derive subtle vault-tinted backgrounds without baking a
 * separate palette of pre-tinted hexes — pass the accent colour and the
 * desired opacity (0–1) and the formula stays in one place.
 *
 * Falls back to the input string when the value isn't a valid 6-digit
 * hex so callers can pass through `rgba(...)` or named colours unchanged.
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
