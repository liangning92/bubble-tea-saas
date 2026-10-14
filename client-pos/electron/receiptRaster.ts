import { BrowserWindow, session, NativeImage } from 'electron'
import { receiptHtml, receiptWidth, ReceiptLayoutData } from './receiptLayout'

let window:BrowserWindow|null=null
let queue:Promise<unknown>=Promise.resolve()

function paintedFrame(target:BrowserWindow,width:number,height:number):Promise<NativeImage>{
 return new Promise((resolve,reject)=>{
  const contents=target.webContents
  const cleanup=()=>{clearTimeout(timer);contents.removeListener('paint',paint);contents.removeListener('render-process-gone',gone)}
  const paint=(_event:unknown,_dirty:unknown,image:NativeImage)=>{
   // Ignore an old resize frame. The paint API supplies the whole view bitmap.
   const size=image.getSize()
   if(image.isEmpty()||size.width!==width||size.height!==height)return
   cleanup();resolve(image)
  }
  const gone=()=>{cleanup();reject(Error('RECEIPT_RENDERER_EXITED'))}
  const timer=setTimeout(()=>{cleanup();reject(Error('RECEIPT_PAINT_TIMEOUT'))},4000)
  contents.on('paint',paint)
  contents.once('render-process-gone',gone)
  try{contents.invalidate()}catch(error){cleanup();reject(error)}
 })
}

/** Render the editor's HTML at printer dot width without compositor capturePage. */
export function renderTemplateReceipt(data:ReceiptLayoutData):Promise<Buffer>{
 const result=queue.then(async()=>{
  try{
   if(!window||window.isDestroyed()){
    const isolated=session.fromPartition('receipt-renderer')
    isolated.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:')}))
    window=new BrowserWindow({show:false,width:576,height:800,useContentSize:true,webPreferences:{session:isolated,offscreen:{useSharedTexture:false},nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}})
   }
   const target=window,width=receiptWidth(data.paperSize)
   target.setContentSize(width,800)
   await target.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(receiptHtml(data)))
   const height=await target.webContents.executeJavaScript('document.fonts.ready.then(()=>Math.ceil(document.getElementById("receipt").getBoundingClientRect().height))') as number
   if(!Number.isInteger(height)||height<1||height>20000)throw Error('RECEIPT_HEIGHT_UNSUPPORTED')
   const chunks:Buffer[]=[]
   for(let top=0;top<height;top+=800){
    const rows=Math.min(800,height-top)
    target.setContentSize(width,rows)
    await target.webContents.executeJavaScript(`new Promise(resolve=>{window.scrollTo(0,${top});requestAnimationFrame(()=>requestAnimationFrame(resolve))})`)
    // capturePage intermittently throws UnknownVizError on the store PC.
    // Offscreen paint gives us the frame directly, with no screenshot request.
    const image=await paintedFrame(target,width,rows)
    const pixels=image.resize({width,height:rows}).toBitmap(),byteWidth=width/8,raster=Buffer.alloc(byteWidth*rows)
    if(pixels.length!==width*rows*4)throw Error('RECEIPT_BITMAP_SIZE_MISMATCH')
    for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
     const p=(y*width+x)*4
     if(pixels[p+3]>=128&&.299*pixels[p+2]+.587*pixels[p+1]+.114*pixels[p]<170)raster[y*byteWidth+(x>>3)]|=1<<(7-(x&7))
    }
    chunks.push(Buffer.from([0x1d,0x76,0x30,0,byteWidth&255,byteWidth>>8,rows&255,rows>>8]),raster)
   }
   return Buffer.concat([Buffer.from([0x1b,0x61,0]),...chunks])
  }catch(error){
   // A failed compositor or renderer is discarded so later paid sales recover.
   window?.destroy();window=null
   throw error
  }
 })
 queue=result.catch(()=>{})
 return result
}
