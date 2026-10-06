// Bounded validation of ordinary (non-fragmented) MP4/AVC samples. No decoder/transcoder.
type Box = { type: string; start: number; end: number }
export const VIDEO_WORK_LIMIT = 1500000
export type VideoValidationWork = { steps: number; boxes: number; samples: number; mediaAdvances: number }
function spend(work: VideoValidationWork | undefined, count = 1) {
  if (!work) return
  work.steps += count
  if (work.steps > VIDEO_WORK_LIMIT) throw Error('TRAINING_VIDEO_WORK_LIMIT')
}
const invalid = (): never => { throw Error('TRAINING_VIDEO_INVALID') }
export function mp4Boxes(data: Buffer, start: number, end: number, work?: VideoValidationWork): Box[] {
  const result: Box[] = []
  while (start < end) {
    spend(work); if (work) work.boxes++
    if (end - start < 8 || result.length >= 10000) invalid()
    let size = data.readUInt32BE(start), header = 8
    if (size === 1) {
      if (end - start < 16) invalid()
      const large = data.readBigUInt64BE(start + 8)
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) invalid()
      size = Number(large); header = 16
    }
    if (size === 0) size = end - start
    if (size < header || size > end - start) invalid()
    result.push({ type: data.toString('ascii', start + 4, start + 8), start: start + header, end: start + size })
    start += size
  }
  return result
}
function one(items: Box[], type: string): Box {
  const found = items.filter(b => b.type === type)
  if (found.length !== 1) invalid()
  return found[0]
}
function fullTable(data: Buffer, box: Box, width: number, maximum = 250000) {
  if (box.end - box.start < 8 || data.readUInt32BE(box.start) !== 0) invalid()
  const count = data.readUInt32BE(box.start + 4)
  if (!count || count > maximum || box.end - box.start !== 8 + count * width) invalid()
  return count
}
function nalType(nal: Buffer) {
  if (nal.length < 2 || nal[0] & 0x80) invalid()
  const type = nal[0] & 31
  if (type === 0 || type >= 24) invalid()
  return type
}
// Exp-Golomb prefix validation catches empty/all-zero SPS/PPS/slice payloads.
function bitReader(nal: Buffer, start = 1) {
  const bytes: number[] = []
  for (let i = start; i < Math.min(nal.length, start + 128); i++) {
    if (i >= start + 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) {
      if (i + 1 >= nal.length || nal[i + 1] > 3) invalid()
      continue
    }
    bytes.push(nal[i])
  }
  let position = 0
  const bit = () => { if (position >= bytes.length * 8) invalid(); const value = (bytes[position >> 3] >> (7 - (position & 7))) & 1; position++; return value }
  const bits = (count: number) => { let value = 0; for (let i = 0; i < count; i++) value = value * 2 + bit(); return value }
  const ue = () => { let zeros = 0; while (!bit()) if (++zeros > 30) invalid(); return 2 ** zeros - 1 + bits(zeros) }
  return { bits, ue, se: () => { const code = ue(); return code & 1 ? (code + 1) / 2 : -code / 2 } }
}
function sequenceParameters(nal: Buffer) {
  const reader = bitReader(nal), profile = reader.bits(8), compatibility = reader.bits(8), level = reader.bits(8), id = reader.ue()
  if (id > 31 || (compatibility & 3) || !level) invalid()
  let chroma = 1, separate = 0
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
    chroma = reader.ue(); if (chroma > 3) invalid()
    if (chroma === 3) separate = reader.bits(1)
    if (reader.ue() > 6 || reader.ue() > 6) invalid()
    reader.bits(1)
    if (reader.bits(1)) for (let i = 0; i < (chroma === 3 ? 12 : 8); i++) if (reader.bits(1)) {
      let last = 8, next = 8
      for (let j = 0; j < (i < 6 ? 16 : 64); j++) { if (next !== 0) next = (last + reader.se() + 256) % 256; last = next === 0 ? last : next }
    }
  } else if (![66, 77, 88].includes(profile)) invalid()
  if (reader.ue() > 12) invalid()
  const order = reader.ue(); if (order > 2) invalid()
  if (order === 0) { if (reader.ue() > 12) invalid() }
  else if (order === 1) { reader.bits(1); reader.se(); reader.se(); const cycle = reader.ue(); if (cycle > 255) invalid(); for (let i = 0; i < cycle; i++) reader.se() }
  if (reader.ue() > 16) invalid()
  reader.bits(1)
  const columns = reader.ue() + 1, rows = reader.ue() + 1, frame = reader.bits(1)
  if (columns > 4096 || rows > 4096) invalid()
  if (!frame) reader.bits(1)
  reader.bits(1)
  let left = 0, right = 0, top = 0, bottom = 0
  if (reader.bits(1)) { left = reader.ue(); right = reader.ue(); top = reader.ue(); bottom = reader.ue() }
  reader.bits(1) // VUI-present flag; codec compatibility is not a decoder guarantee.
  const format = separate ? 0 : chroma, cropX = format === 1 || format === 2 ? 2 : 1, cropY = (format === 1 ? 2 : 1) * (2 - frame)
  const width = columns * 16 - (left + right) * cropX, height = rows * 16 * (2 - frame) - (top + bottom) * cropY
  if (width <= 0 || height <= 0) invalid()
  return { id, width, height }
}
function pictureParameters(nal: Buffer, sequenceIds: Set<number>) {
  const reader = bitReader(nal), id = reader.ue(), sps = reader.ue()
  if (id > 255 || !sequenceIds.has(sps)) invalid()
  reader.bits(1); reader.bits(1)
  // FMO is outside the supported ordinary training-video profile.
  if (reader.ue() !== 0 || reader.ue() > 31 || reader.ue() > 31) invalid()
  reader.bits(1); if (reader.bits(2) > 2) invalid()
  const qp = reader.se(), qs = reader.se(), chroma = reader.se()
  if (qp < -26 || qp > 25 || qs < -26 || qs > 25 || chroma < -12 || chroma > 12) invalid()
  reader.bits(1); reader.bits(1); reader.bits(1)
  return id
}
function parameterSets(data: Buffer, box: Box, width: number, height: number) {
  const config = data.subarray(box.start, box.end)
  if (config.length < 7 || config[0] !== 1 || !config[1] || !config[3] || (config[4] & 252) !== 252 || (config[4] & 3) === 2 || (config[5] & 224) !== 224) invalid()
  const lengthBytes = (config[4] & 3) + 1
  const spsIds = new Set<number>(), ppsIds = new Set<number>()
  let offset = 6
  function readSet(type: number) {
    if (offset + 2 > config.length) invalid()
    const length = config.readUInt16BE(offset); offset += 2
    if (length < (type === 7 ? 5 : 2) || offset + length > config.length) invalid()
    const nal = config.subarray(offset, offset + length); offset += length
    if (nalType(nal) !== type || !(nal[0] & 96)) invalid()
    if (type === 7) {
      if (nal[1] !== config[1] || nal[2] !== config[2] || nal[3] !== config[3] || (nal[2] & 3)) invalid()
      const sequence = sequenceParameters(nal); if (sequence.width !== width || sequence.height !== height || spsIds.has(sequence.id)) invalid(); spsIds.add(sequence.id)
    } else if (type === 8) {
      const id = pictureParameters(nal, spsIds)
      if (ppsIds.has(id)) invalid()
      ppsIds.add(id)
    }
  }
  const spsCount = config[5] & 31; if (!spsCount) invalid()
  for (let i = 0; i < spsCount; i++) readSet(7)
  if (offset >= config.length) invalid()
  const ppsCount = config[offset++]; if (!ppsCount) invalid()
  for (let i = 0; i < ppsCount; i++) readSet(8)
  // High-profile AVC configuration may include the standard optional extension.
  if (offset < config.length) {
    if (![100, 110, 122, 144].includes(config[1]) || offset + 4 > config.length || (config[offset] & 252) !== 252 || (config[offset + 1] & 248) !== 248 || (config[offset + 2] & 248) !== 248) invalid()
    offset += 3; const count = config[offset++]
    for (let i = 0; i < count; i++) readSet(13)
  }
  if (offset !== config.length) invalid()
  return { lengthBytes, ppsIds }
}
function validateTrack(data: Buffer, media: Box[], mdats: Box[], work: VideoValidationWork) {
  const mdhd = one(media, 'mdhd'), version = data[mdhd.start]
  const timeOffset = version === 0 ? 12 : version === 1 ? 20 : invalid()
  if (mdhd.end - mdhd.start < timeOffset + (version === 0 ? 8 : 12) || !data.readUInt32BE(mdhd.start + timeOffset)) invalid()
  const minf = one(media, 'minf'), minfBoxes = mp4Boxes(data, minf.start, minf.end, work)
  // Only self-contained media: never accept external data-reference entries.
  const dinf = one(minfBoxes, 'dinf'), dref = one(mp4Boxes(data, dinf.start, dinf.end, work), 'dref')
  if (dref.end - dref.start < 8 || data.readUInt32BE(dref.start + 4) !== 1) invalid()
  const reference = one(mp4Boxes(data, dref.start + 8, dref.end, work), 'url ')
  if (reference.end - reference.start !== 4 || data.readUInt32BE(reference.start) !== 1) invalid()
  const stbl = one(minfBoxes, 'stbl'), table = mp4Boxes(data, stbl.start, stbl.end, work), stsd = one(table, 'stsd')
  if (stsd.end - stsd.start < 8 || data.readUInt32BE(stsd.start) !== 0 || data.readUInt32BE(stsd.start + 4) !== 1) invalid()
  const entry = one(mp4Boxes(data, stsd.start + 8, stsd.end, work), 'avc1')
  if (entry.end - entry.start < 78 || data.readUInt16BE(entry.start + 6) !== 1 || !data.readUInt16BE(entry.start + 24) || !data.readUInt16BE(entry.start + 26)) invalid()
  const avc = parameterSets(data, one(mp4Boxes(data, entry.start + 78, entry.end, work), 'avcC'), data.readUInt16BE(entry.start + 24), data.readUInt16BE(entry.start + 26))
  const stsz = one(table, 'stsz')
  if (stsz.end - stsz.start < 12 || data.readUInt32BE(stsz.start) !== 0) invalid()
  const fixedSize = data.readUInt32BE(stsz.start + 4), count = data.readUInt32BE(stsz.start + 8)
  if (!count || count > 250000 || stsz.end - stsz.start !== 12 + (fixedSize ? 0 : count * 4)) invalid()
  spend(work, count)
  const sizes = Array.from({ length: count }, (_, i) => fixedSize || data.readUInt32BE(stsz.start + 12 + i * 4))
  if (sizes.some(size => size <= avc.lengthBytes || size > data.length)) invalid()
  const stts = one(table, 'stts'), timeCount = fullTable(data, stts, 8)
  let timed = 0
  spend(work, timeCount)
  for (let i = 0; i < timeCount; i++) { const n = data.readUInt32BE(stts.start + 8 + i * 8); if (!n || !data.readUInt32BE(stts.start + 12 + i * 8)) invalid(); timed += n; if (timed > count) invalid() }
  if (timed !== count) invalid()
  const offsets = table.filter(b => b.type === 'stco' || b.type === 'co64'); if (offsets.length !== 1) invalid()
  const chunkBox = offsets[0], width = chunkBox.type === 'co64' ? 8 : 4, chunks = fullTable(data, chunkBox, width, count)
  const stsc = one(table, 'stsc'), runs = fullTable(data, stsc, 12, chunks)
  spend(work, runs)
  const mapping = Array.from({ length: runs }, (_, i) => ({ first: data.readUInt32BE(stsc.start + 8 + i * 12), samples: data.readUInt32BE(stsc.start + 12 + i * 12), description: data.readUInt32BE(stsc.start + 16 + i * 12) }))
  if (mapping[0].first !== 1 || mapping.some((r, i) => !r.samples || r.samples > count || r.description !== 1 || r.first > chunks || (i > 0 && r.first <= mapping[i - 1].first))) invalid()
  let sample = 0, run = 0, lastEnd = 0, mediaIndex = 0, hasIdr = false
  for (let chunk = 1; chunk <= chunks; chunk++) {
    spend(work)
    if (run + 1 < runs && mapping[run + 1].first === chunk) run++
    const pos = chunkBox.start + 8 + (chunk - 1) * width
    const rawOffset = width === 8 ? data.readBigUInt64BE(pos) : BigInt(data.readUInt32BE(pos))
    if (rawOffset > BigInt(data.length)) invalid()
    let offset = Number(rawOffset)
    if (offset < lastEnd) invalid()
    for (let i = 0; i < mapping[run].samples; i++) {
      spend(work); work.samples++
      if (sample >= count) invalid()
      const end = offset + sizes[sample++]
      // Top-level boxes and sample offsets are ordered and non-overlapping.
      // Each media interval is skipped at most once across the whole track.
      while (mediaIndex < mdats.length && mdats[mediaIndex].end <= offset) { mediaIndex++; spend(work); work.mediaAdvances++ }
      const media = mdats[mediaIndex]
      if (!media || offset < media.start || end > media.end) invalid()
      let nalOffset = offset, hasSlice = false
      while (nalOffset < end) {
        spend(work)
        if (end - nalOffset < avc.lengthBytes) invalid()
        const length = data.readUIntBE(nalOffset, avc.lengthBytes); nalOffset += avc.lengthBytes
        if (length < 2 || length > end - nalOffset) invalid()
        const nal = data.subarray(nalOffset, nalOffset + length), type = nalType(nal)
        if (type === 1 || type === 5) {
          const bits = bitReader(nal), firstMb = bits.ue(), sliceType = bits.ue(), ppsId = bits.ue()
          if (nal.length < 4 || (type === 5 && !(nal[0] & 96)) || firstMb > 16777215 || sliceType > 9 || !avc.ppsIds.has(ppsId)) invalid()
          hasSlice = true; if (type === 5) hasIdr = true
        }
        nalOffset += length
      }
      if (!hasSlice || nalOffset !== end) invalid()
      offset = end
    }
    lastEnd = offset
  }
  if (sample !== count || !hasIdr) invalid()
  for (const sync of table.filter(b => b.type === 'stss')) {
    const entries = fullTable(data, sync, 4, count); let previous = 0; spend(work, entries)
    for (let i = 0; i < entries; i++) { const n = data.readUInt32BE(sync.start + 8 + i * 4); if (n <= previous || n > count) invalid(); previous = n }
  }
}
export function validateMp4Avc(data: Buffer): VideoValidationWork {
  const work: VideoValidationWork = { steps: 0, boxes: 0, samples: 0, mediaAdvances: 0 }
  const top = mp4Boxes(data, 0, data.length, work), ftyp = one(top, 'ftyp'), moov = one(top, 'moov'), mdats = top.filter(b => b.type === 'mdat' && b.end > b.start)
  if (ftyp.end - ftyp.start < 8 || (ftyp.end - ftyp.start) % 4 || !mdats.length || top.some(b => b.type === 'moof')) invalid()
  const brands = [data.toString('ascii', ftyp.start, ftyp.start + 4)]
  for (let i = ftyp.start + 8; i < ftyp.end; i += 4) brands.push(data.toString('ascii', i, i + 4))
  if (!brands.some(brand => ['isom', 'iso2', 'mp41', 'mp42', 'avc1'].includes(brand))) invalid()
  const movie = mp4Boxes(data, moov.start, moov.end, work)
  if (movie.some(b => b.type === 'mvex')) invalid()
  const videoTracks: Box[][] = []
  for (const trak of movie.filter(b => b.type === 'trak')) {
    const mdia = one(mp4Boxes(data, trak.start, trak.end, work), 'mdia'), media = mp4Boxes(data, mdia.start, mdia.end, work), handler = one(media, 'hdlr')
    if (handler.end - handler.start < 12) invalid()
    if (data.toString('ascii', handler.start + 8, handler.start + 12) === 'vide') videoTracks.push(media)
  }
  if (videoTracks.length !== 1) invalid()
  validateTrack(data, videoTracks[0], mdats, work)
  return work
}
