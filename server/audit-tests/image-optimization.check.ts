import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { deflateSync } from 'zlib'
import sharp from 'sharp'
import { optimizeUploadedImage, IMAGE_MAX_EDGE } from '../src/utils/imageOptimization'
const jpg={kind:'image',mimeType:'image/jpeg',ext:'.jpg'},png={kind:'image',mimeType:'image/png',ext:'.png'}
async function fixture(buffer:Buffer,type=jpg) {
 const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),'image-optimization-'))
 const file=path.join(root,'pending');await fs.promises.writeFile(file,buffer)
 const result=await optimizeUploadedImage(file,type)
 return {root,file,result,stored:await fs.promises.readFile(file),close:()=>fs.promises.rm(root,{recursive:true,force:true})}
}
function photo(width:number,height:number){
 const pixels=Buffer.alloc(width*height*3);let seed=42
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=((seed>>>24)%21)-10,offset=(y*width+x)*3
  pixels[offset]=Math.max(0,Math.min(255,30+x/width*180+noise));pixels[offset+1]=Math.max(0,Math.min(255,40+y/height*170+noise));pixels[offset+2]=Math.max(0,Math.min(255,90+(x+y)/(width+height)*80+noise))
 }return sharp(pixels,{raw:{width,height,channels:3}})
}
test('photo is smaller, retains native resolution and measured detail',async()=>{
 const input=await photo(2560,1440).jpeg({quality:98,chromaSubsampling:'4:4:4'}).toBuffer()
 const f=await fixture(input)
 try{
  assert.ok(f.result.optimized);assert.equal(f.result.type.mimeType,'image/webp');assert.equal(f.result.size,f.stored.length);assert.ok(f.stored.length<input.length*0.8)
  const meta=await sharp(f.stored).metadata();assert.equal(meta.width,2560);assert.equal(meta.height,1440)
  const original=await sharp(input).removeAlpha().raw().toBuffer(),actual=await sharp(f.stored).removeAlpha().raw().toBuffer();assert.equal(actual.length,original.length)
  let total=0;for(let i=0;i<actual.length;i++)total+=(actual[i]-original[i])**2
  const psnr=10*Math.log10(255**2/(total/actual.length));assert.ok(psnr>=32,`quality PSNR ${psnr}`)
  console.log(JSON.stringify({sample:'2560x1440 photo',before:input.length,after:f.stored.length,savedPercent:Math.round((1-f.stored.length/input.length)*100),psnr:Number(psnr.toFixed(1))}))
  assert.deepEqual(await fs.promises.readdir(f.root),['pending'])
 }finally{await f.close()}
})
test('large landscape and portrait images fit 4K without cropping or upscaling',async()=>{
 for(const [width,height]of [[5120,2880],[2880,5120]]){
  const input=await photo(width,height).jpeg({quality:95}).toBuffer(),f=await fixture(input)
  try{const meta=await sharp(f.stored).metadata();assert.ok(f.result.optimized);assert.equal(Math.max(meta.width!,meta.height!),IMAGE_MAX_EDGE);assert.equal(Math.min(meta.width!,meta.height!),2160)}finally{await f.close()}
 }
})
test('transparent PNG/text-like graphics remain pixel-exact with lossless encoding',async()=>{
 const width=900,height=600,pixels=Buffer.alloc(width*height*4)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const offset=(y*width+x)*4,edge=(x%40===0||y%40===0);pixels[offset]=edge?0:255;pixels[offset+1]=edge?0:255;pixels[offset+2]=edge?0:255;pixels[offset+3]=x<450?255:96}
 const input=await sharp(pixels,{raw:{width,height,channels:4}}).png({compressionLevel:0}).toBuffer(),f=await fixture(input,png)
 try{assert.ok(f.result.optimized);assert.equal(f.result.type.ext,'.webp');assert.deepEqual(await sharp(f.stored).ensureAlpha().raw().toBuffer(),pixels);assert.ok((await sharp(f.stored).metadata()).hasAlpha)}finally{await f.close()}
})
test('small and already optimized images are not recompressed or enlarged',async()=>{
 const input=await sharp({create:{width:160,height:90,channels:4,background:'#abcdef80'}}).webp({lossless:true}).toBuffer()
 const f=await fixture(input,{kind:'image',mimeType:'image/webp',ext:'.webp'})
 try{assert.ok(!f.result.optimized);assert.deepEqual(f.stored,input);assert.equal((await sharp(f.stored).metadata()).width,160)}finally{await f.close()}
})
test('animated GIF preserves frames and animation timing',async()=>{
 const input=await sharp({create:{width:60,height:80,channels:4,background:'#ff0000'}}).raw().toBuffer()
 for(let i=60*40*4;i<input.length;i+=4){input[i]=0;input[i+2]=255}
 const gif=await sharp(input,{raw:{width:60,height:80,channels:4,pageHeight:40}}).gif({delay:[100,200],loop:0}).toBuffer()
 const f=await fixture(gif,{kind:'image',mimeType:'image/gif',ext:'.gif'})
 try{assert.ok(!f.result.optimized);assert.deepEqual(f.stored,gif);assert.equal((await sharp(f.stored,{animated:true}).metadata()).pages,2)}finally{await f.close()}
})
test('EXIF rotation is applied before stripping orientation metadata',async()=>{
 const input=await photo(1600,900).jpeg({quality:98}).withMetadata({orientation:6}).toBuffer(),f=await fixture(input)
 try{assert.ok(f.result.optimized);const meta=await sharp(f.stored).metadata();assert.equal(meta.width,900);assert.equal(meta.height,1600);assert.equal(meta.orientation,undefined)}finally{await f.close()}
})
test('non-images and encoder failures retain the original without temporary files',async()=>{
 for(const [input,type]of [[Buffer.from('unmodified video'),{kind:'video',mimeType:'video/mp4',ext:'.mp4'}],[Buffer.from('invalid image'),png]] as const){const f=await fixture(input,type);try{assert.ok(!f.result.optimized);assert.deepEqual(f.stored,input);assert.deepEqual(await fs.promises.readdir(f.root),['pending'])}finally{await f.close()}}
})

test('animated PNG is not flattened even when the decoder exposes only its first page',async()=>{
 const chunk=(name:string,payload:Buffer)=>{
  const type=Buffer.from(name),body=Buffer.concat([type,payload]);let crc=0xffffffff
  for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
  const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(payload.length);tail.writeUInt32BE((crc^0xffffffff)>>>0)
  return Buffer.concat([head,body,tail])
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6
 const control=Buffer.alloc(8);control.writeUInt32BE(2,0)
 const frame=(sequence:number)=>{const b=Buffer.alloc(26);b.writeUInt32BE(sequence,0);b.writeUInt32BE(1,4);b.writeUInt32BE(1,8);b.writeUInt16BE(1,20);b.writeUInt16BE(10,22);return b}
 const sequence=Buffer.alloc(4);sequence.writeUInt32BE(2)
 const input=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('tEXt',Buffer.from('Comment\0'+'A'.repeat(90*1024))),chunk('acTL',control),chunk('fcTL',frame(0)),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('fcTL',frame(1)),chunk('fdAT',Buffer.concat([sequence,deflateSync(Buffer.from([0,0,0,255,255]))])),chunk('IEND',Buffer.alloc(0))])
 const f=await fixture(input,png);try{assert.ok(!f.result.optimized);assert.deepEqual(f.stored,input)}finally{await f.close()}
})

test('16-bit PNG is retained rather than quantized to 8-bit WebP',async()=>{
 const input=await sharp({create:{width:800,height:600,channels:3,background:'#aa88cc'}}).toColourspace('rgb16').png({compressionLevel:0}).toBuffer()
 assert.equal((await sharp(input).metadata()).depth,'ushort')
 const f=await fixture(input,png);try{assert.ok(!f.result.optimized);assert.deepEqual(f.stored,input)}finally{await f.close()}
})
