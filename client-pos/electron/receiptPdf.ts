import { createCanvas } from '@napi-rs/canvas'
import { pathToFileURL } from 'url'

// Keep native ESM import: TypeScript's CommonJS rewrite cannot load PDF.js.
const importModule = new Function('url', 'return import(url)') as (url:string)=>Promise<any>
let pdfModule:Promise<any>|undefined

export function receiptPdfResourceDirectory(entry:string):string{
 const normalized=entry.replace(/\\/g,'/')
 if(!normalized.endsWith('/legacy/build/pdf.mjs'))throw Error('RECEIPT_PDF_RESOURCE_PATH_INVALID')
 return normalized.slice(0,-'legacy/build/pdf.mjs'.length)
}

/** CPU rasterization of Chromium's embedded-font PDF; never capture a GPU surface. */
export async function receiptPdfRaster(pdf:Buffer,width:number,height:number):Promise<Buffer>{
 if (![384,576].includes(width)||!Number.isInteger(height)||height<1||height>19000)throw Error('RECEIPT_SIZE_UNSUPPORTED')
 const entry=require.resolve('pdfjs-dist/legacy/build/pdf.mjs').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
 const resources=receiptPdfResourceDirectory(entry)
 const pdfjs=await (pdfModule??=importModule(pathToFileURL(entry).href))
 const task=pdfjs.getDocument({data:new Uint8Array(pdf),isEvalSupported:false,standardFontDataUrl:resources+'standard_fonts/',cMapUrl:resources+'cmaps/',cMapPacked:true,wasmUrl:resources+'wasm/'})
 try{
  const document=await task.promise
  if(document.numPages!==1)throw Error('RECEIPT_PDF_PAGINATED')
  const page=await document.getPage(1),viewport=page.getViewport({scale:96/72})
  if(Math.abs(viewport.width-width)>1||viewport.height<height)throw Error('RECEIPT_PDF_SIZE_MISMATCH')
  const canvas=createCanvas(width,height),context=canvas.getContext('2d')
  await page.render({canvasContext:context,viewport,background:'#ffffff'}).promise
  const chunks:Buffer[]=[Buffer.from([0x1b,0x61,0])],byteWidth=width/8
  for(let top=0;top<height;top+=800){
   const rows=Math.min(800,height-top),pixels=context.getImageData(0,top,width,rows).data,raster=Buffer.alloc(byteWidth*rows)
   for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4
    if(pixels[p+3]>=128&&.299*pixels[p]+.587*pixels[p+1]+.114*pixels[p+2]<170)raster[y*byteWidth+(x>>3)]|=1<<(7-(x&7))
   }
   chunks.push(Buffer.from([0x1d,0x76,0x30,0,byteWidth&255,byteWidth>>8,rows&255,rows>>8]),raster)
  }
  return Buffer.concat(chunks)
 }finally{await task.destroy()}
}
