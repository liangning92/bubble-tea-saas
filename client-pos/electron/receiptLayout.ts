/// <reference path="./receiptDeps.d.ts" />
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

export type ReceiptLayoutData = Record<string,any>
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const money=(value:unknown)=>'Rp '+Number(value||0).toLocaleString('id-ID')
const size=(value:unknown)=>value==='small'?20:value==='large'?32:24
export const receiptWidth=(paperSize:unknown)=>paperSize==='58mm'?384:576
const labels={
 zh:{queue:'取餐号',date:'日期',time:'时间',channel:'渠道',cashier:'收银员',customer:'顾客',items:'商品名称',qty:'数量',price:'金额',subtotal:'小计',tax:'税费',total:'合计',discount:'优惠',method:'付款方式',received:'实收',change:'找零'},
 en:{queue:'QUEUE NO',date:'Date',time:'Time',channel:'Channel',cashier:'Cashier',customer:'Customer',items:'ITEM',qty:'QTY',price:'AMOUNT',subtotal:'Subtotal',tax:'Tax',total:'TOTAL',discount:'Discount',method:'Payment',received:'Paid',change:'Change'},
 id:{queue:'NO. ANTREAN',date:'Tgl',time:'Jam',channel:'Kanal',cashier:'Kasir',customer:'Pelanggan',items:'ITEM',qty:'QTY',price:'HARGA',subtotal:'Subtotal',tax:'Pajak',total:'TOTAL',discount:'Diskon',method:'Metode',received:'Bayar',change:'Kembalian'}
}
const row=(name:unknown,value:unknown)=>`<div class="amount"><span>${escape(name)}</span><span>${escape(value)}</span></div>`
const line=(text:unknown)=>`<div class="line">${escape(text)}</div>`
function qrSvg(content:string,dots:number):string {
 const qr=QRCode.create(content,{errorCorrectionLevel:'M'}),n=qr.modules.size,margin=4
 let cells=''
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.modules.data[y*n+x])cells+=`M${x+margin},${y+margin}h1v1h-1z`
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${dots}" height="${dots}" viewBox="0 0 ${n+8} ${n+8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${cells}" fill="black"/></svg>`
}
function barcodeSvg(text:string,type:string,height:number,available:number):string {
 const sink:{encodings?:{data:string;text:string;options:Record<string,any>}[]}={}
 JsBarcode(sink,text,{format:type==='code39'?'CODE39':'CODE128',displayValue:false,width:1,height,margin:0})
 const bits=(sink.encodings||[]).map(e=>e.data).join(''),moduleWidth=Math.max(1,Math.floor((available-20)/bits.length)),width=bits.length*moduleWidth+20
 if(width>available)throw Error('BARCODE_TOO_WIDE')
 const bars=Array.from(bits).map((bit,x)=>bit==='1'?`<rect x="${10+x*moduleWidth}" y="0" width="${moduleWidth}" height="${height}"/>`:'').join('')
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${bars}</g></svg>`
}
export function receiptHtml(data:ReceiptLayoutData):string {
 const width=receiptWidth(data.paperSize),available=width-32,L=labels[data.language as keyof typeof labels]||labels.id
 const blocks=Array.isArray(data.blocks)?data.blocks:data.template?.blocks
 if(!Array.isArray(blocks))throw Error('RECEIPT_TEMPLATE_REQUIRED')
 const date=new Date(data.orderDate||data.createdAt||Date.now())
 const dateText=date.toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'}),timeText=date.toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour12:false})
 let body=data.copyLabel&&data.printCopies>1?line(data.copyLabel):''
 for(const b of [...blocks].filter(b=>b&&b.enabled!==false).sort((a,b)=>(a.order||0)-(b.order||0))){
  const c=b.config||{},st=b.style||{},align=['left','center','right'].includes(st.align)?st.align:'center'
  let content=''
  switch(b.type){
   case 'logo':{const url=c.url||data.storeLogo;if(url)content=`<img alt="" src="${escape(url)}" style="width:${Math.min(available,Math.max(1,Number(c.width)||100)*2)}px"/>`;break}
   case 'header':content=line(c.text??data.header??data.storeName??'YOUME');break
   case 'storeInfo':if(c.showPhone)content+=line('Tel: '+(c.phone||data.storePhone||''));if(c.showAddress)content+=line(c.address||data.storeAddress||'');break
   case 'orderInfo':
    if(c.showPickupNumber!==false&&data.pickupNumber)content+=line(`*** ${L.queue}: ${data.pickupNumber} ***`)
    if(c.showOrderNo!==false&&data.orderNum)content+=line('NO. '+data.orderNum)
    if(c.showDate)content+=line(`${L.date}: ${dateText}`)
    if(c.showTime)content+=line(`${L.time}: ${timeText}`)
    if(c.showChannel)content+=line(`${L.channel}: ${data.channelName||''}${data.tableNumber?' ('+data.tableNumber+')':''}`)
    if(c.showCashier)content+=line(`${L.cashier}: ${data.cashierName||''}`)
    if(c.showCustomer)content+=line(`${L.customer}: ${data.customerName||'-'}`)
    break
   case 'items':{
    if(c.showQtyPriceHeader)content+=`<div class="item-grid">${line(L.items)}${line(L.qty)}${line(L.price)}</div>`
    else if(c.showHeader!==false)content+='<div class="item-header">'+escape(L.items)+'</div>'
    const items:ReceiptLayoutData[]=[]
    for(const original of data.items||[]){const item={...original};const key=JSON.stringify([item.productName,item.specName,item.unitPrice,item.addons,item.sugarLevelName,item.iceLevelName,item.note]);const existing=c.groupByProduct?items.find(i=>i.key===key):null;if(existing)existing.quantity+=item.quantity;else items.push({...item,key})}
    for(const item of items){
     const name=(item.productName||'')+(item.specName?' '+item.specName:'')
     if(c.showQtyPriceHeader)content+=`<div class="item-grid">${line(name)}${line(item.quantity)}${line(money(item.unitPrice*item.quantity))}</div>`
     else content+=row((item.quantity>1?item.quantity+' × ':'')+name,money(item.unitPrice*item.quantity))
     const details:string[]=[]
     if(c.showSugarIce){const mods=[item.sugarLevelName,item.iceLevelName].filter(Boolean).join(', ');if(mods)details.push('['+mods+']')}
     if(c.showAddon)for(const addon of item.addons||[])details.push('+ '+(addon.name||addon))
     content+='<div class="item-details">'
     if(c.itemFormat==='compact'&&details.length)content+=line(details.join(' '));else content+=details.map(line).join('')
     if(c.showNote&&item.note)content+=line(item.note)
     content+='</div>'
    }break
   }
   case 'summaryRows':content=(c.rows||[]).map((r:any)=>`<div class="summary-row${r.emphasis?' emphasis':''}${c.metadata?' metadata':''}">${row(r.name,r.value)}${r.note?`<div class="summary-note">${escape(r.note)}</div>`:''}</div>`).join('');break
   case 'signatures':content=`<div class="signature-grid" style="grid-template-columns:repeat(${Math.min(2,Math.max(1,(c.labels||[]).length))},minmax(0,1fr))">${(c.labels||[]).map((name:unknown)=>`<div><div class="signature-line"></div>${line(name)}</div>`).join('')}</div>`;break
   case 'subtotal':content=row(c.subtotalLabel||L.subtotal,money(data.subtotal));break
   case 'tax':content=row(c.label||(c.rate&&c.showRate!==false?`${L.tax} (${c.rate}%)`:L.tax),money(data.tax));break
   case 'total':if(data.discount>0){content+=row(c.discountLabel||L.discount,'-'+money(data.discount));if(c.showDiscountDetail!==false&&(data.promotionName||data.discountNote))content+=line(data.promotionName||data.discountNote)}content+=row(c.totalLabel||L.total,money(data.total));break
   case 'paymentInfo':if(c.showMethod)content+=row(L.method,data.paymentMethod||'');if(c.showReceived)content+=row(L.received,money(data.paidAmount));if(c.showChange)content+=row(L.change,money(data.change));break
   case 'footer':if(c.showDivider)content+='<hr class="dashed"/>';content+=line(c.footerText??data.footer??'');break
   case 'customText':content=line(c.customText??c.text??'');break
   case 'divider':content=c.dividerStyle==='space'?'<div style="height:24px"></div>':c.dividerStyle==='stars'?line('*'.repeat(Math.floor(available/size(st.fontSize)))):`<hr class="${c.dividerStyle==='dashed'?'dashed':''}"/>`;break
   case 'qrCode':{const dots=Math.min(available,Math.max(40,(Number(c.size)||80)*2));const source=c.url||c.qrContent||data.qrCodeUrl||'';if(source)content=(c.url||data.qrCodeUrl)?`<img alt="QR" src="${escape(source)}" style="width:${dots}px;height:${dots}px"/>`:qrSvg(source,dots);break}
   case 'barcode':if(data.orderNum)content=barcodeSvg(String(data.orderNum),c.barcodeType,Math.max(20,(Number(c.height)||40)*2),available)+line(data.orderNum);break
  }
  body+=`<section data-block="${escape(b.type)}" style="font-size:${size(st.fontSize)}px;font-weight:${st.bold?700:400};text-align:${align}">${content}</section>`
 }
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline';"><style>
 *{box-sizing:border-box}html{scrollbar-width:none}::-webkit-scrollbar{display:none}html,body{margin:0;padding:0;width:${width}px;background:#fff;color:#000}body{padding:12px 16px;font-family:Arial,'Microsoft YaHei','Noto Sans CJK SC',sans-serif;font-size:24px;line-height:1.35;font-variant-numeric:tabular-nums}section{margin:0;padding:0;break-inside:avoid} .line{white-space:pre-wrap;overflow-wrap:anywhere} .amount{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}.amount span:first-child{text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}.amount span:last-child{white-space:nowrap;text-align:right} .item-grid{display:grid;grid-template-columns:minmax(0,1fr) 10% 35%;gap:8px}.item-grid>*:last-child{text-align:right;white-space:nowrap}.item-grid>*:first-child{text-align:left}.item-grid>*:nth-child(2){text-align:center}.item-header{text-align:left}.item-details{text-align:left;padding-left:16px;font-weight:400;font-size:.8333333333em;margin:2px 0 8px}section[data-block="items"]{padding:4px 0}section[data-block="total"]{padding:4px 0}section[data-block="footer"]{padding-top:8px}.summary-row{padding:4px 0}.summary-row.emphasis{font-size:28px;font-weight:700;border-top:2px solid #000;margin-top:6px;padding-top:8px}.summary-row.metadata .amount{grid-template-columns:38% minmax(0,1fr)}.summary-row.metadata .amount span:last-child{white-space:pre-wrap;overflow-wrap:anywhere}.summary-note{text-align:left;font-size:20px;margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere}.signature-grid{display:grid;gap:24px;text-align:center;padding:44px 0 12px}.signature-line{border-bottom:2px solid #000;margin-bottom:8px}hr{margin:12px 0;border:0;border-top:2px solid #000}hr.dashed{border-top-style:dashed}img,svg{display:inline-block;max-width:100%;vertical-align:top}svg{shape-rendering:crispEdges}
 </style></head><body id="receipt">${body}</body></html>`
}
