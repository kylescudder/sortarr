// 35mm sound film runs at 24 frames a second with 16 four-perf frames to the
// foot: 1.5 ft a second, exactly 90 ft a minute. Runtimes come from Radarr in
// whole minutes, so footage is only as precise as that.
export const FEET_PER_MINUTE_35MM = (24 * 60) / 16

export const feetOf35mm = (minutes: number) => minutes * FEET_PER_MINUTE_35MM

// Old roll tickets carried a zero-padded serial, printed sideways and repeated
// on the stub. FNV-1a over the picked titles (sorted, case-insensitive) so the
// same films always print the same number, whatever order they were picked in.
export function ticketSerial(titles: readonly string[]) {
  let hash = 0x811c9dc5
  const text = titles
    .map((title) => title.toLowerCase())
    .sort()
    .join('\n')
  for (const char of text) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return String(hash % 1_000_000).padStart(6, '0')
}
