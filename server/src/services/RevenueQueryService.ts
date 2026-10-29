import { saleLines } from '../utils/productInsights'
import { DEFAULT_EXPENSE_CATEGORIES } from './ExpenseService'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { loadStoreDateSettings } from '../utils/storeDateSettings'
import { businessCalendarDate, revenuePeriodRange, RevenueDateError } from '../utils/revenueDateRange'
import { netReceivedAmount } from '../utils/refundAllocation'
import { requireVerifiedReceiptIncome } from './ReceiptFinancialEvidenceService'
import { getHandoverReceipts } from './ShiftManualReceipts'

type DB = Pick<PrismaClient, 'order' | 'refundRequest' | 'expense' | 'config' | 'channel' | 'shift' | 'shiftSession' | 'staff' | 'user'>
type Label = { name: string; nameZh?: string | null; nameId?: string | null }
export type QueryOption = Label & { value: string; group: string; paymentFilter: boolean; channelFilter: boolean; labelKey?: string }
export class RevenueQueryError extends Error { constructor(message: string, public status = 400) { super(message) } }
const filterSchema = z.object({ period: z.enum(['today','yesterday','week','month','custom']).default('today'), startDate:z.string().optional(), endDate:z.string().optional(), dataset:z.string().max(200).default('net'), paymentMethod:z.string().max(100).optional(), channelId:z.string().max(100).optional(), page:z.coerce.number().int().min(1).max(100000).default(1) })
export type RevenueQueryFilter = z.infer<typeof filterSchema>
export type RevenueQueryRow = { id:string; kind:string; date:Date; associationAt:Date; amount:number|null; reference:string; items?:{productName:string;quantity:number}[]; paymentMethod:string|null; channelId:string|null; channel:Label|null; category:string|null; sessionId:string|null; source:string; dateBasis:string; legacyDate:boolean }
const option = (value:string,group:string,labelKey:string,paymentFilter=false,channelFilter=false):QueryOption=>({value,group,labelKey,name:labelKey,paymentFilter,channelFilter})

export async function revenueQueryOptions(db:DB,storeId:string,canRefund=true) {
 const [methods,channels,expenseRows,categoryConfig,paymentConfig]=await Promise.all([
  db.order.findMany({where:{storeId},distinct:['paymentMethod'],select:{paymentMethod:true}}),
  db.channel.findMany({where:{storeId},orderBy:{name:'asc'},select:{id:true,name:true}}),
  db.expense.findMany({where:{storeId},distinct:['category'],select:{category:true}}),
  db.config.findUnique({where:{storeId_key:{storeId,key:'expense.categories'}},select:{value:true}}),
  db.config.findMany({where:{storeId,key:{in:['pos.paymentMethods','paymentMethods','pos.payment.methods','payment.methods']}},select:{value:true}})
 ])
 const payments=new Set(['cash','qris',...methods.map(m=>m.paymentMethod)])
 for(const row of paymentConfig)try{const p=JSON.parse(row.value);if(p&&typeof p==='object'&&!Array.isArray(p)){for(const [key,enabled] of Object.entries(p))if(enabled===true && (payments.has(key)||['cash','qris','gopay','ovo','dana','shopeepay','debit','member','credit','bank_transfer','transfer'].includes(key)))payments.add(key)};if(Array.isArray(p))for(const method of p){const key=typeof method==='string'?method:method?.key;if(typeof key==='string')payments.add(key)}}catch{}
 let categories:{key:string;label?:string;labelEn?:string;labelZh?:string;labelId?:string}[]=DEFAULT_EXPENSE_CATEGORIES
 try{if(categoryConfig?.value){const parsed=JSON.parse(categoryConfig.value);if(Array.isArray(parsed))categories=parsed.filter(c=>typeof c?.key==='string')}}catch{}
 const categoryKeys=new Set([...categories.map(c=>c.key),...expenseRows.map(e=>e.category)])
 const datasets:QueryOption[]=[option('net','revenue','net',true,true),option('orders','revenue','orders',true,true),option('grossProfit','revenue','grossProfit',true,true),...([...payments].sort().map(key=>({...option('payment:'+key,'payment','payment',false,true),name:key}))),
  {...option('channel:none','channel','pos',true,false),name:'POS'},...channels.map(c=>({...option('channel:'+c.id,'channel','channel',true,false),name:c.name})),option('manual:shopeefood','channel','shopeefood'),option('manual:gofood','channel','gofood'),
  ...(canRefund?[option('refund','refund','refund',true,true)]:[]),option('expense','expense','expense'),...([...categoryKeys].sort().map(key=>{const c=categories.find(c=>c.key===key);return {...option('expense:'+key,'expense','category'),name:c?.labelEn||c?.label||key,nameZh:c?.labelZh,nameId:c?.labelId}})),
  option('drawer','handover','drawer'),option('manual:cash','handover','manualCash'),option('manual:qris','handover','manualQris')]
 return {datasets,payments:[...payments].sort(),channels:[{id:'none',name:'POS'},...channels],canRefund}
}

export async function revenueQuery(db:DB,storeId:string,input:unknown,canRefund=true,now=new Date(),verifyIncome=requireVerifiedReceiptIncome) {
 const parsed=filterSchema.safeParse(input);if(!parsed.success)throw new RevenueQueryError('INVALID_REVENUE_QUERY')
 const filter=parsed.data,settings=await loadStoreDateSettings(db,storeId),options=await revenueQueryOptions(db,storeId,canRefund),selected=options.datasets.find(o=>o.value===filter.dataset)
 if(!selected)throw new RevenueQueryError('INVALID_QUERY_DATASET')
 if((filter.paymentMethod && (!selected.paymentFilter||!options.payments.includes(filter.paymentMethod)))||(filter.channelId && (!selected.channelFilter||!options.channels.some(c=>c.id===filter.channelId))))throw new RevenueQueryError('INVALID_QUERY_FILTER')
 if(filter.period==='custom'&&(!/^\d{4}-\d{2}-\d{2}$/.test(filter.startDate||'')||!/^\d{4}-\d{2}-\d{2}$/.test(filter.endDate||'')))throw new RevenueQueryError('INVALID_QUERY_DATES')
 const range=revenuePeriodRange(filter,now,'today',settings.timezone),startDate=businessCalendarDate(range.start,settings.timezone),endDate=businessCalendarDate(range.end,settings.timezone)
 if((Date.parse(endDate)-Date.parse(startDate))/86400000>=366)throw new RevenueQueryError('QUERY_RANGE_TOO_LARGE')
 const payment=filter.dataset.startsWith('payment:')?filter.dataset.slice(8):filter.paymentMethod
 const channel=filter.dataset.startsWith('channel:')?filter.dataset.slice(8):filter.channelId
 const orderFilter={storeId,...(payment?{paymentMethod:payment}:{}),...(channel?{channelId:channel==='none'?null:channel}:{})}
 const rows:RevenueQueryRow[]=[]
 const base=(id:string,kind:string,date:Date,amount:number|null,reference:string):RevenueQueryRow=>({id,kind,date,associationAt:date,amount,reference,paymentMethod:null,channelId:null,channel:null,category:null,sessionId:null,source:kind,dateBasis:kind==='order'?'orderAt':kind==='expense'?'expenseDate':kind==='refund'?'approvedAt':'closedAt',legacyDate:false})
 if(['net','orders'].includes(filter.dataset)||filter.dataset.startsWith('payment:')||filter.dataset.startsWith('channel:')){
  const orders=await db.order.findMany({where:{...orderFilter,status:{in:['completed','paid']},createdAt:{gte:range.start,lte:range.end}},include:{items:{select:{productName:true,quantity:true}},channel:true,refundRequests:{where:{status:{in:['approved','paid']}}}},orderBy:{createdAt:'desc'}})
  await verifyIncome(orders)
  for(const o of orders)rows.push({...base(o.id,'order',o.createdAt,netReceivedAmount(o),o.orderNumber),items:o.items,paymentMethod:o.paymentMethod,channelId:o.channelId,channel:o.channel})
 }
 if(filter.dataset==='grossProfit'){
  const orders=await db.order.findMany({where:{...orderFilter,status:{in:['completed','paid','refunded']},createdAt:{gte:range.start,lte:range.end}},include:{items:true,channel:true,refundRequests:{where:{status:{in:['approved','paid']}}}},orderBy:{createdAt:'desc'}})
  await verifyIncome(orders)
  for(const o of orders){
   const lines=saleLines(o)
   const known=lines.length>0&&lines.every(line=>line.costKnown&&line.evidence&&Number.isFinite(line.cost)&&Number.isFinite(line.revenue))
   const amount=known?lines.reduce((total,line)=>total+line.revenue-line.cost,0):null
   rows.push({...base(o.id,'order',o.createdAt,amount,o.orderNumber),items:o.items,paymentMethod:o.paymentMethod,channelId:o.channelId,channel:o.channel})
  }
 }
 if(filter.dataset==='refund'){
  const refunds=await db.refundRequest.findMany({where:{order:orderFilter,status:{in:['approved','paid']},OR:[{approvedAt:{gte:range.start,lte:range.end}},{approvedAt:null,createdAt:{gte:range.start,lte:range.end}}]},include:{order:{include:{items:{select:{productName:true,quantity:true}},channel:true}}},orderBy:{createdAt:'desc'}})
  await verifyIncome(refunds.map(r=>r.order))
  for(const r of refunds)rows.push({...base(r.id,'refund',r.approvedAt||r.createdAt,r.amount===0?r.order.finalAmount:r.amount,r.order.orderNumber),associationAt:r.order.createdAt,items:r.order.items,paymentMethod:r.order.paymentMethod,channelId:r.order.channelId,channel:r.order.channel,legacyDate:!r.approvedAt,dateBasis:r.approvedAt?'approvedAt':'legacyRequestedAt'})
 }
 if(filter.dataset==='expense'||filter.dataset.startsWith('expense:')){
  const expenses=await db.expense.findMany({where:{storeId,date:{gte:range.start,lte:range.end},...(filter.dataset.startsWith('expense:')?{category:filter.dataset.slice(8)}:{})},orderBy:{date:'desc'}})
  for(const e of expenses)rows.push({...base(e.id,'expense',e.date,e.amount/100,e.description),associationAt:e.cashOccurredAt||e.date,sessionId:e.paymentSource==='drawer_cash'&&!['purchase','purchase_refund'].includes(e.referenceType||'')?e.cashSessionId:null,source:e.referenceType||'expense',category:e.category,paymentMethod:e.paymentSource||'unknown'})
 }
 if(filter.dataset==='drawer'||filter.dataset.startsWith('manual:')||(filter.dataset==='net'&&!payment&&!channel)){
  const receipts=await getHandoverReceipts(db,storeId,range.start,range.end,settings.timezone)
  for(const r of receipts.list){
   const push=(key:'cash'|'qris'|'shopeefood'|'gofood')=>rows.push({...base(r.id+':'+key,'handover',r.closedAt!,r.manualReceipts?.[key]??null,r.shift),sessionId:r.id,source:'manual:'+key})
   if(filter.dataset==='drawer')rows.push({...base(r.id+':drawer','handover',r.closedAt!,r.actualCashReceived,r.shift),sessionId:r.id,source:'drawer'})
   else if(filter.dataset==='net'){if(r.onlineRevenueCounted){push('shopeefood');push('gofood')}}
   else {const key=filter.dataset.slice(7) as 'cash'|'qris'|'shopeefood'|'gofood';if(!['shopeefood','gofood'].includes(key)||r.onlineRevenueCounted)push(key)}
  }
 }
 const associationStart=new Date(rows.reduce((minimum,row)=>Math.min(minimum,row.associationAt.getTime()),range.start.getTime()))
 const sessions=await db.shiftSession.findMany({where:{storeId,openedAt:{lte:now},OR:[{closedAt:null},{closedAt:{gte:associationStart}}]},orderBy:{openedAt:'desc'}})
 const definitions=await db.shift.findMany({where:{storeId},select:{key:true,name:true,nameZh:true,nameId:true}})
 for(const row of rows)if(!row.sessionId&&row.kind!=='expense'){const matches=sessions.filter(s=>row.associationAt>=s.openedAt&&row.associationAt<(s.closedAt||now));if(matches.length===1)row.sessionId=matches[0].id}
 const showEmpty=(filter.dataset==='net'||filter.dataset==='orders')&&!payment&&!channel
 const matched=sessions.filter(s=>rows.some(r=>r.sessionId===s.id)||(showEmpty&&s.openedAt<=range.end&&(!s.closedAt||s.closedAt>=range.start)))
 const ids=matched.map(s=>s.staffId),[staff,users]=await Promise.all([db.staff.findMany({where:{storeId,OR:[{id:{in:ids}},{userId:{in:ids}}]},select:{id:true,userId:true,name:true}}),db.user.findMany({where:{storeId,id:{in:ids}},select:{id:true,role:true}})])
 const names=new Map<string,string>();for(const s of staff){names.set(s.id,s.name);names.set(s.userId,s.name)}for(const u of users)if(!names.has(u.id))names.set(u.id,u.role)
 const shifts=matched.map(s=>{const records=rows.filter(r=>r.sessionId===s.id);return {id:s.id,shift:s.shift,status:s.status,openedAt:s.openedAt,closedAt:s.closedAt,windowEnd:s.closedAt||now,opener:names.get(s.staffId)||'—',definition:definitions.find(d=>d.key===s.shift)||null,filteredAmount:records.reduce((n,r)=>n+(r.amount||0),0),filteredCount:records.length,missingCount:records.filter(r=>r.amount===null).length}})
 rows.sort((a,b)=>b.date.getTime()-a.date.getTime()||b.id.localeCompare(a.id))
 const groupMap=new Map<string,{key:string;label:Label|null;amount:number;count:number;missingCount:number}>()
 for(const row of rows){const key=row.kind==='order'||row.kind==='refund'?row.channelId||'none':row.category||row.source;const g=groupMap.get(key)||{key,label:row.channel,amount:0,count:0,missingCount:0};g.amount+=row.amount||0;g.count++;if(row.amount===null)g.missingCount++;groupMap.set(key,g)}
 const missingCount=rows.filter(r=>r.amount===null).length
 // Settlement view: discounts given away in the same window and scope as the selected revenue.
 const discountTotals=await db.order.aggregate({where:{...orderFilter,status:{in:['completed','paid']},createdAt:{gte:range.start,lte:range.end}},_sum:{discountAmount:true,activityDiscountAmount:true,couponDiscountAmount:true,pointsDiscountAmount:true,manualDiscountAmount:true}})
 const activityDiscount=discountTotals._sum.activityDiscountAmount||0,couponDiscount=discountTotals._sum.couponDiscountAmount||0,pointsDiscount=discountTotals._sum.pointsDiscountAmount||0,manualDiscount=discountTotals._sum.manualDiscountAmount||0
 const totalDiscount=(discountTotals._sum.discountAmount||0)+pointsDiscount
 return {filter,range:{startDate,endDate,timezone:settings.timezone},selected,asOf:now,summary:{amount:rows.reduce((n,r)=>n+(r.amount||0),0),count:rows.length,missingCount,legacyDateCount:rows.filter(r=>r.legacyDate).length,orderCount:rows.filter(r=>r.kind==='order').length,activityDiscount,couponDiscount,pointsDiscount,manualDiscount,totalDiscount},breakdown:[...groupMap.values()],rows:rows.slice((filter.page-1)*50,filter.page*50),pagination:{page:filter.page,pageSize:50,total:rows.length,pages:Math.max(1,Math.ceil(rows.length/50))},shifts,unassignedCount:rows.filter(r=>!r.sessionId&&r.kind!=='expense').length,storePaymentCount:rows.filter(r=>r.kind==='expense'&&!r.sessionId).length}
}
