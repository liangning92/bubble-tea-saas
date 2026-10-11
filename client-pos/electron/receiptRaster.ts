import { BrowserWindow, session } from 'electron'
import { receiptHtml, receiptWidth, ReceiptLayoutData } from './receiptLayout'

let window:BrowserWindow|null=null
let queue:Promise<unknown>=Promise.resolve()
/** Capture the same HTML used by the editor at the printer's actual dot width. */
export function renderTemplateReceipt(data:ReceiptLayoutData):Promise<Buffer>{
 const result=queue.then(async()=>{
  if(!window||window.isDestroyed()){
   const isolated=session.fromPartition('receipt-renderer')
   isolated.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:')}))
   window=new BrowserWindow({show:false,width:576,height:800,useContentSize:true,webPreferences:{session:isolated,offscreen:true,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}})
  }
  const target=window,width=receiptWidth(data.paperSize)
  target.setContentSize(width,800)
  await target.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(receiptHtml(data)))
  const height=await target.webContents.executeJavaScript('document.fonts.ready.then(()=>Math.ceil(document.getElementById("receipt").getBoundingClientRect().height))') as number
  if(!Number.isInteger(height)||height<1||height>20000)throw Error('RECEIPT_HEIGHT_UNSUPPORTED')
  const chunks:Buffer[]=[]
  // Bounded strips avoid GPU texture limits for long receipts. No feed between strips.
  for(let top=0;top<height;top+=800){
   const rows=Math.min(800,height-top)
   target.setContentSize(width,rows)
   await target.webContents.executeJavaScript(`new Promise(resolve=>{window.scrollTo(0,${top});requestAnimationFrame(()=>requestAnimationFrame(resolve))})`)
   const image=await target.webContents.capturePage({x:0,y:0,width,height:rows},{stayHidden:true,stayAwake:true})
   const pixels=image.resize({width,height:rows}).toBitmap(),byteWidth=width/8,raster=Buffer.alloc(byteWidth*rows)
   for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4
    if(pixels[p+3]>=128&&.299*pixels[p+2]+.587*pixels[p+1]+.114*pixels[p]<170)raster[y*byteWidth+(x>>3)]|=1<<(7-(x&7))
   }
   chunks.push(Buffer.from([0x1d,0x76,0x30,0,byteWidth&255,byteWidth>>8,rows&255,rows>>8]),raster)
  }
  return Buffer.concat([Buffer.from([0x1b,0x61,0]),...chunks])
 })
 queue=result.catch(()=>{})
 return result
}
