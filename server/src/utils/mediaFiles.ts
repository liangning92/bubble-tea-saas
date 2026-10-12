import path from 'path'
import fs from 'fs'

export const uploadRoot = process.env.UPLOADS_PATH || path.resolve(__dirname, '../../uploads')
export function mediaPath(relative: string) {
  const target = path.resolve(uploadRoot, relative)
  if (!target.startsWith(path.resolve(uploadRoot) + path.sep)) throw Error('INVALID_MEDIA_PATH')
  return target
}
export function localUploadPath(url: string): string | null {
  try {
    let pathname = url
    if(!url.startsWith('/')) {
      const parsed=new URL(url)
      const configured=process.env.MEDIA_PUBLIC_ORIGIN
      const knownOrigin=configured?new URL(configured).origin:undefined
      if(!['localhost','127.0.0.1','api.aicube.online'].includes(parsed.hostname) && parsed.origin!==knownOrigin)return null
      if(!['http:','https:'].includes(parsed.protocol))return null
      pathname=parsed.pathname
    }
    if (!pathname.startsWith('/uploads/')) return null
    const relative = decodeURIComponent(pathname.slice(9))
    mediaPath(relative)
    return relative
  } catch { return null }
}
// Inspect signatures rather than trusting browser MIME or filename.
export function inspectMedia(buffer: Buffer): { kind: string; mimeType: string; ext: string } | null {
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString('ascii')
  if (buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return {kind:'image',mimeType:'image/jpeg',ext:'.jpg'}
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {kind:'image',mimeType:'image/png',ext:'.png'}
  if (['GIF87a','GIF89a'].includes(ascii(0,6))) return {kind:'image',mimeType:'image/gif',ext:'.gif'}
  if (ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP') return {kind:'image',mimeType:'image/webp',ext:'.webp'}
  if (ascii(0,4)==='RIFF' && ascii(8,12)==='WAVE') return {kind:'audio',mimeType:'audio/wav',ext:'.wav'}
  if (ascii(0,4)==='OggS') return {kind:'audio',mimeType:'audio/ogg',ext:'.ogg'}
  if (ascii(0,3)==='ID3' || (buffer[0]===0xff && (buffer[1]&0xe0)===0xe0 && (buffer[1]&0x06)!==0)) return {kind:'audio',mimeType:'audio/mpeg',ext:'.mp3'}
  if (ascii(4,8)==='ftyp') {
    const audio = ['M4A ','M4B '].includes(ascii(8,12))
    return {kind:audio?'audio':'video',mimeType:audio?'audio/mp4':'video/mp4',ext:audio?'.m4a':'.mp4'}
  }
  if (buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) && buffer.subarray(0,4096).includes(Buffer.from('webm'))) return {kind:'video',mimeType:'video/webm',ext:'.webm'}
  return null
}
export async function inspectFile(file: string) {
  const handle = await fs.promises.open(file, 'r')
  try { const buffer = Buffer.alloc(4096); const {bytesRead} = await handle.read(buffer,0,4096,0); return inspectMedia(buffer.subarray(0,bytesRead)) }
  finally { await handle.close() }
}
