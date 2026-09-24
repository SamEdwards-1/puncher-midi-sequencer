/**
 * Which tabs a row of `available` pixels shows, given each tab's width. When
 * they don't all fit, room is kept for the overflow button, the tabs are
 * taken in order until the next would spill, and the open tab is always
 * among them, so you can see where you are. The rest go in the menu.
 */
export const fitTabs = (
  widths: number[],
  available: number,
  open: number,
  { gap, more }: { gap: number; more: number },
): number[] => {
  const all = widths.map((_, index) => index)
  const total =
    widths.reduce((sum, width) => sum + width, 0) +
    gap * Math.max(0, widths.length - 1)
  // a row not yet measured shows them all
  if (available <= 0 || total <= available) {
    return all
  }
  const room = available - more - gap
  const shown = open >= 0 && open < widths.length ? [open] : []
  let used = shown.length > 0 ? widths[open] : 0
  for (const index of all) {
    if (index === open) {
      continue
    }
    const next = used + (shown.length > 0 ? gap : 0) + widths[index]
    if (next > room) {
      break
    }
    shown.push(index)
    used = next
  }
  return shown.sort((a, b) => a - b)
}
