import {backendAccountAccess} from './ManagementBackendRegistry'
import {todayStockOuts} from './TodayStockOutService'
import {revenueQuery,canReadRevenueRefunds} from './RevenueQueryService'
import {audienceAllows} from './teamAgentBridge/employeeAccess'

export type BusinessTopic='today_stock_out'|'today_revenue'|'marketing_setup'
// Exact, ordinary requests only. Quoted instructions, attachments and multi-step
// requests do not become privileged parameters. Unknown wording stays native.
export function storeBusinessTopic(text:string):BusinessTopic|undefined {
 const value=text.trim().replace(/[？?。！!]+$/u,'').replace(/\s+/g,' ').toLowerCase()
 if(/^(?:请)?(?:设置|创建|新建|安排)(?:一个)?(?:营销|促销)?活动$/.test(value)||/^(?:buat|atur)(?:kan)? (?:sebuah )?(?:promosi|kampanye)$/.test(value))return 'marketing_setup'
 if(/^(?:请)?(?:查询|查看|告诉我)?(?:今天|今日)(?:的)?(?:出库|出库情况|出库记录|出库了什么|出库了哪些原料|出库了哪些材料|登记的出库记录)$/.test(value)||/^(?:apa saja |laporan )?(?:pengeluaran bahan|stok keluar|bahan keluar|pengambilan bahan)(?: dari gudang)? hari ini$/.test(value))return 'today_stock_out'
 if(/^(?:请)?(?:查询|查看|告诉我)?(?:今天|今日)(?:的)?(?:营收|营收多少|营收情况|营业额|营业额多少|收入多少)$/.test(value)||/^(?:berapa )?(?:omzet|pendapatan|penjualan) hari ini$/.test(value))return 'today_revenue'
}
const definitions={marketing_setup:{operationId:'POST /api/marketing/activities',permission:'marketing.write'},today_stock_out:{operationId:'GET /api/inventory/logs/today-stock-out',permission:'inventory.read'},today_revenue:{operationId:'GET /api/revenue/query',permission:'dashboard.read'}} as const
export const topicDefinition=(topic:BusinessTopic)=>definitions[topic]
const stamp=(v:any,timezone:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(v))
export function renderBusinessTopic(topic:BusinessTopic,data:any,chinese:boolean):string {
 if(topic==='today_revenue'){
  if(!data?.summary||!Number.isSafeInteger(data.summary.amount)||data.summary.missingCount)throw Error('BUSINESS_TOPIC_EVIDENCE_INCOMPLETE')
  return chinese?`今日营收（后台净收入口径）：Rp ${data.summary.amount.toLocaleString('en-US')}。\n订单：${data.summary.orderCount} 笔。\n日期：${data.range.startDate}；时区：${data.range.timezone}。\n查询时间：${stamp(data.asOf,data.range.timezone)}。`:`Pendapatan hari ini (penerimaan bersih sesuai laporan): Rp ${data.summary.amount.toLocaleString('id-ID')}.\nPesanan: ${data.summary.orderCount}.\nTanggal: ${data.range.startDate}; zona waktu: ${data.range.timezone}.\nData per ${stamp(data.asOf,data.range.timezone)}.`
 }
 if(!Array.isArray(data?.groups)||typeof data.recordCount!=='number')throw Error('BUSINESS_TOPIC_EVIDENCE_INCOMPLETE')
 const lines=data.groups.flatMap((group:any)=>group.entries.map((entry:any)=>`${group.name} — ${entry.quantity} ${group.unit} — ${stamp(entry.createdAt,data.timezone)}`))
 return [chinese?`今日登记出库：${data.recordCount} 条（${data.date}，${data.timezone}）。`:`Pengambilan bahan terdaftar hari ini: ${data.recordCount} (${data.date}, ${data.timezone}).`,...lines.slice(0,30),...(lines.length>30?[chinese?'仅展示前 30 条，请在出库页面查看完整记录。':'Menampilkan 30 catatan pertama; lihat halaman stok keluar untuk daftar lengkap.']:[]),chinese?'仅含已登记的实物出库，不含销售自动消耗。':'Hanya pengambilan fisik terdaftar; tidak termasuk pemakaian otomatis dari penjualan.'].join('\n')
}
/** No model and no second implementation of financial calculations. This worker
 * calls the same services and permission declarations as the actual HTTP pages. */
export async function executeBusinessTopic(db:any,topic:BusinessTopic,context:any,recheck:()=>Promise<any>,deadline=Date.now()+30000){
 const {actor,principal,scope,source}=context,definition=definitions[topic],chinese=/[\u3400-\u9fff]/u.test(source.text)
 // Inspect the real business grant separately from whether the production
 // agent has a reviewed workflow. Neither inspection grants execution.
 const access=backendAccountAccess(topic==='marketing_setup'?{...actor,nativeAgent:undefined}:actor,definition.operationId)
 if(!access.allowed)return {state:'denied',text:chinese?'当前账号没有此查询权限，未读取业务数据。':'Akun ini tidak memiliki izin untuk permintaan ini. Data bisnis tidak dibaca.',permission:definition.permission}
 if(topic==='marketing_setup')return {state:'unavailable',text:chinese?'当前账号具备营销权限，但智能体的活动写入流程尚未开放。请在后台营销页面创建；本次未修改数据。':'Akun memiliki izin pemasaran, tetapi alur pembuatan kampanye melalui agen belum tersedia. Gunakan halaman pemasaran; tidak ada data yang diubah.',permission:definition.permission}
 if(!await audienceAllows(db,principal,scope,definition.permission))return {state:'denied',text:chinese?'当前会话包含无权查看此数据的成员，请使用本人有权限的私有会话。':'Ada anggota percakapan yang tidak berhak melihat data ini. Gunakan percakapan pribadi yang berizin.',permission:definition.permission}
 const fresh=await recheck()
 if(!backendAccountAccess(fresh.actor,definition.operationId).allowed)throw Error('BUSINESS_TOPIC_ACCESS_CHANGED')
 if(Date.now()>=deadline)throw Error('BUSINESS_TOPIC_TIMEOUT')
 const data=await db.$transaction((tx:any)=>topic==='today_stock_out'?todayStockOuts(fresh.actor.storeId,new Date(),tx):revenueQuery(tx,fresh.actor.storeId,{period:'today',dataset:'net'},canReadRevenueRefunds(fresh.actor)),{timeout:Math.max(1,Math.min(5000,deadline-Date.now()))})
 if(Date.now()>=deadline)throw Error('BUSINESS_TOPIC_TIMEOUT')
 const latest=await recheck()
 if(!backendAccountAccess(latest.actor,definition.operationId).allowed||!await audienceAllows(db,latest.principal,latest.scope,definition.permission))throw Error('BUSINESS_TOPIC_ACCESS_CHANGED')
 return {state:'completed',text:renderBusinessTopic(topic,data,chinese),permission:definition.permission,receipt:{operationId:definition.operationId,executor:'business_topic',bindingVersion:1,sourceSha:process.env.APP_SOURCE_SHA||'development',asOf:data?.asOf||data?.generatedAt,executed:true,result:data}}
}
