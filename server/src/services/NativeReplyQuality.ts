/** Detect sustained generation loops, independently of language or business data.
 * Keep the native run/receipts intact; never turn a partial answer into success. */
export function nativeReplyFault(text: string): string | null {
  if (!text.trim()) return 'NATIVE_OUTPUT_MISSING'
  for (let period = 1; period <= 64 && period * 12 <= text.length; period++) {
    let matched = 0
    for (let i = period; i < text.length; i++) {
      matched = text[i] === text[i - period] ? matched + 1 : 0
      if (matched >= period * 11 && matched + period >= 240) return 'NATIVE_OUTPUT_REPETITION'
    }
  }
  return null
}
