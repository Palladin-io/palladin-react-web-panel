/** Keeps both ends of a long display value visible; callers show the full value on hover. */
export function middleEllipsis(value: string, max = 32): string {
  const chars = [...value]
  return chars.length > max ? `${chars.slice(0, max - 13).join('')}…${chars.slice(-12).join('')}` : value
}
