import { BrowserWindow, session } from 'electron'
import { receiptHtml, receiptWidth, ReceiptLayoutData } from './receiptLayout'
import { receiptPdfRaster } from './receiptPdf'

let queue:Promise<unknown>=Promise.resolve()

async function renderOnce(data:ReceiptLayoutData):Promise<Buffer>{
 const isolated=session.fromPartition('receipt-renderer')
 isolated.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:')}))
 const width=receiptWidth(data.paperSize)
 const target=new BrowserWindow({show:false,width,height:800,useContentSize:true,webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}})
 let timer:ReturnType<typeof setTimeout>|undefined
 try{
  const render=async()=>{
   await target.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(receiptHtml(data)))
   const height=await target.webContents.executeJavaScript(`(async()=>{
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(image=>image.decode()));
    return Math.ceil(document.getElementById('receipt').getBoundingClientRect().height);
   })()`) as number
   if(!Number.isInteger(height)||height<1||height>19000)throw Error('RECEIPT_SIZE_UNSUPPORTED')
   const pdf=await target.webContents.printToPDF({printBackground:true,pageSize:{width:width/96,height:(height+4)/96},margins:{top:0,bottom:0,left:0,right:0},scale:1,preferCSSPageSize:false})
   return receiptPdfRaster(pdf,width,height)
  }
  return await Promise.race([render(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('RECEIPT_RENDER_TIMEOUT')),8000)})])
 }finally{if(timer)clearTimeout(timer);if(!target.isDestroyed())target.destroy()}
}

/** Preserve the template, but avoid capturePage, offscreen paint and animation frames. */
export function renderTemplateReceipt(data:ReceiptLayoutData):Promise<Buffer>{
 const result=queue.then(async()=>{
  try{return await renderOnce(data)}catch(error){
   // Only retry transient rendering before any printer transport is called.
   if(/RECEIPT_(SIZE_UNSUPPORTED|PDF_PAGINATED|PDF_SIZE_MISMATCH)|BARCODE_TOO_WIDE|RECEIPT_TEMPLATE_REQUIRED/.test(String(error)))throw error
   return renderOnce(data)
  }
 })
 queue=result.catch(()=>{})
 return result
}
