import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import sharp from 'sharp'

// One stored rendition works at native 4K landscape/portrait sizes. No crop/upscale.
export const IMAGE_MAX_EDGE = 3840
export const IMAGE_PHOTO_QUALITY = 86
const SMALL_IMAGE_BYTES = 80 * 1024
const MAX_INPUT_PIXELS = 64_000_000
// Bound native decode work across simultaneous requests, not only within a batch.
let active = false
const waiting: Array<() => void> = []
async function withEncoder<T>(work: () => Promise<T>): Promise<T> {
  if (active) await new Promise<void>(resolve => waiting.push(resolve))
  else active = true
  try { return await work() }
  finally { const next = waiting.shift(); if (next) next(); else active = false }
}
export type ImageEncoding = {kind:string;mimeType:string;ext:string}
export type OptimizedImage = {type:ImageEncoding;size:number;originalSize:number;optimized:boolean}

// PNG decoders may expose APNG as one page. The animation control chunk must
// precede IDAT, so inspect chunk headers without decoding/preserving extra copies.
async function animatedPng(file:string,size:number):Promise<boolean> {
  const handle=await fs.promises.open(file,'r')
  try {
    const header=Buffer.alloc(8);let offset=8
    while(offset+12<=size){
      const {bytesRead}=await handle.read(header,0,8,offset);if(bytesRead!==8)return false
      const length=header.readUInt32BE(0),name=header.subarray(4,8).toString('ascii')
      if(offset+12+length>size)return false
      if(name==='acTL')return true
      if(name==='IDAT'||name==='IEND')return false
      offset+=12+length
    }
    return false
  } finally {await handle.close()}
}

// Replace the pending file atomically; MediaService owns all persistence/cleanup.
export async function optimizeUploadedImage(file: string, type: ImageEncoding): Promise<OptimizedImage> {
  const size = (await fs.promises.stat(file)).size
  const original = {type,size,originalSize:size,optimized:false}
  if (type.kind !== 'image') return original
  return withEncoder(async () => {
    let temporary: string | undefined
    try {
      if(type.mimeType==='image/png'&&await animatedPng(file,size))return original
      const metadata = await sharp(file,{limitInputPixels:MAX_INPUT_PIXELS}).metadata()
      // WebP is 8-bit: preserve high-bit-depth/HDR originals and their gain maps.
      if (metadata.depth !== 'uchar' || metadata.gainMap) return original
      // Preserve frame timing/looping and avoid lossy-to-lossy recompression.
      if ((metadata.pages || 1) > 1) return original
      const large = Math.max(metadata.width || 0, metadata.height || 0) > IMAGE_MAX_EDGE
      if (!large && (size <= SMALL_IMAGE_BYTES || metadata.format === 'webp')) return original
      const lossless = metadata.format === 'png' || metadata.format === 'gif' || !!metadata.hasAlpha
      const output = await sharp(file,{limitInputPixels:MAX_INPUT_PIXELS})
        .rotate()
        .resize({width:IMAGE_MAX_EDGE,height:IMAGE_MAX_EDGE,fit:'inside',withoutEnlargement:true})
        .toColourspace('srgb')
        .webp({quality:IMAGE_PHOTO_QUALITY,alphaQuality:100,lossless,effort:4,smartSubsample:true})
        .timeout({seconds:20})
        .toBuffer()
      // Do not store an extra original or a larger re-encoded copy.
      if (output.length >= size || (!large && output.length > size * 0.95)) return original
      temporary = path.join(path.dirname(file),`.optimized-${randomUUID()}`)
      await fs.promises.writeFile(temporary,output,{flag:'wx'})
      await fs.promises.rename(temporary,file)
      temporary = undefined
      return {type:{kind:'image',mimeType:'image/webp',ext:'.webp'},size:output.length,originalSize:size,optimized:true}
    } catch (error:any) {
      // Valid original uploads remain usable if encoding is unavailable or bounded.
      // No database row or image reference is ever updated until the replacement succeeds.
      console.warn('Image optimization retained original:',error?.code || 'ENCODING_UNAVAILABLE')
      return original
    } finally { if (temporary) await fs.promises.unlink(temporary).catch(()=>{}) }
  })
}
