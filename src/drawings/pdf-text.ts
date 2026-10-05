/**
 * Text helpers for the PDF standard fonts. Helvetica only encodes WinAnsi
 * (CP1252); pdf-lib throws on anything else, and names are user input, so all
 * text goes through `toWinAnsi` first.
 */

/** CP1252 0x80–0x9F code points that WinAnsi adds on top of Latin-1. */
const CP1252_EXTRAS: ReadonlySet<number> = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

const REPLACEMENTS: Readonly<Record<string, string>> = {
  '\t': ' ',
  '\n': ' ',
  '\r': ' ',
  '­': '-',
  '−': '-',
  '‐': '-',
  '‑': '-',
  '→': '->',
  '←': '<-',
  '≈': '~',
  '≤': '<=',
  '≥': '>=',
  '′': "'",
  '″': '"',
  ' ': ' ',
  ' ': ' ',
  '⁄': '/',
}

export function isWinAnsi(codePoint: number): boolean {
  return (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff && codePoint !== 0xad) || CP1252_EXTRAS.has(codePoint)
}

/** Replace every character Helvetica (WinAnsi) cannot encode. Never throws. */
export function toWinAnsi(value: string): string {
  return Array.from(value.normalize('NFC'))
    .map((ch) => {
      const cp = ch.codePointAt(0) ?? 0
      if (isWinAnsi(cp)) return ch
      return REPLACEMENTS[ch] ?? '?'
    })
    .join('')
}

export interface WidthMeasure {
  widthOfTextAtSize(text: string, size: number): number
}

const ELLIPSIS = '...'

/** Shorten `value` with an ellipsis until it fits `maxWidth` at `size`. */
export function fitWidth(font: WidthMeasure, value: string, size: number, maxWidth: number): string {
  const safe = toWinAnsi(value)
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe
  const chars = Array.from(safe)
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = chars.slice(0, mid).join('') + ELLIPSIS
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo === 0 ? '' : chars.slice(0, lo).join('') + ELLIPSIS
}

/** `value` cut back until `value...` fits `maxWidth`. */
function withEllipsis(font: WidthMeasure, value: string, size: number, maxWidth: number): string {
  const chars = Array.from(value.trimEnd())
  while (chars.length > 0 && font.widthOfTextAtSize(chars.join('') + ELLIPSIS, size) > maxWidth) chars.pop()
  return chars.length === 0 ? '' : chars.join('').trimEnd() + ELLIPSIS
}

/**
 * Greedy word wrap of user text into at most `maxLines` WinAnsi-safe lines.
 * Newlines start a new paragraph; an over-long word is cut with an ellipsis,
 * and text beyond `maxLines` ends the last kept line with an ellipsis.
 */
export function wrapText(font: WidthMeasure, value: string, size: number, maxWidth: number, maxLines: number): string[] {
  const fits = (s: string): boolean => font.widthOfTextAtSize(s, size) <= maxWidth
  const lines: string[] = []
  for (const paragraph of value.trim().split(/\r?\n/)) {
    let line = ''
    for (const word of toWinAnsi(paragraph).split(' ').filter((w) => w !== '')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (fits(candidate)) {
        line = candidate
        continue
      }
      if (line !== '') lines.push(line)
      line = fits(word) ? word : fitWidth(font, word, size, maxWidth)
    }
    lines.push(line)
  }
  const kept = lines.length === 1 && lines[0] === '' ? [] : lines
  if (kept.length <= maxLines) return kept
  const head = kept.slice(0, Math.max(maxLines, 0))
  const last = head.pop()
  return last === undefined ? [] : [...head, withEllipsis(font, last, size, maxWidth)]
}
