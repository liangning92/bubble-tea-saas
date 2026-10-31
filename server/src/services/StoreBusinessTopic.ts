import {backendAccountAccess} from './ManagementBackendRegistry'
import {todayStockOuts,registeredStockOutReport} from './TodayStockOutService'
import {revenueQuery,canReadRevenueRefunds} from './RevenueQueryService'
import {audienceAllows} from './teamAgentBridge/employeeAccess'

export type BusinessTopic='today_stock_out'|'today_revenue'|'marketing_setup'|'revenue_scope'|'stock_out_scope'|'capabilities'|'management_query'
// Exact, ordinary requests only. Quoted instructions, attachments and multi-step
// requests do not become privileged parameters. Unknown wording stays native.
export function storeBusinessTopic(text:string):BusinessTopic|undefined {
 const value=text.trim().replace(/[？?。！!]+$/u,'').replace(/\s+/g,' ').toLowerCase()
 if(/^(?:你|您|hermes)?(?:可以|能)?(?:做哪些工作|做什么|做哪些事|有哪些功能|查询哪些数据|查什么|有什么权限)[？?。！!]*$/i.test(value)||/^(?:help|capabilities|what can you do|apa (?:yang )?bisa kamu (?:lakukan|bantu))[?!.]*$/i.test(value))return 'capabilities'
 if(/(?:设置|创建|新建|安排|发布|设定).{0,20}(?:活动|促销)|(?:buat|atur|terbitkan).{0,20}(?:promosi|kampanye)|(?:create|publish).{0,20}(?:campaign|promotion)/i.test(value))return 'marketing_setup'
 // Read-only and concise-output modifiers do not require an agent plan. Only
 // remove these known modifiers; other instructions still hit the guards below.
 const query=value.replace(/^只读取?/u,'').replace(/[,，]\s*不修改任何数据$/u,'').replace(/[,，]\s*简短列出原料、数量和时间$/u,'')
 // A few business topics accept ordinary phrasing; these are not separate
 // workflows per sentence. Dates/compound requests outside the reviewed scope
 // never silently become today's report.
 const quotedOrCompound=/附件|引用|文档|示例|例如|假设|然后|同时|以及|删除|取消|修改|调整|退款|成本|毛利|利润|支出|费用|不要|不是|[;；\n"“”「」]|\b(?:profit|margin|cost|expense|delete|refund)\b/i.test(query)
 if(!quotedOrCompound&&value.length<=160){
  const stock=/出库|领料|领用|pengambilan bahan|bahan keluar|stok keluar|stock[ -]?out/i.test(value)
  const revenue=/营收|营业额|revenue|omzet|pendapatan|订单.*(?:合计|总额|加起来)/i.test(value)
  const today=/今天|今日|hari ini|\btoday\b/i.test(value),other=/昨天|昨日|明天|本周|上周|本月|上月|去年|今年|昨天|kemarin|minggu|bulan|yesterday|week|month|year|\d{4}[-/]\d{1,2}/i.test(value)
  if(stock&&!revenue)return today&&!other?'today_stock_out':'stock_out_scope'
  if(revenue&&!stock)return today&&!other?'today_revenue':'revenue_scope'
 }
 if(managementQueryOperation(value))return 'management_query'
 if(/^(?:请)?(?:设置|创建|新建|安排)(?:一个)?(?:营销|促销)?活动$/.test(value)||/^(?:buat|atur)(?:kan)? (?:sebuah )?(?:promosi|kampanye)$/.test(value))return 'marketing_setup'
 if(/^(?:请)?(?:查询|查看|告诉我)?(?:今天|今日)(?:的)?(?:出库|出库情况|出库记录|出库了什么|出库了哪些原料|出库了哪些材料|登记的出库记录)$/.test(value)||/^(?:apa saja |laporan )?(?:pengeluaran bahan|stok keluar|bahan keluar|pengambilan bahan)(?: dari gudang)? hari ini$/.test(value))return 'today_stock_out'
 if(/^(?:请)?(?:查询|查看|告诉我)?(?:今天|今日)(?:的)?(?:营收|营收多少|营收情况|营业额|营业额多少|收入多少)$/.test(value)||/^(?:berapa )?(?:omzet|pendapatan|penjualan) hari ini$/.test(value))return 'today_revenue'
}
const definitions={capabilities:{operationId:'',permission:'personal.messages'},management_query:{operationId:'GET /api/finance/revenue',permission:'finance.read'},revenue_scope:{operationId:'GET /api/revenue/query',permission:'finance.read'},stock_out_scope:{operationId:'GET /api/inventory/logs/stock-out-report',permission:'inventory.read'},marketing_setup:{operationId:'POST /api/marketing/activities',permission:'marketing.write'},today_stock_out:{operationId:'GET /api/inventory/logs/today-stock-out',permission:'inventory.read'},today_revenue:{operationId:'GET /api/revenue/query',permission:'finance.read'}} as const
export const topicDefinition=(topic:BusinessTopic)=>definitions[topic]
const stamp=(v:any,timezone:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(v))
export function renderBusinessTopic(topic:BusinessTopic,data:any,chinese:boolean):string {
 if(topic==='today_revenue'||topic==='revenue_scope'){
  if(!data?.summary||!Number.isSafeInteger(data.summary.amount)||data.summary.missingCount)throw Error('BUSINESS_TOPIC_EVIDENCE_INCOMPLETE')
  return chinese?`营收（后台净收入口径）：Rp ${data.summary.amount.toLocaleString('en-US')}。\n订单：${data.summary.orderCount} 笔。\n日期：${data.range.startDate}；时区：${data.range.timezone}。\n查询时间：${stamp(data.asOf,data.range.timezone)}。`:`Pendapatan (penerimaan bersih sesuai laporan): Rp ${data.summary.amount.toLocaleString('id-ID')}.\nPesanan: ${data.summary.orderCount}.\nTanggal: ${data.range.startDate}; zona waktu: ${data.range.timezone}.\nData per ${stamp(data.asOf,data.range.timezone)}.`
 }
 if(!Array.isArray(data?.groups)||typeof data.recordCount!=='number')throw Error('BUSINESS_TOPIC_EVIDENCE_INCOMPLETE')
 const lines=data.groups.flatMap((group:any)=>group.entries.map((entry:any)=>`${group.name} — ${entry.quantity} ${group.unit} — ${stamp(entry.createdAt,data.timezone)}`))
 return [chinese?`登记出库：${data.recordCount} 条（${data.date}，${data.timezone}）。`:`Pengambilan bahan terdaftar: ${data.recordCount} (${data.date}, ${data.timezone}).`,...lines.slice(0,30),...(lines.length>30?[chinese?'仅展示前 30 条，请在出库页面查看完整记录。':'Menampilkan 30 catatan pertama; lihat halaman stok keluar untuk daftar lengkap.']:[]),chinese?'仅含已登记的实物出库，不含销售自动消耗。':'Hanya pengambilan fisik terdaftar; tidak termasuk pemakaian otomatis dari penjualan.'].join('\n')
}
/** No model and no second implementation of financial calculations. This worker
 * calls the same services and permission declarations as the actual HTTP pages. */
export async function executeBusinessTopic(db:any,topic:BusinessTopic,context:any,recheck:()=>Promise<any>,deadline=Date.now()+30000){
 const {actor,principal,scope,source}=context;let definition:{operationId:string;permission:string}=topic==='management_query'?{operationId:managementQueryOperation(source.text)||'GET /api/finance/revenue',permission:'finance.read'}:definitions[topic];const chinese=/[\u3400-\u9fff]/u.test(source.text)
 if(['today_revenue','revenue_scope'].includes(topic)&&!backendAccountAccess(actor,definition.operationId).allowed&&backendAccountAccess(actor,'GET /api/reports/revenue').allowed)definition={operationId:'GET /api/reports/revenue',permission:'dashboard.read'}
 if(topic==='capabilities')return {state:'completed',text:await capabilityReply(db,context,chinese),permission:'personal.messages'}
 // Inspect the real business grant separately from whether the production
 // agent has a reviewed workflow. Neither inspection grants execution.
 const access=backendAccountAccess(actor,definition.operationId)
 if(!access.allowed)return {state:'denied',text:chinese?'当前账号无权限执行此请求，未读取相关业务数据，也未执行修改。':'Akun ini tidak memiliki izin untuk permintaan ini. Data bisnis tidak dibaca.',permission:definition.permission}
 if(topic==='marketing_setup'){
  if(/^(?:请)?(?:设置|创建|新建|安排)(?:一个)?(?:营销|促销)?活动[？?。！!]*$/.test(source.text.trim())||/^(?:buat|atur)(?:kan)? (?:sebuah )?(?:promosi|kampanye)[?!.]*$/i.test(source.text.trim()))return {state:'needs_input',text:chinese?'可以创建本店活动。请提供活动名称、适用商品、优惠规则和起止时间；默认保存为草稿。需要立即发布时请明确说明。':'Saya dapat membuat kampanye toko. Berikan nama, produk, aturan promo, serta waktu mulai/akhir. Disimpan sebagai draf kecuali Anda meminta penerbitan secara jelas.',permission:definition.permission}
  return {state:'native_required',permission:definition.permission}
 }
 const period=topic==='today_stock_out'||topic==='today_revenue'?{period:'today'}:reportPeriod(source.text)
 if(topic==='management_query'||!period)return {state:'native_required',permission:definition.permission}
 if(!await audienceAllows(db,principal,scope,definition.permission))return {state:'denied',text:chinese?'当前会话包含无权查看此数据的成员，请使用本人有权限的私有会话。':'Ada anggota percakapan yang tidak berhak melihat data ini. Gunakan percakapan pribadi yang berizin.',permission:definition.permission}
 const fresh=await recheck()
 if(!backendAccountAccess(fresh.actor,definition.operationId).allowed)throw Error('BUSINESS_TOPIC_ACCESS_CHANGED')
 if(Date.now()>=deadline)throw Error('BUSINESS_TOPIC_TIMEOUT')
 const data=await db.$transaction((tx:any)=>topic==='today_stock_out'?todayStockOuts(fresh.actor.storeId,new Date(),tx):topic==='stock_out_scope'?registeredStockOutReport(fresh.actor.storeId,period,new Date(),tx):revenueQuery(tx,fresh.actor.storeId,{...period,dataset:'net'},canReadRevenueRefunds(fresh.actor)),{timeout:Math.max(1,Math.min(5000,deadline-Date.now()))})
 if(Date.now()>=deadline)throw Error('BUSINESS_TOPIC_TIMEOUT')
 const latest=await recheck()
 if(!backendAccountAccess(latest.actor,definition.operationId).allowed||!await audienceAllows(db,latest.principal,latest.scope,definition.permission))throw Error('BUSINESS_TOPIC_ACCESS_CHANGED')
 return {state:'completed',text:renderBusinessTopic(topic,data,chinese),permission:definition.permission,receipt:{operationId:definition.operationId,executor:'business_topic',bindingVersion:1,sourceSha:process.env.APP_SOURCE_SHA||'development',asOf:data?.asOf||data?.generatedAt,executed:true,result:data}}
}

export function reportPeriod(text:string):Record<string,string>|undefined {
 const dates=[...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m=>m[0])
 if(dates.length&&/今天|今日|昨天|昨日|本周|本月|hari ini|kemarin|today|yesterday|this week|this month/i.test(text))return
 if(dates.length===1||dates.length===2)return {period:'custom',startDate:dates[0],endDate:dates.at(-1)!}
 if(dates.length)return
 const periods=[[/今天|今日|hari ini|\btoday\b/i,'today'],[/昨天|昨日|kemarin|\byesterday\b/i,'yesterday'],[/本周|这周|minggu ini|this week/i,'week'],[/本月|这个月|bulan ini|this month/i,'month']] as const
 const found=periods.filter(([pattern])=>pattern.test(text))
 if(found.length===1&&!/上周|上月|去年|今年|明天|last |next |lalu/i.test(text))return {period:found[0][1]}
}
function managementQueryOperation(text:string):string|undefined {
 if(/应存|存银行|银行.*现金|银行.*存款|bank deposit|setor.*bank|setoran/i.test(text))return 'GET /api/revenue/query'
 if(/营收|营业额|全店.*订单.*金额|所有订单.*(?:金额|合计)|毛利|利润|成本|支出|费用|财务|revenue|omzet|pendapatan|profit|margin|expense|financial/i.test(text))return 'GET /api/finance/revenue'
 if(/工资|薪资|薪酬|salary|payroll|gaji/i.test(text))return /我的|本人|my |saya/i.test(text)?'GET /api/staff/salary/my':'GET /api/salaries'
 if(/库存|stock|stok/i.test(text)&&!/出库|领料|stock[ -]?out|stok keluar/i.test(text))return 'GET /api/inventory'
}
function capabilityReply(_db:any,context:any,chinese:boolean):string {
 if(context.actor.role==='admin'&&!context.actor.employeeApp)return chinese?'你是本店管理员，可以查询本店后台全部业务数据，包括库存与出入库、各日期营收与财务、商品、订单、员工、排班考勤、工资、营销活动和卫生记录，也可以创建活动。活动缺少规则时我会先询问，默认保存草稿；发布需明确指示。查询和创建仅限当前店铺，不操作收银设备、支付或打印。':'Anda adalah admin toko ini. Saya dapat membaca seluruh data bisnis backend toko ini dan membuat kampanye. Detail yang kurang akan ditanyakan; draf dibuat secara default, penerbitan memerlukan instruksi jelas. Tidak mengoperasikan kasir, pembayaran, atau printer.'
 const entries=[['GET /api/inventory', '库存与各日期出入库','stok dan pergerakan bahan'],['GET /api/products','商品资料','data produk'],['GET /api/orders','本人权限范围内的订单记录','pesanan dalam cakupan akun'],['GET /api/revenue/query','营收与财务报表','laporan pendapatan dan keuangan'],['GET /api/staff','员工资料（按字段权限）','data staf sesuai izin bidang'],['GET /api/staff/schedule/list','排班','jadwal'],['GET /api/staff/attendance/list','考勤','absensi'],['GET /api/salaries','工资资料','penggajian'],['GET /api/hygiene/tasks','卫生记录','catatan kebersihan'],['POST /api/marketing/activities','创建营销活动','membuat kampanye']]
 const allowed=entries.filter(([id])=>backendAccountAccess(context.actor,id).allowed).map(row=>row[chinese?1:2])
 return chinese?`按你当前账号的权限，我可以帮助：${allowed.length?allowed.join('、'):'查询本人有权查看的后台资料'}。未列出的业务不会因此获得授权；无权限的数据会直接告知无权限。所有查询仅限本店后台，不操作收银设备、支付或打印。`:`Sesuai izin akun saat ini, saya dapat membantu: ${allowed.length?allowed.join(', '):'data backend yang diizinkan untuk akun Anda'}. Permintaan tanpa izin akan ditolak. Hanya backend toko ini; tidak mengoperasikan kasir, pembayaran, atau printer.`
}
