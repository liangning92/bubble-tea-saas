import {readAgentMemories,readAgentExperiences,storeAgentMemory,recordAgentExperience,agentMemoryFingerprint} from '../AgentMemoryService'
import { businessToolSchemas, businessToolNames, executeBusinessTool } from './employeeBusinessTools'
import { assertEmployeeSettings, assertToolAudience, assertToolSettings, visibleBusinessData, audienceAllows, visibleScheduleStaff } from './employeeAccess'
import { randomUUID, createHash } from 'crypto'
import { z } from 'zod'
import { TeamChannel, TeamError, readTeam, writeTeam, lockTeam } from '../TeamCommunicationService'
import { createTeamAgentBridge } from './service'
import { createCampaignPosterConfig, sanitizeCommercialCopy } from '../../utils/posterFactory'
import { saveActivity, listActivities } from '../ActivityService'
import { employeeSystemTemplateHash } from './employeeRuntimeSystem'
import { readAuthorizedBridgeChannel } from './directDelegation'
import { readEmployeeInventoryEvidence } from './employeeInventoryEvidence'
import { TEAM_AGENT_PREFIX } from './events'
import { BridgeDependencies, BridgeGrant, CommunicationPolicyPort, CommunicationScope, CommunicationSource, grantSchema } from './contract'
import { readCommunicationScope, textHash } from './confidentiality'
import { employeeRuntimeDigest as hash, employeeRuntimeOutboundRestricted, employeeRuntimePrivate, readEmployeeRuntimeSource, readEmployeeScheduleEvidence, readEmployeeMarketingEvidence } from './employeeRuntimeSources'
import { EMPLOYEE_RUNTIME_INSTRUCTION, EMPLOYEE_RUNTIME_PROTOCOL, EmployeeRuntimeHostPort, EmployeeRuntimeSource, EmployeeRuntimeTicket, employeeRuntimeInputSchema, employeeRuntimeOutputSchema, employeeRuntimeResponseSchema, employeeRuntimeToolSchema } from './employeeRuntimeContract'
import { editTrainingLibrary, writeTrainingLibrary, readTrainingLibrary } from '../TrainingLibraryStore'

const fail = (code = 'EMPLOYEE_RUNTIME_TRACE_DENIED'): never => { throw new TeamError(409, code) }
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const same=(a:any,b:any)=>hash(canonical(a))===hash(canonical(b))
/** JSON Schema treats an empty required list exactly like an absent one, and the model
 * SDK omits it. Normalize that away so an unchanged surface still compares equal. */
const normalizeSchema=(v:any):any=>Array.isArray(v)?v.map(normalizeSchema):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>!(k==='required'&&Array.isArray(v[k])&&v[k].length===0)).map(k=>[k,normalizeSchema(v[k])])):v
/** The issued tool surface is a set of name+schema, not a sequence. The runtime may
 * emit the same backend-issued tools in another order and with its own JSON key order;
 * only a different surface is a violation. Names are unique, so the order is total. */
const canonicalTools=(list:any):any[]=>[...(Array.isArray(list)?list:[])].map(normalizeSchema).sort((a:any,b:any)=>{const x=String(a?.function?.name??''),y=String(b?.function?.name??'');return x<y?-1:x>y?1:0})
// Pinned Hermes parses then compact-serializes model tool arguments between
// rounds. Compare their JSON value, while preserving every other message field.
const cleanToolContent=(content:any)=>{
  if(typeof content!=='string') return content
  const stripped = content.replace(/\n\n\[(?:Tool loop|Tool guardrail|Identical call)[^\]]*\]/gs, '').trim()
  try {
    return JSON.stringify(JSON.parse(stripped))
  } catch {
    return stripped
  }
}
const history=(messages:any[])=>messages.map(m=>{
  if(m.tool_calls){
    return {...m,tool_calls:m.tool_calls.map((c:any)=>({...c,function:{...c.function,arguments:typeof c.function.arguments==='string'?JSON.parse(c.function.arguments):c.function.arguments}}))}
  }
  if(m.role==='tool'){
    return {...m, content: cleanToolContent(m.content)}
  }
  if(m.role==='assistant' && m.content===null){
    return {...m, content: ''}
  }
  return m
})
const key = (id: string) => 'employeeRuntime.execution.' + id
const pointer = (scope: CommunicationScope) => 'employeeRuntime.context.' + scope.compartmentKey
const fn = (name: string, description: string, properties: any, required: string[]) => ({ type: 'function' as const, function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } })
const readMessage = z.object({ seq: z.number().int().positive() }).strict()
const sendMessage = z.object({ text: z.string().trim().min(1).max(4000), expectsReply:z.boolean().optional() }).strict()
const empty = z.object({}).strict()
type State = { ticket: EmployeeRuntimeTicket; grant: BridgeGrant; scope: CommunicationScope; expiresAt: string; version: number; phase: 'input'|'response'|'tools'|'final'|'complete'|'unknown'; turn: number; sources: EmployeeRuntimeSource[]; inputs: any[]; responses: any[]; tools: any[]; lastSeq: number; fault?: { code: string; at: string } }
export interface EmployeeRuntimeDependencies extends Omit<BridgeDependencies, 'communication'> {
  storeId: string
  /** Reviewed pinned launcher's complete initial system-message assembly hash.
   * No wildcard, request/body label or learned-at-first-send trust. */
  approvedSystemHashes: readonly string[]
  reviewedSystemTemplate?: { hash: string; isolatedRoot: string }
  maxExecutionMs?: number
}
/** Private trusted-child ports. No HTTP enrollment or production mount. All native
 * writes and their exact tool receipts share the same outer database transaction. */
export function createEmployeeRuntime(db: any, deps: EmployeeRuntimeDependencies) {
  const now = deps.now || Date.now
  const atomic = (tx: any) => ({ config: tx.config, staff: tx.staff, user: tx.user, financeAuditLog: tx.financeAuditLog, store: tx.store, inventory:tx.inventory, inventoryCountItem:tx.inventoryCountItem, stockInLog:tx.stockInLog, batch:tx.batch, bOMItem:tx.bOMItem, processRecipeItem:tx.processRecipeItem, processRecipe:tx.processRecipe, hygieneTask:tx.hygieneTask, hygieneTaskLog:tx.hygieneTaskLog, hygieneArea:tx.hygieneArea, stockOutLog: tx.stockOutLog, schedule: tx.schedule, shift: tx.shift, discountRule: tx.discountRule, campaign: tx.campaign, coupon: tx.coupon, product: tx.product, category: tx.category, spec: tx.spec, supplier: tx.supplier, purchaseOrder: tx.purchaseOrder, purchaseOrderItem: tx.purchaseOrderItem, expense: tx.expense, order: tx.order, announcement: tx.announcement, leave: tx.leave, leaveType: tx.leaveType, mediaAsset: tx.mediaAsset, productImage: tx.productImage, mediaReference: tx.mediaReference, training: tx.training, $transaction: async (operation: any) => operation(atomic(tx)) })
  async function fresh(tx: any, s?: State) {
    if (deps.enabled !== true) fail('EMPLOYEE_RUNTIME_DISABLED')
    await assertEmployeeSettings(tx,deps.storeId)
    const g = grantSchema.parse(await deps.resolveGrant(tx))
    if (g.storeId !== deps.storeId || g.revoked || Date.parse(g.expiresAt) <= now() || s && hash(g) !== hash(s.grant)) fail('EMPLOYEE_RUNTIME_GRANT_CHANGED')
    const sponsor = await tx.user.findFirst({ where: { id: g.sponsorUserId, storeId: g.storeId, role: { in: ['admin','manager'] } }, include: { staff: true } })
    if (!sponsor?.staff || sponsor.staff.status !== 'active' || sponsor.staff.storeId !== g.storeId) fail('EMPLOYEE_RUNTIME_SPONSOR_UNAVAILABLE')
    // Native bridge also rechecks actual team.manage for native task mutations.
    if (s) {
      if (Date.parse(s.expiresAt) <= now()) fail('EMPLOYEE_RUNTIME_EXPIRED')
      await deps.tasks.assert(tx, g, s.scope.task, s.scope.channelId)
      const {channel:c} = await readAuthorizedBridgeChannel(tx,g,s.scope.task,s.scope.channelId!,undefined,now())
      await binding(tx,g,s.scope)
      const scope = await readCommunicationScope(tx,g,s.scope.task,c,s.scope.requesterStaffId)
      if (hash(scope) !== hash(s.scope)) fail('EMPLOYEE_RUNTIME_AUDIENCE_CHANGED')
      for (const source of s.sources) if (!source.source.kind.endsWith('_evidence') && hash(await readEmployeeRuntimeSource(tx,g,scope,source.source)) !== hash(source)) fail('EMPLOYEE_RUNTIME_SOURCE_CHANGED')
    }
    return g
  }
  async function binding(tx:any,g:BridgeGrant,scope:CommunicationScope) {
    const row=await tx.config.findUnique({where:{storeId_key:{storeId:g.storeId,key:TEAM_AGENT_PREFIX+'channel.'+scope.channelId}}})
    const b=row&&JSON.parse(row.value)
    if(!b||b.agentId!==g.agentId||b.task?.taskId!==scope.task.taskId)fail('EMPLOYEE_RUNTIME_CHANNEL_BINDING_CHANGED')
  }
  async function load(tx: any, id: string): Promise<State> {
    z.string().uuid().parse(id)
    const s = await readTeam<State>(tx,deps.storeId,key(id))
    if (!s) fail('EMPLOYEE_RUNTIME_NOT_FOUND')
    return s
  }
  async function mutate<T>(id: string, version: number, operation: (tx: any,s: State)=>Promise<T>): Promise<T> {
    return db.$transaction(async (tx: any) => {
      await lockTeam(tx,deps.storeId,key(id))
      const s = await load(tx,id); await fresh(tx,s)
      if (s.version !== version) fail('EMPLOYEE_RUNTIME_VERSION_CHANGED')
      const value = await operation(atomic(tx),s)
      s.version++; s.ticket.traceVersion = s.version
      await writeTeam(tx,deps.storeId,key(id),s)
      return value
    })
  }
  const communication: CommunicationPolicyPort = {
    async assertContext(tx,g,scope) {
      const p = await readTeam<any>(tx,g.storeId,pointer(scope)), s = p && await load(tx,p.executionId)
      // Channel authorization precedes the native send's reply-to resolution.
      // Only its omitted requester can be filled from this server-owned trace;
      // actual outbound admission still requires the exact resolved requester.
      const comparable={...scope,requesterStaffId:scope.requesterStaffId??s?.scope.requesterStaffId}
      if (!s || hash(g)!==hash(s.grant) || hash(comparable)!==hash(s.scope) || ['unknown'].includes(s.phase)) fail()
      await fresh(tx,s)
      return { purpose:'employee_work', compartmentKey:scope.compartmentKey, memoryNamespace:scope.compartmentKey, executionId:s.ticket.executionId }
    },
    async authorizeSource(tx,g,scope,source) {
      if(source.kind.endsWith('_evidence')){
        const p=await readTeam<any>(tx,g.storeId,pointer(scope)),s=p&&await load(tx,p.executionId)
        if(!s||!s.sources.some(x=>hash(x.source)===hash(source)))fail('EMPLOYEE_RUNTIME_SOURCE_CHANGED')
        await fresh(tx,s)
      }else await readEmployeeRuntimeSource(tx,g,scope,source)
      return { dataClasses:['operational'] }
    },
    async admitOutput(tx,g,scope,input) {
      const p = await readTeam<any>(tx,g.storeId,pointer(scope)), s = p && await load(tx,p.executionId)
      if (!s || !['tools','final'].includes(s.phase) || hash(g)!==hash(s.grant) || hash({...scope,executionId:undefined})!==hash(s.scope)) fail()
      await fresh(tx,s)
      const response = s.responses.at(-1)
      const call = response?.providerMessage.tool_calls?.find((c:any)=>c.function.name==='employee_send_message')
      const args = s.phase==='final'&&response?.finishReason==='stop'?{text:response.providerMessage.content}:call && sendMessage.parse(JSON.parse(call.function.arguments))
      if (!args || input.purpose !== 'message' || input.requestId !== s.ticket.requestId || textHash(args.text)!==input.textHash) fail()
      return { decision:'allow',executionId:s.ticket.executionId,compartmentKey:scope.compartmentKey,audienceHash:scope.audienceHash,textHash:input.textHash,requestId:input.requestId,dataClasses:['operational'],sources:s.sources.map(x=>x.source) }
    },
  }
  const host: EmployeeRuntimeHostPort = {
    async begin(grant,scope,sources) {
      if (!sources.length || sources.length>50 || !scope.channelId) fail()
      return db.$transaction(async (tx:any)=>{
        await lockTeam(tx,deps.storeId,pointer(scope))
        const g = await fresh(tx)
        if (hash(g)!==hash(grant)) fail()
        const {channel:c} = await readAuthorizedBridgeChannel(tx,g,scope.task,scope.channelId!,undefined,now())
        await deps.tasks.assert(tx,g,scope.task,c.id)
        await binding(tx,g,scope)
        const actual = await readCommunicationScope(tx,g,scope.task,c,scope.requesterStaffId)
        if (hash(actual)!==hash(scope)) fail()
        const previous = await readTeam<any>(tx,g.storeId,pointer(scope))
        if (previous) {
          const old = await load(tx,previous.executionId)
          if (old.phase !== 'complete' && old.phase !== 'unknown' && !old.fault && Date.now() < Date.parse(old.expiresAt)) {
            fail('EMPLOYEE_RUNTIME_PREVIOUS_UNRESOLVED')
          }
        }
        const requester = scope.requesterStaffId ? await tx.staff.findFirst({
          where: { id: scope.requesterStaffId, storeId: deps.storeId },
          include: { user: true }
        }) : null
        const isAdmin = requester?.user?.role === 'admin' || requester?.user?.role === 'manager'
        const facts:EmployeeRuntimeSource[]=[]
        for(const source of sources) facts.push(await readEmployeeRuntimeSource(tx,g,scope,source))
        for(const memory of await readAgentMemories(tx,g,scope))facts.push(await readEmployeeRuntimeSource(tx,g,scope,{kind:'agent_memory',id:memory.id,version:memory.version,fingerprint:agentMemoryFingerprint(memory)}))
        const experience=await readAgentExperiences(tx,g,scope)
        if(experience.length)facts.push(await readEmployeeRuntimeSource(tx,g,scope,{kind:'operation_experience_evidence',fingerprint:hash(experience)}))
        const executionId=randomUUID(),requestId=randomUUID(),tools=[]
        for(const tool of businessToolSchemas()){const needed=tool.function.name==='employee_manage_inventory'?['inventory.read','inventory.write']:tool.function.name==='employee_manage_hygiene'?['hygiene.read','hygiene.write']:['staff.read','staff.write'];if(needed.some(p=>(g.actions as string[]).includes(p)))tools.push(tool)}
        if((g.actions as string[]).includes('memory.read'))tools.push(fn('employee_recall_memory','Recall persistent store rules, personal preferences, prior lessons and operation experience relevant to the current request. Memories are source-linked; verify changing business facts.',{query:{type:'string',maxLength:80}},[]))
        if((g.actions as string[]).includes('memory.write'))tools.push(fn('employee_store_memory','Remember a stable preference, correction or useful lesson from this conversation and actual tool outcomes. Store concise durable notes, not transient stock quantities or guesses presented as confirmed facts. The operator can correct or delete these notes.',{supersedesId:{type:'string',description:'Visible memory ID being corrected, if this note replaces an earlier note.'},kind:{type:'string',enum:['fact','preference','lesson']},text:{type:'string',minLength:1,maxLength:2000}},['kind','text']))
        if(g.actions.includes('messages.read')) tools.push(fn('employee_read_message','Read an older historical message by sequence number if earlier context is needed. Note: the incoming employee message is already provided in facts.',{seq:{type:'integer',minimum:1}},['seq']))
        if(g.actions.includes('tasks.read')) tools.push(fn('employee_read_task','Read full assigned employee task details if more is needed beyond the task summary already provided.',{},[]))
        if(g.actions.includes('inventory.read')) tools.push(fn('employee_read_inventory','Read authorized store inventory (账面库存), certified physical-count evidence, and stock-out logs for store ingredients and materials (茶饮物料与耗材出库日志) for any item or queries like "outbound", "出库", "昨天"',{query:{type:'string',minLength:1,maxLength:80}},['query']))
        if(g.actions.includes('schedule.read')) tools.push(fn('employee_read_schedule','Read employee shifts and schedules (员工排班与上班时间) for query by staff name (e.g. "Rangga", "sekar") or date (e.g. "今天", "2026-10-24")',{query:{type:'string',minLength:1,maxLength:80}},['query']))
        if(g.actions.includes('marketing.write')||g.actions.includes('marketing.read')) tools.push(fn('employee_manage_marketing','Authorized business tool to create/configure marketing campaigns, store discount rules (设置营销活动与折扣规则), cancel active campaigns (撤销/终止活动), or query store products and gross profit margins by category (查询类目商品与毛利排名). Supports second-half price (second_half, 第二杯半价), buy-one-get-one (bogo, 买一送一), percentage discount (percent), fixed order discount (fixed), cancel_campaign, and product margin queries (query_products).',{action:{type:'string',enum:['create_discount_rule','create_campaign','cancel_campaign','list_active','query_products'],description:'Action: create_discount_rule (创建规则), create_campaign (营销活动), cancel_campaign (撤销活动/折扣), list_active (查询当前活动), query_products (毛利排序)'},name:{type:'string',description:'Name of campaign or discount rule'},campaignId:{type:'string',description:'Campaign or discount rule ID to cancel'},category:{type:'string',description:'Category name for query_products (e.g. "冰淇淋", "奶茶", "果茶", "咖啡")'},sortBy:{type:'string',enum:['margin','price','name'],description:'Sort field for query_products (default "margin" for highest gross profit)'},limit:{type:'number',description:'Limit number of products for query_products (default 5)'},productIds:{type:'array',items:{type:'string'},description:'List of product IDs to apply this discount rule to'},daysOfWeek:{type:'array',items:{type:'number'},description:'Active days of week (1=Monday, ..., 5=Friday)'},discountType:{type:'string',enum:['second_half','bogo','percent','fixed'],description:'Discount type'},discountValue:{type:'number',description:'Discount value'},minOrderAmount:{type:'number',description:'Minimum order threshold'},startDate:{type:'string',description:'Start date (YYYY-MM-DD)'},endDate:{type:'string',description:'End date (YYYY-MM-DD)'},description:{type:'string',description:'Optional campaign description'}},['action']))
        if(g.actions.includes('procurement.write')) tools.push(fn('employee_manage_procurement','Authorized business tool to manage store procurement and supply chain (门店采购管理与供应链下发). Supports checking low stock items (list_low_stock), viewing active suppliers (list_suppliers), creating purchase orders (create_purchase_order), and cancelling purchase orders (cancel_order).',{action:{type:'string',enum:['list_low_stock','list_suppliers','create_purchase_order','cancel_order'],description:'Action to perform'},orderId:{type:'string',description:'Purchase order ID or orderNumber to cancel'},supplierId:{type:'string',description:'Supplier ID for creating purchase order'},supplierName:{type:'string',description:'Supplier name fuzzy search'},items:{type:'array',items:{type:'object',properties:{inventoryId:{type:'string',description:'Inventory item ID'},quantity:{type:'number',description:'Quantity to order'},unitCost:{type:'number',description:'Unit cost in cents/rupiah'}},required:['inventoryId','quantity']},description:'List of inventory items to purchase'},expectedDate:{type:'string',description:'Expected delivery date in YYYY-MM-DD'},note:{type:'string',description:'Purchase order note/reason'}},['action']))
        if(g.actions.includes('finance.write')||g.actions.includes('finance.read')) tools.push(fn('employee_manage_finance','Authorized business tool for store financial records and business revenue analysis (门店财务记账与营业流水/收支统计分析). Supports recording operating expenses (record_expense), querying revenue summaries and order stats (query_revenue_summary), and listing recent expenses (list_recent_expenses).',{action:{type:'string',enum:['record_expense','query_revenue_summary','list_recent_expenses'],description:'Action to perform'},amount:{type:'number',description:'Expense amount in cents/rupiah'},category:{type:'string',description:'Expense category: 物资 | 租金 | 水电 | 报销 | 工资 | 其他'},type:{type:'string',enum:['supplies','rent','utilities','reimbursement','salary','other'],description:'Expense type code'},description:{type:'string',description:'Expense description or reason'},paymentSource:{type:'string',enum:['drawer_cash','owner_transfer','personal','other'],description:'Payment source'},date:{type:'string',description:'Expense date in YYYY-MM-DD'},startDate:{type:'string',description:'Start date for query_revenue_summary (YYYY-MM-DD)'},endDate:{type:'string',description:'End date for query_revenue_summary (YYYY-MM-DD)'}},['action']))
        if(g.actions.includes('operations.write')) tools.push(fn('employee_manage_operations','Authorized business tool for store operations, team announcements, and HR leave approval (门店日常运营、团队全员公告发布与员工请假审批). Supports publishing store announcements (publish_announcement), listing pending leave requests (list_pending_leaves), and approving/rejecting leave applications (review_leave).',{action:{type:'string',enum:['publish_announcement','list_pending_leaves','review_leave'],description:'Action to perform'},title:{type:'string',description:'Announcement title'},content:{type:'string',description:'Announcement content'},type:{type:'string',enum:['info','warning','urgent'],description:'Announcement priority type'},leaveId:{type:'string',description:'Leave application ID to review'},reviewDecision:{type:'string',enum:['approved','rejected'],description:'Review decision: approved or rejected'},rejectionReason:{type:'string',description:'Reason if rejecting the leave request'}},['action']))
        if(g.actions.includes('products.write')) tools.push(fn('employee_manage_product','Authorized business tool to manage store products and media library image bindings (商品信息维护与媒体库图片按名称批量关联). Supports automatically scanning media library to match and link product photos by name (auto_link_media_images), setting a specific image for a product (set_product_image), updating product status/description (update_product), or querying product catalog (list_products).',{action:{type:'string',enum:['auto_link_media_images','set_product_image','update_product','list_products'],description:'Action to perform: auto_link_media_images (自动将媒体库里的图片按名称关联到对应商品), set_product_image (为指定商品设置媒体图片), update_product (更新商品状态或描述), list_products (查询商品列表及图片绑定情况)'},productId:{type:'string',description:'Product ID (required for set_product_image and update_product)'},productName:{type:'string',description:'Product name fuzzy search or filter'},mediaAssetId:{type:'string',description:'Media asset ID to link to product (optional for set_product_image)'},mediaAssetName:{type:'string',description:'Media asset name fuzzy match (optional for set_product_image)'},status:{type:'string',enum:['active','inactive'],description:'Product status (for update_product)'},description:{type:'string',description:'Product description (for update_product)'},limit:{type:'number',description:'Limit number of products to list (default 50)'}},['action']))
        if(g.actions.includes('training.write')) tools.push(fn('employee_manage_training','Authorized business tool for employee training management and SOP course authoring (员工培训管理、培训记录建档与培训资料/SOP课程编写发布). Supports writing and publishing training course modules/SOPs with steps, common errors and warnings (create_course), authoring store checklists (create_checklist), assigning training schedules to staff (assign_training), recording training assessment scores and results (record_result), querying staff training records (list_trainings), and viewing course library (list_courses).',{action:{type:'string',enum:['create_course','create_checklist','assign_training','record_result','list_trainings','list_courses'],description:'Action: create_course (编写/添加培训SOP课程模块), create_checklist (编写岗位检查单), assign_training (为员工安排培训排期), record_result (登记考核成绩与合格状态), list_trainings (查询员工培训记录), list_courses (查询课程库列表)'},title:{type:'string',description:'Course or checklist or training title (e.g. "饮品标准化制作与封口操作SOP", "吧台每日打烊清洁检查单")'},category:{type:'string',enum:['onboarding','safety','product','service','hygiene','inventory','leadership','compliance','other'],description:'Training category'},subtitle:{type:'string',description:'Course subtitle or summary'},minutes:{type:'number',description:'Estimated study/training duration in minutes (e.g. 15)'},sections:{type:'array',items:{type:'object',properties:{title:{type:'string',description:'Section title'},points:{type:'array',items:{type:'string'},description:'Standard operating steps / key points (标准操作步骤)'},errors:{type:'array',items:{type:'string'},description:'Common operational mistakes to avoid (常见错误)'},practice:{type:'string',description:'Practical exercise description (实操考核规范)'},checklist:{type:'array',items:{type:'string'},description:'Key check items (检查项)'},warning:{type:'string',description:'Safety or quality warning (安全/品质红线警告)'},tip:{type:'string',description:'Helpful tips (实用小技巧)'}},required:['title','points']},description:'Course sections with detailed SOP steps, common mistakes, and practice instructions'},checklistItems:{type:'array',items:{type:'string'},description:'Items for create_checklist (检查单项目列表)'},quiz:{type:'array',items:{type:'object',properties:{q:{type:'string',description:'Question text'},options:{type:'array',items:{type:'string'},description:'Multiple choice options'},answer:{type:'number',description:'Correct option index (0-based)'},explanation:{type:'string',description:'Explanation'}},required:['q','options','answer']},description:'Practice quiz questions for the training module'},staffId:{type:'string',description:'Staff ID for assign_training or record_result'},staffName:{type:'string',description:'Staff name for assign_training, record_result, or list_trainings (e.g. "Rangga", "Sekar")'},startDate:{type:'string',description:'Training start date (YYYY-MM-DD)'},endDate:{type:'string',description:'Training end date (YYYY-MM-DD)'},duration:{type:'number',description:'Training duration in hours (e.g. 2)'},trainingId:{type:'string',description:'Training record ID for record_result'},score:{type:'number',description:'Assessment score (0-100) for record_result'},passed:{type:'boolean',description:'Whether the staff passed the assessment (record_result)'},status:{type:'string',enum:['scheduled','in_progress','completed','cancelled'],description:'Training status'},notes:{type:'string',description:'Training notes, objectives, or assessment feedback'},limit:{type:'number',description:'Limit for list queries (default 20)'}},['action']))
        if(g.actions.includes('employee.request.write')) tools.push(fn('employee_submit_request','Employee tool to submit leave requests (员工快速请假申请), report ingredient waste/damage (物料打翻/变质/原料报损), or record shift handover notes for the team (交接班备忘录记录). Supports Indonesian terms: izin/cuti (leave), tumpah/rusak (waste), oper shift/serah terima (handover).',{action:{type:'string',enum:['submit_leave','report_waste','leave_shift_note'],description:'Action to submit'},leaveType:{type:'string',enum:['annual','sick','unpaid','other'],description:'Leave type: annual (年假), sick (病假), unpaid (事假/无薪), other (其他)'},startDate:{type:'string',description:'Leave start date (YYYY-MM-DD)'},endDate:{type:'string',description:'Leave end date (YYYY-MM-DD)'},totalDays:{type:'number',description:'Total leave days (e.g. 0.5 for half day, 1 for full day)'},reason:{type:'string',description:'Reason for leave, waste, or shift note'},inventoryName:{type:'string',description:'Ingredient or item name for waste report (e.g. "黑糖珍珠", "鲜牛奶", "红茶")'},quantity:{type:'number',description:'Quantity of wasted/damaged item'},note:{type:'string',description:'Content of shift handover note'}},['action']))
        if(g.actions.includes('staff.write')) tools.push(fn('employee_remember_rule','Admin tool to memorize store business rules, workflows, operation guidelines, customer preferences, and process instructions so you will permanently retain them across all future conversations (记住店铺业务规则、流程习惯、海报规范与操作要求).',{rule:{type:'string',minLength:1,maxLength:1000,description:'The exact workflow rule, SOP, preference, or process requirement to remember'},category:{type:'string',enum:['workflow','poster_and_tv','marketing','inventory','schedule','general'],description:'Rule category'}},['rule']))
        if(g.actions.includes('messages.send')) tools.push(fn('employee_send_message','Send at most one natural operational reply in this execution to this exact current audience; set expectsReply only for a question requiring new staff facts, not an acknowledgement',{text:{type:'string',minLength:1,maxLength:4000},expectsReply:{type:'boolean'}},['text']))
        const allStoredRules = (await readTeam<any>(tx, deps.storeId, 'employeeWorkflow.rules')) || [
          { category: 'poster_and_tv', rule: '活动海报与电视大屏展示应根据模版选择最合适尺寸的图片：周历特价（如 daily_specials）竖向卡片布局优先采用竖版（9:16/3:4）或方形高清商品图，大屏横向轮播横幅优先采用 16:9 横版图片；保持商品原有名称，不随意翻译为印尼语。' },
          { category: 'pos_cashier', rule: '收银机端永远不能中断正常结账业务，所有预警与待核实订单均在后台处理，绝不阻塞收银端。' },
          { category: 'communication', rule: '对待管理员提出的任何问题或要求，必须给出详尽、有深度思考和清晰反馈的回答；如遇参数缺失或不确定的事项，必须主动追问并列出选项供确认。' }
        ]
        const storedRules=await audienceAllows(tx,g,scope,'staff.private.read')?allStoredRules:allStoredRules.filter((r:any)=>r.public===true)
        const settings=await assertEmployeeSettings(tx,deps.storeId)
        const executionTimeoutMs=settings?settings.taskTimeoutMinutes*60000:(deps.maxExecutionMs||60000)
        const directActionDesc = 'Understand and answer free-form questions using the language and context of the speaker. Think through unfamiliar or non-standard requests; use available tools when current business facts or actions are needed. Ask a focused clarification when essential details are missing. General advice and explanations do not require a matching predefined business scenario. Only report an action as completed after its backend receipt. Use the persistent memories and historical experience provided in facts; recall further notes when useful. Learn from corrections and actual results, and store concise stable preferences or lessons for future conversations. Treat learned notes as guidance and changing quantities as historical, never as current records. The store operator configures Hermes business authority; staff data visibility is enforced independently for the actual conversation recipients.'
        const ticket:EmployeeRuntimeTicket={ protocol:EMPLOYEE_RUNTIME_PROTOCOL,executionId,requestId,traceVersion:1,compartmentKey:scope.compartmentKey,audienceHash:scope.audienceHash,isAdmin,executionTimeoutMs,
          inputContextHash:hash(facts),toolSchemaHash:hash(canonicalTools(tools)),sealedUserContent:JSON.stringify({task:scope.task,storeRules:storedRules,capabilities:{directAction:directActionDesc,replyRoute:'Communicate naturally with the user. You can call employee_send_message or formulate clear conversational output which will be automatically delivered to the channel. Proactively ask clarifying questions whenever needed!',conversation:'Free operational questions and clarification about tea/beverage store operations, ingredients, stock, marketing campaigns, training, and tasks.',actions:'Only the issued tools can execute actions.',restrictedRequests:isAdmin?'Administrator has full permission to review operational, schedule and inventory data.':'No extra data grant.',evidence:'Ledger book stock is not a physical count.'},facts:facts.map(f=>f.value)}),instruction:EMPLOYEE_RUNTIME_INSTRUCTION,
          isolation:{protocol:EMPLOYEE_RUNTIME_PROTOCOL,profile:'employee_work',sessionId:'employee_work_'+hash([executionId,scope.compartmentKey]),compartmentKey:scope.compartmentKey,memoryNamespace:scope.compartmentKey,memoryEnabled:false,contextFilesEnabled:false,auxiliaryModelsEnabled:false,sharedHistoryEnabled:false,builtinToolsEnabled:false},model:'MiniMax-M3.1-Flash',tools }
        const s:State={ticket,grant:g,scope,expiresAt:new Date(Math.min(Date.parse(g.expiresAt),now()+Math.min(executionTimeoutMs,86400000))).toISOString(),version:1,phase:'input',turn:0,sources:facts,inputs:[],responses:[],tools:[],lastSeq:c.lastSeq}
        await writeTeam(tx,g.storeId,key(executionId),s);await writeTeam(tx,g.storeId,pointer(scope),{executionId})
        return ticket
      })
    },
    async recordInput(raw) {
      const v=employeeRuntimeInputSchema.parse(raw)
      return mutate(v.executionId,v.expectedTraceVersion,async(_tx,s)=>{
        if(s.phase!=='input'||v.turn!==s.turn+1||v.turn>20) fail('EMPLOYEE_RUNTIME_SEND_ALREADY_RESERVED')
        const p:any=v.providerRequest, messages=p?.messages
        // Compare the actual tool surface as a set. The runtime is free to order the
        // issued tools differently; it is not free to change, add or drop one.
        const actualTools=hash(canonicalTools(p?.tools))
        if(hash(v.isolation)!==hash(s.ticket.isolation)||v.inputHash!==hash(p)||v.toolSchemaHash!==actualTools||actualTools!==s.ticket.toolSchemaHash||p?.model!==s.ticket.model||!Array.isArray(messages)||JSON.stringify(p).length>1000000) fail()
        if(s.turn===0){
          const firstUser=messages.findIndex((m:any)=>m.role==='user')
          if(firstUser<1||firstUser!==messages.length-1||messages[firstUser].content!==s.ticket.sealedUserContent||Object.keys(messages[firstUser]).some(k=>!['role','content'].includes(k))||messages.slice(0,firstUser).some((m:any)=>m.role!=='system')||!(deps.approvedSystemHashes.includes(hash(messages.slice(0,firstUser))) || deps.reviewedSystemTemplate && employeeSystemTemplateHash(messages.slice(0,firstUser),deps.reviewedSystemTemplate.isolatedRoot,s.ticket.executionId)===deps.reviewedSystemTemplate.hash)) fail('EMPLOYEE_RUNTIME_UNAPPROVED_SYSTEM_ASSEMBLY')
        }else{
          const prior=structuredClone(s.responses.at(-1).providerMessage)
          // Pinned Hermes reconstructs a tool-call assistant null content as empty.
          if(prior.content===null)prior.content=''
          const expected=[...s.inputs.at(-1).messages,prior]
          for(const call of s.responses.at(-1).providerMessage.tool_calls||[]){const r=s.tools.find(t=>t.turn===s.turn&&t.toolCallId===call.id);if(!r)fail();expected.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(r.value)})}
          if(!same(history(messages),history(expected))) fail('EMPLOYEE_RUNTIME_HISTORY_MISMATCH')
        }
        // Provider controls cannot inject alternate history, tools, extra models or endpoints.
        if(Object.keys(p).some(k=>!['model','messages','tools','tool_choice','stream','stream_options','temperature','reasoning_effort'].includes(k))) fail()
        s.inputs.push(structuredClone(p));s.phase='response';s.turn=v.turn
        return {traceVersion:s.version+1,maySend:true}
      })
    },
    async recordResponse(raw){const v=employeeRuntimeResponseSchema.parse(raw);return mutate(v.executionId,v.expectedTraceVersion,async(_tx,s)=>{
      if(s.phase!=='response'||v.turn!==s.turn) fail()
      const calls=v.providerMessage.tool_calls||[]
      let invalid=(v.finishReason==='tool_calls' ? !calls.length : calls.length>0||!v.providerMessage.content) || calls.length>30 || new Set(calls.map(c=>c.id)).size!==calls.length || calls.some(c=>!s.ticket.tools.some(t=>t.function.name===c.function.name))
      invalid ||= calls.filter(c=>c.function.name==='employee_send_message').length>1 || calls.some(c=>c.function.name==='employee_send_message')&&s.tools.some(t=>t.name==='employee_send_message')
      for(const c of calls)try{JSON.parse(c.function.arguments)}catch{invalid=true}
      // A complete but invalid provider result is still a known receipt. Preserve
      // its ID/message before blocking; never discard it and invite blind retry.
      s.responses.push(structuredClone(v));s.phase=invalid?'unknown':calls.length?'tools':'final'
      if(invalid)s.fault={code:'EMPLOYEE_RUNTIME_PROVIDER_RESULT_BLOCKED',at:new Date(now()).toISOString()}
      return {traceVersion:s.version+1}
    })},
    async executeTool(raw){const v=employeeRuntimeToolSchema.parse(raw);return mutate(v.executionId,v.expectedTraceVersion,async(tx,s)=>{
      const call=s.responses.at(-1)?.providerMessage.tool_calls?.[v.callOrdinal]
      if(s.phase!=='tools'||v.turn!==s.turn||!call||call.id!==v.toolCallId||call.function.name!==v.name||!same(JSON.parse(call.function.arguments),v.args)||s.tools.some(t=>t.toolCallId===call.id)) fail()
      let value:any,sources:EmployeeRuntimeSource[]=[]
      try{await assertToolSettings(tx,deps.storeId,v.name,v.args);await assertToolAudience(tx,s.grant,s.scope,v.name,v.args)}catch(error:any){
        if(!['EMPLOYEE_TOOL_RESULT_NOT_VISIBLE','EMPLOYEE_TOOL_DISABLED_BY_SETTINGS'].includes(error.message))throw error
        value={ok:false,code:error.message,message:'This operation or its result is not authorized here. Continue answering allowed parts, or explain which permission is needed.'}
        await recordAgentExperience(tx,s.grant,s.scope,v.name,v.args,value)
        s.tools.push({turn:s.turn,toolCallId:call.id,name:v.name,value,sources:[],mutating:false})
        if(s.responses.at(-1).providerMessage.tool_calls.every((c:any)=>s.tools.some(t=>t.toolCallId===c.id)))s.phase='input'
        return {traceVersion:s.version+1,value,sources:[]}
      }
      if(v.name==='employee_recall_memory'){
        const args=z.object({query:z.string().trim().max(80).optional()}).strict().parse(v.args)
        value={memories:await readAgentMemories(tx,s.grant,s.scope,args.query||''),experience:await readAgentExperiences(tx,s.grant,s.scope)}
      }else if(v.name==='employee_store_memory'){
        value=await storeAgentMemory(tx,s.grant,s.scope,s,v.args)
      }else if(businessToolNames.includes(v.name)){
        value=await executeBusinessTool(tx,s.grant,s.scope,v.name,v.args,'hermes:'+s.ticket.executionId+':'+v.toolCallId)
      }else if(v.name==='employee_read_message'){
        if(!s.grant.actions.includes('messages.read'))fail()
        const args=readMessage.parse(v.args), message=await readTeam<any>(tx,deps.storeId,`message.${s.scope.channelId}.${String(args.seq).padStart(12,'0')}`)
        if(!message)fail();sources=[await readEmployeeRuntimeSource(tx,s.grant,s.scope,{kind:'conversation',channelId:s.scope.channelId!,messageId:message.id,seq:args.seq})];value=sources[0].value
      }else if(v.name==='employee_read_task'){
        empty.parse(v.args);if(!s.grant.actions.includes('tasks.read'))fail()
        sources=[await readEmployeeRuntimeSource(tx,s.grant,s.scope,{kind:'employee_task',taskId:s.scope.task.taskId,version:s.scope.task.version})];value=sources[0].value
      }else if(v.name==='employee_read_inventory'){
        if(!s.grant.actions.includes('inventory.read'))fail()
        const args=z.object({query:z.string().trim().min(1).max(80)}).strict().parse(v.args)
        value=await readEmployeeInventoryEvidence(tx,s.grant,s.scope,{query:args.query!})
        sources=[await readEmployeeRuntimeSource(tx,s.grant,s.scope,{kind:'inventory_evidence',query:args.query,fingerprint:value.fingerprint})]
      }else if(v.name==='employee_read_schedule'){
        if(!s.grant.actions.includes('schedule.read'))fail()
        const args=z.object({query:z.string().trim().min(1).max(80)}).strict().parse(v.args)
        const evidence=await readEmployeeScheduleEvidence(tx,deps.storeId,args.query!,await visibleScheduleStaff(tx,s.grant,s.scope))
        value=evidence
        sources=[await readEmployeeRuntimeSource(tx,s.grant,s.scope,{kind:'schedule_evidence',query:args.query!,fingerprint:evidence.fingerprint})]
      }else if(v.name==='employee_manage_marketing'){
        if(!s.grant.actions.includes('marketing.write')&&!(s.grant.actions.includes('marketing.read')&&['list_active','query_products'].includes((v.args as any)?.action))) fail('EMPLOYEE_RUNTIME_ACTION_REVOKED')
        const args = z.object({
          action: z.enum(['create_discount_rule', 'create_campaign', 'cancel_campaign', 'list_active', 'query_products']),
          name: z.string().optional(),
          campaignId: z.string().optional(),
          category: z.string().optional(),
          sortBy: z.enum(['margin', 'price', 'name']).optional(),
          limit: z.number().optional(),
          discountType: z.enum(['second_half', 'bogo', 'percent', 'fixed']).optional(),
          discountValue: z.number().optional(),
          minOrderAmount: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          daysOfWeek: z.array(z.number()).optional(),
          productIds: z.array(z.string()).optional(),
          description: z.string().optional()
        }).parse(v.args)
        let result: any = {}
        if (args.action === 'query_products') {
          const cats = await tx.category.findMany({ where: { storeId: deps.storeId } })
          const qCat = (args.category || '').toLowerCase().trim()
          const catMap: Record<string, string> = {
            '冰淇淋': 'es krim', '雪糕': 'es krim', 'ice cream': 'es krim', 'eskrim': 'es krim',
            '奶茶': 'teh susu', 'milk tea': 'teh susu', '果茶': 'teh buah', 'fruit tea': 'teh buah',
            '咖啡': 'kopi', 'coffee': 'kopi'
          }
          const matchedTarget = catMap[qCat] || qCat
          const matchedCat = cats.find((c: any) => 
            c.name.toLowerCase().includes(matchedTarget) || 
            (qCat && c.name.toLowerCase().includes(qCat))
          )
          const whereCat = matchedCat ? { categoryId: matchedCat.id } : {}
          const products = await tx.product.findMany({
            where: { storeId: deps.storeId, deletedAt: null, ...whereCat },
            include: { category: true, specs: true }
          })
          const analyzed = products.map((p: any) => {
            const spec = p.specs.find((s: any) => s.isDefault) || p.specs[0]
            const price = spec ? spec.price : 0
            const cost = p.costPrice || 0
            const margin = price - cost
            const marginRate = price > 0 ? Number(((margin / price) * 100).toFixed(1)) : 0
            return {
              id: p.id,
              name: p.name,
              category: p.category?.name,
              price,
              cost,
              margin,
              marginRate: `${marginRate}%`,
              image: p.image
            }
          })
          if (args.sortBy === 'price') {
            analyzed.sort((a: any, b: any) => b.price - a.price)
          } else {
            analyzed.sort((a: any, b: any) => b.margin - a.margin)
          }
          const topList = analyzed.slice(0, args.limit || 5)
          result = {
            categorySearched: args.category,
            matchedCategory: matchedCat?.name || 'All',
            totalFound: analyzed.length,
            topProducts: topList
          }
        } else if (args.action === 'create_discount_rule') {
          const ruleName = (args.name || '特惠折扣活动').trim()
          const dType = args.discountType || 'percent'
          const minAmt = args.minOrderAmount !== undefined && args.minOrderAmount !== null
            ? Number(args.minOrderAmount)
            : (dType === 'second_half' || dType === 'bogo' ? 2 : 1)
          const dVal = args.discountValue !== undefined && args.discountValue !== null
            ? Number(args.discountValue)
            : (dType === 'second_half' ? 50 : dType === 'bogo' ? 100 : 20)
          const validFrom = args.startDate ? new Date(args.startDate) : new Date(now())
          const validUntil = args.endDate ? new Date(args.endDate) : null
          const appProducts = args.productIds && args.productIds.length ? JSON.stringify(args.productIds) : null
          const rule = await tx.discountRule.create({
            data: {
              storeId: deps.storeId,
              name: ruleName,
              discountType: dType,
              discountValue: dVal,
              minOrderAmount: minAmt,
              applicableProducts: appProducts,
              validFrom,
              validUntil,
              status: 'active'
            }
          })
          const campaignDesc = args.description || `由AI助手根据管理员指令创建: ${ruleName}` +
            (args.daysOfWeek ? ` (每周${args.daysOfWeek.join(',')}生效)` : '') +
            (args.productIds ? ` (指定${args.productIds.length}款商品)` : '')
          const camp = await tx.campaign.create({
            data: {
              storeId: deps.storeId,
              name: ruleName,
              description: campaignDesc,
              type: 'seasonal',
              triggerType: 'automatic',
              startDate: validFrom,
              endDate: validUntil,
              status: 'active',
              actions: JSON.stringify({
                discountRuleId: rule.id,
                discountType: dType,
                discountValue: dVal,
                productIds: args.productIds,
                daysOfWeek: args.daysOfWeek
              })
            }
          })
          const actType = dType === 'second_half' ? 'nth_cup' : dType === 'bogo' ? 'buy_get' : dType === 'percent' ? 'percent' : 'fixed'
          const actRule = dType === 'second_half'
            ? { nth: 2, percent: 50, minAmount: minAmt }
            : dType === 'bogo'
            ? { buy: 1, get: 1, minAmount: minAmt }
            : dType === 'percent'
            ? { percent: dVal, minAmount: minAmt }
            : { amount: dVal, minAmount: minAmt }
          const wDays = args.daysOfWeek ? args.daysOfWeek.map((d: number) => d === 7 ? 0 : d) : []
          let unifiedActivityId = '', activityImage: string | undefined = undefined
          const missingImageProducts: string[] = []
          const allMedia = await tx.mediaAsset.findMany({
            where: { storeId: deps.storeId, kind: 'image' }
          })
          if (args.productIds && args.productIds.length) {
            const prods = await tx.product.findMany({
              where: { storeId: deps.storeId, id: { in: args.productIds } },
              include: { images: { include: { media: true } } }
            })
            for (const p of prods) {
              let p16x9 = p.images?.find((img: any) => img.media && /_16x9|16:9|16x9|landscape|horizontal/i.test(img.media.name))?.media?.url
              if (!p16x9) {
                const cleanName = (p.name || '').trim().toLowerCase().replace(/[\s\-_]+/g, '')
                const matchMedia = allMedia.find((m: any) => {
                  const mn = (m.name || '').trim().toLowerCase().replace(/[\s\-_]+/g, '')
                  return mn.includes('16x9') && (mn.includes(cleanName) || cleanName.includes(mn.replace('16x9', '')))
                })
                if (matchMedia) {
                  p16x9 = matchMedia.url
                  await tx.productImage.create({
                    data: { productId: p.id, mediaId: matchMedia.id, position: (p.images?.length || 0) + 1 }
                  }).catch(() => {})
                  if (!p.image) {
                    await tx.product.update({ where: { id: p.id }, data: { image: matchMedia.url } })
                  }
                }
              }
              if (p16x9 && !activityImage) {
                activityImage = p16x9
              }
              if (!p16x9 && !p.image) {
                missingImageProducts.push(p.name)
              }
            }
          }
          if (!activityImage) {
            const fallbackMedia = allMedia.find((m: any) => /16x9/i.test(m.name))
            if (fallbackMedia) activityImage = fallbackMedia.url
          }

          const cleanHeadline = sanitizeCommercialCopy(ruleName) || 'Spesial Es Krim Mingguan'
          const cleanSubheadline = sanitizeCommercialCopy(args.description) ||
            (args.discountType === 'fixed' ? `Hemat Rp ${(args.discountValue || 4000).toLocaleString('id-ID')} Setiap Hari Senin - Jumat` : 'Nikmati Kesegaran Es Krim Setiap Hari')

          const posterConfig = createCampaignPosterConfig({
            activityType: actType,
            rule: actRule,
            products: (args.productIds || []).map((id: string) => ({ id, name: id })),
            weekdays: wDays,
            customHeadline: cleanHeadline,
            customSubheadline: cleanSubheadline,
            preferredTemplate: (args as any).template,
            preferredRatio: (args as any).imageAspectRatio,
          })
          try {
            const unified = await saveActivity(deps.storeId, {
              name: ruleName,
              type: actType,
              status: 'published',
              description: campaignDesc,
              productIds: args.productIds || [],
              weekdays: wDays,
              startsAt: validFrom.toISOString(),
              endsAt: validUntil ? validUntil.toISOString() : undefined,
              imageUrl: activityImage,
              posterConfig,
              rule: actRule
            })
            unifiedActivityId = unified.id
          } catch (e: any) {
            console.warn('saveActivity non-fatal warning:', e.message)
          }
          result = {
            success: true,
            message: '营销活动及折扣规则创建成功并已在后台活动列表激活发布',
            unifiedActivityId,
            imageUrl: activityImage || null,
            ruleId: rule.id,
            campaignId: camp.id,
            name: ruleName,
            discountType: dType,
            discountValue: dVal,
            minOrderAmount: minAmt,
            productIds: args.productIds,
            daysOfWeek: args.daysOfWeek,
            validFrom: validFrom.toISOString(),
            validUntil: validUntil ? validUntil.toISOString() : '长期有效',
            missingImageProducts,
            warning: missingImageProducts.length
              ? `注意：商品 [${missingImageProducts.join('、')}] 暂无 16:9 横版海报图片。请在回复中主动向管理员追问是否需要上传该商品的横版海报图片或指定其他替代饮品！`
              : undefined
          }
        } else if (args.action === 'create_campaign') {
          const campName = (args.name || '营销推广活动').trim()
          const validFrom = args.startDate ? new Date(args.startDate) : new Date(now())
          const validUntil = args.endDate ? new Date(args.endDate) : null
          const camp = await tx.campaign.create({
            data: { storeId: deps.storeId, name: campName, description: args.description || `管理员指令活动: ${campName}`, type: 'seasonal', triggerType: 'automatic', startDate: validFrom, endDate: validUntil, status: 'active' }
          })
          let unifiedActivityId = '', activityImage: string | undefined = undefined
          const allMedia = await tx.mediaAsset.findMany({
            where: { storeId: deps.storeId, kind: 'image' }
          })
          if (args.productIds && args.productIds.length) {
            const prods = await tx.product.findMany({
              where: { storeId: deps.storeId, id: { in: args.productIds } },
              include: { images: { include: { media: true } } }
            })
            for (const p of prods) {
              const p16x9 = p.images?.find((img: any) => img.media && /_16x9|16:9|16x9|landscape|horizontal/i.test(img.media.name))?.media?.url
              if (p16x9 && !activityImage) activityImage = p16x9
            }
          }
          if (!activityImage) {
            const matchedProd = await tx.product.findFirst({
              where: { storeId: deps.storeId, image: { not: null }, OR: (args.productIds && args.productIds.length) ? [{ id: { in: args.productIds } }] : [{ name: { contains: campName.slice(0, 4), mode: 'insensitive' } }] },
              select: { image: true }
            })
            if (matchedProd?.image) activityImage = matchedProd.image
            else {
              const fallbackMedia = allMedia.find((m: any) => /16x9/i.test(m.name))
              if (fallbackMedia) activityImage = fallbackMedia.url
            }
          }
          const posterConfig = createCampaignPosterConfig({
            activityType: 'percent',
            rule: { percent: 10, minAmount: 0 },
            products: (args.productIds || []).map((id: string) => ({ id, name: id })),
            customHeadline: sanitizeCommercialCopy(campName),
            customSubheadline: sanitizeCommercialCopy(args.description),
            preferredTemplate: (args as any).template,
            preferredRatio: (args as any).imageAspectRatio,
          })
          try {
            const unified = await saveActivity(deps.storeId, {
              name: campName,
              type: 'percent',
              status: 'published',
              description: args.description || `管理员指令活动: ${campName}`,
              startsAt: validFrom.toISOString(),
              endsAt: validUntil ? validUntil.toISOString() : undefined,
              imageUrl: activityImage,
              posterConfig,
              rule: { percent: 10, minAmount: 0 }
            })
            unifiedActivityId = unified.id
          } catch (e: any) {
            console.warn('saveActivity create_campaign warning:', e.message)
          }
          result = { success: true, message: '营销活动创建成功并已在后台活动列表激活发布', unifiedActivityId, imageUrl: activityImage || null, campaignId: camp.id, name: campName, startDate: validFrom.toISOString(), endDate: validUntil ? validUntil.toISOString() : '长期有效' }
        } else if (args.action === 'cancel_campaign') {
          const targetId = (args.campaignId || args.name || '').trim()
          let affectedUnified = 0
          if (targetId) {
            try {
              const allUnified = await listActivities(deps.storeId)
              const matched = allUnified.filter((a: any) => 
                a.id === targetId || a.name.toLowerCase().includes(targetId.toLowerCase())
              )
              for (const a of matched) {
                const { id, storeId: s, version, used, source, conflict, ...rest } = a
                await saveActivity(s, { ...rest, status: 'ended' }, id, version)
                affectedUnified++
              }
            } catch (e: any) {
              console.warn('cancel unified activity error:', e.message)
            }
            await tx.campaign.updateMany({
              where: { storeId: deps.storeId, OR: [{ id: targetId }, { name: { contains: targetId, mode: 'insensitive' } }] },
              data: { status: 'inactive' }
            })
            await tx.discountRule.updateMany({
              where: { storeId: deps.storeId, OR: [{ id: targetId }, { name: { contains: targetId, mode: 'insensitive' } }] },
              data: { status: 'inactive' }
            })
          }
          result = {
            success: true,
            message: `营销活动已成功在后台活动列表撤销终止 (影响活动: ${affectedUnified}个)`,
            affectedActivities: affectedUnified
          }
        } else {
          const allUnified = await listActivities(deps.storeId)
          const activeUnified = allUnified.filter((a: any) => a.status === 'published')
          result = {
            totalActive: activeUnified.length,
            activities: activeUnified.map((a: any) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              status: a.status,
              productIds: a.productIds,
              weekdays: a.weekdays,
              startsAt: a.startsAt,
              endsAt: a.endsAt
            }))
          }
        }
        value = result
        const evidence = { action: args.action, result }
        const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
        await writeTeam(tx, deps.storeId, 'employeeRuntime.marketingEvidence.' + fp, evidence)
        sources = [await readEmployeeRuntimeSource(tx, s.grant, s.scope, { kind: 'marketing_evidence', action: args.action, fingerprint: fp })]
      }else if(v.name==='employee_manage_procurement'){
        if(!s.grant.actions.includes('procurement.write')) fail('EMPLOYEE_RUNTIME_ACTION_REVOKED')
        const args = z.object({
          action: z.enum(['list_low_stock', 'list_suppliers', 'create_purchase_order', 'cancel_order']),
          orderId: z.string().optional(),
          supplierId: z.string().optional(),
          supplierName: z.string().optional(),
          items: z.array(z.object({
            inventoryId: z.string(),
            quantity: z.number().positive(),
            unitCost: z.number().optional()
          })).optional(),
          expectedDate: z.string().optional(),
          note: z.string().optional()
        }).parse(v.args)
        let result: any = {}
        if (args.action === 'list_low_stock') {
          const items = await tx.inventory.findMany({
            where: { storeId: deps.storeId, currentStock: { lte: 20 } },
            orderBy: { currentStock: 'asc' },
            take: 20
          })
          result = {
            totalLowStock: items.length,
            items: items.map((i: any) => ({
              id: i.id,
              name: i.name,
              currentStock: i.currentStock,
              unit: i.unit,
              minStock: i.minStock || 20,
              costPrice: i.avgCost || 0
            }))
          }
        } else if (args.action === 'list_suppliers') {
          const suppliers = await tx.supplier.findMany({
            where: { storeId: deps.storeId, isActive: true },
            orderBy: { name: 'asc' }
          })
          result = {
            totalSuppliers: suppliers.length,
            suppliers: suppliers.map((sup: any) => ({
              id: sup.id,
              name: sup.name,
              contactPerson: sup.contactPerson,
              phone: sup.phone,
              address: sup.address
            }))
          }
        } else if (args.action === 'create_purchase_order') {
          let supId = args.supplierId
          if (!supId && args.supplierName) {
            const matchedSup = await tx.supplier.findFirst({
              where: { storeId: deps.storeId, name: { contains: args.supplierName, mode: 'insensitive' } }
            })
            if (matchedSup) supId = matchedSup.id
          }
          if (!supId) {
            const firstSup = await tx.supplier.findFirst({ where: { storeId: deps.storeId, isActive: true } })
            if (firstSup) supId = firstSup.id
          }
          const orderNum = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
          const orderItemsData: any[] = []
          let totalAmount = 0
          if (args.items && args.items.length) {
            for (const it of args.items) {
              const inv = await tx.inventory.findUnique({ where: { id: it.inventoryId } })
              const cost = it.unitCost !== undefined ? it.unitCost : (inv?.avgCost || 0)
              const lineAmount = Math.round(it.quantity * cost)
              totalAmount += lineAmount
              orderItemsData.push({
                inventoryId: it.inventoryId,
                quantity: it.quantity,
                unitCost: cost,
                lineAmount
              })
            }
          }
          const po = await tx.purchaseOrder.create({
            data: {
              storeId: deps.storeId,
              supplierId: supId,
              orderNumber: orderNum,
              source: 'ai_assistant',
              status: 'pending',
              totalAmount,
              expectedDate: args.expectedDate ? new Date(args.expectedDate) : null,
              note: args.note || '由AI助理根据库存预警或管理员指令生成采购单',
              items: {
                create: orderItemsData
              }
            },
            include: { items: true, supplier: true }
          })
          result = {
            success: true,
            message: '采购订单创建成功',
            orderId: po.id,
            orderNumber: po.orderNumber,
            supplier: po.supplier?.name || '默认供应商',
            status: po.status,
            totalAmount: po.totalAmount,
            itemCount: po.items.length
          }
        } else if (args.action === 'cancel_order') {
          const target = args.orderId || ''
          const updated = await tx.purchaseOrder.updateMany({
            where: { storeId: deps.storeId, OR: [{ id: target }, { orderNumber: target }] },
            data: { status: 'cancelled' }
          })
          result = {
            success: true,
            message: `采购订单 ${target} 已成功取消 (影响单据: ${updated.count}个)`,
            affectedOrders: updated.count
          }
        }
        value = result
        const evidence = { action: args.action, result }
        const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
        await writeTeam(tx, deps.storeId, 'employeeRuntime.procurementEvidence.' + fp, evidence)
        sources = [await readEmployeeRuntimeSource(tx, s.grant, s.scope, { kind: 'procurement_evidence', action: args.action, fingerprint: fp })]
      }else if(v.name==='employee_manage_finance'){
        if(!s.grant.actions.includes('finance.write')&&!(s.grant.actions.includes('finance.read')&&['query_revenue_summary','list_recent_expenses'].includes((v.args as any)?.action))) fail('EMPLOYEE_RUNTIME_ACTION_REVOKED')
        const args = z.object({
          action: z.enum(['record_expense', 'query_revenue_summary', 'list_recent_expenses']),
          amount: z.number().optional(),
          category: z.string().optional(),
          type: z.string().optional(),
          description: z.string().optional(),
          paymentSource: z.string().optional(),
          date: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        }).parse(v.args)
        let result: any = {}
        if (args.action === 'record_expense') {
          const amt = Number(args.amount) || 0
          const cat = (args.category || '物资').trim()
          const expType = args.type || 'supplies'
          const desc = (args.description || `日常运营支出: ${cat}`).trim()
          const expDate = args.date ? new Date(args.date) : new Date(now())
          const exp = await tx.expense.create({
            data: {
              storeId: deps.storeId,
              amount: amt,
              category: cat,
              type: expType,
              description: desc,
              paymentSource: args.paymentSource || 'drawer_cash',
              date: expDate
            }
          })
          result = {
            success: true,
            message: '财务费用记账成功',
            expenseId: exp.id,
            category: exp.category,
            amount: exp.amount,
            description: exp.description,
            date: exp.date.toISOString().slice(0, 10)
          }
        } else if (args.action === 'query_revenue_summary') {
          let start = args.startDate ? new Date(args.startDate) : new Date(now() - 7 * 86400000)
          let end = args.endDate ? new Date(args.endDate) : new Date(now())
          if (args.endDate && !args.endDate.includes('T')) {
            end = new Date(new Date(args.endDate).setHours(23, 59, 59, 999))
          } else if (args.startDate && !args.endDate) {
            end = new Date(new Date(args.startDate).setHours(23, 59, 59, 999))
          }
          const orders = await tx.order.findMany({
            where: {
              storeId: deps.storeId,
              status: 'completed',
              createdAt: { gte: start, lte: end }
            },
            select: { finalAmount: true, discountAmount: true, paymentMethod: true }
          })
          const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.finalAmount || 0), 0)
          const totalDiscounts = orders.reduce((sum: number, o: any) => sum + (o.discountAmount || 0), 0)
          const orderCount = orders.length
          const avgTicket = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0
          const expenses = await tx.expense.findMany({
            where: {
              storeId: deps.storeId,
              date: { gte: start, lte: end }
            },
            select: { amount: true, category: true }
          })
          const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0)
          const netIncome = totalRevenue - totalExpenses
          result = {
            period: `${start.toISOString().slice(0, 10)} 至 ${end.toISOString().slice(0, 10)}`,
            completedOrders: orderCount,
            totalRevenue,
            totalDiscounts,
            averageTicket: avgTicket,
            totalExpenses,
            netIncome
          }
        } else if (args.action === 'list_recent_expenses') {
          const expenses = await tx.expense.findMany({
            where: { storeId: deps.storeId },
            orderBy: { date: 'desc' },
            take: 15
          })
          result = {
            total: expenses.length,
            expenses: expenses.map((e: any) => ({
              id: e.id,
              date: e.date.toISOString().slice(0, 10),
              category: e.category,
              amount: e.amount,
              description: e.description,
              paymentSource: e.paymentSource
            }))
          }
        }
        value = result
        const evidence = { action: args.action, result }
        const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
        await writeTeam(tx, deps.storeId, 'employeeRuntime.financeEvidence.' + fp, evidence)
        sources = [await readEmployeeRuntimeSource(tx, s.grant, s.scope, { kind: 'finance_evidence', action: args.action, fingerprint: fp })]
      }else if(v.name==='employee_manage_operations'){
        if(!s.grant.actions.includes('operations.write')) fail('EMPLOYEE_RUNTIME_ACTION_REVOKED')
        const args = z.object({
          action: z.enum(['publish_announcement', 'list_pending_leaves', 'review_leave']),
          title: z.string().optional(),
          content: z.string().optional(),
          type: z.enum(['info', 'warning', 'urgent']).optional(),
          leaveId: z.string().optional(),
          reviewDecision: z.enum(['approved', 'rejected']).optional(),
          rejectionReason: z.string().optional()
        }).parse(v.args)
        let result: any = {}
        if (args.action === 'publish_announcement') {
          const t = (args.title || '门店公告').trim()
          const c = (args.content || t).trim()
          const announcement = await tx.announcement.create({
            data: {
              storeId: deps.storeId,
              title: t,
              content: c,
              type: args.type || 'info',
              isActive: true,
              priority: args.type === 'urgent' ? 10 : args.type === 'warning' ? 5 : 0
            }
          })
          result = {
            success: true,
            message: '公告发布成功',
            announcementId: announcement.id,
            title: announcement.title,
            type: announcement.type,
            publishedAt: announcement.createdAt.toISOString()
          }
        } else if (args.action === 'list_pending_leaves') {
          const leaves = await tx.leave.findMany({
            where: { storeId: deps.storeId, status: 'pending' },
            include: { staff: true },
            orderBy: { createdAt: 'desc' },
            take: 10
          })
          result = {
            totalPending: leaves.length,
            leaves: leaves.map((l: any) => ({
              id: l.id,
              staffName: l.staff?.name || l.staffId,
              leaveType: l.leaveType,
              startDate: l.startDate.toISOString().slice(0, 10),
              endDate: l.endDate.toISOString().slice(0, 10),
              totalDays: l.totalDays,
              reason: l.reason,
              createdAt: l.createdAt.toISOString().slice(0, 10)
            }))
          }
        } else if (args.action === 'review_leave') {
          if (!args.leaveId) {
            result = { success: false, error: 'LEAVE_ID_REQUIRED', message: '缺少请假单 ID' }
          } else {
            const existing = await tx.leave.findUnique({ where: { id: args.leaveId }, include: { staff: true } })
            if (!existing) {
              result = { success: false, message: `未找到 ID 为 ${args.leaveId} 的请假单` }
            } else {
              const decision = args.reviewDecision || 'approved'
              const leave = await tx.leave.update({
                where: { id: args.leaveId },
                data: {
                  status: decision,
                  approvedBy: s.scope.requesterStaffId || 'admin',
                  approvedAt: new Date(now()),
                  rejectionReason: decision === 'rejected' ? (args.rejectionReason || '管理员驳回') : null
                },
                include: { staff: true }
              })
              result = {
                success: true,
                message: `请假申请已${decision === 'approved' ? '批准同意' : '驳回'}`,
                leaveId: leave.id,
                staffName: leave.staff?.name || leave.staffId,
                status: leave.status,
                rejectionReason: leave.rejectionReason
              }
            }
          }
        }
        value = result
        const evidence = { action: args.action, result }
        const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
        await writeTeam(tx, deps.storeId, 'employeeRuntime.operationsEvidence.' + fp, evidence)
        sources = [await readEmployeeRuntimeSource(tx, s.grant, s.scope, { kind: 'operations_evidence', action: args.action, fingerprint: fp })]
      }else if(v.name==='employee_submit_request'){
        if(!s.grant.actions.includes('employee.request.write')) fail('EMPLOYEE_RUNTIME_ACTION_REVOKED')
        const args = z.object({
          action: z.enum(['submit_leave', 'report_waste', 'leave_shift_note']),
          leaveType: z.enum(['annual', 'sick', 'unpaid', 'other']).optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          totalDays: z.number().optional(),
          reason: z.string().optional(),
          inventoryName: z.string().optional(),
          quantity: z.number().optional(),
          note: z.string().optional()
        }).parse(v.args)
        let result: any = {}
        const staffId = s.scope.requesterStaffId || 'staff-unknown'
        if (args.action === 'submit_leave') {
          const lType = args.leaveType || 'sick'
          const sDate = args.startDate ? new Date(args.startDate) : new Date(now())
          const eDate = args.endDate ? new Date(args.endDate) : new Date(sDate.getTime() + 86400000)
          const days = args.totalDays || 1
          const leave = await tx.leave.create({
            data: {
              storeId: deps.storeId,
              staffId,
              leaveType: lType,
              startDate: sDate,
              endDate: eDate,
              totalDays: days,
              reason: args.reason || '员工通过AI助手快速提交请假',
              status: 'pending'
            },
            include: { staff: true }
          })
          result = {
            success: true,
            message: '请假申请已提交成功，等待店长/管理员审批',
            leaveId: leave.id,
            staffName: leave.staff?.name || staffId,
            leaveType: lType,
            startDate: sDate.toISOString().slice(0, 10),
            endDate: eDate.toISOString().slice(0, 10),
            totalDays: days,
            status: 'pending'
          }
        } else if (args.action === 'report_waste') {
          const qName = (args.inventoryName || '').trim().toLowerCase()
          const matchedInv = qName ? await tx.inventory.findFirst({
            where: { storeId: deps.storeId, name: { contains: qName, mode: 'insensitive' } }
          }) : null
          const wasteQty = args.quantity || 1
          if (matchedInv) {
            await tx.inventory.update({
              where: { id: matchedInv.id },
              data: { currentStock: Math.max(0, matchedInv.currentStock - wasteQty) }
            })
            await tx.stockOutLog.create({
              data: {
                storeId: deps.storeId,
                inventoryId: matchedInv.id,
                quantity: wasteQty,
                type: 'waste',
                reason: args.reason || '打翻/变质/报损上报'
              }
            })
            result = {
              success: true,
              message: `原料报损登记成功，已扣减库存 ${wasteQty} ${matchedInv.unit}`,
              itemName: matchedInv.name,
              wasteQuantity: wasteQty,
              remainingStock: Math.max(0, matchedInv.currentStock - wasteQty),
              reason: args.reason || '报损'
            }
          } else {
            result = {
              success: true,
              message: `报损事由已记录：${args.inventoryName || '物料'} ${wasteQty}，请通知店长在盘点时复核`,
              reason: args.reason
            }
          }
        } else if (args.action === 'leave_shift_note') {
          const shiftNote = {
            staffId,
            note: args.note || args.reason || '无特殊备忘',
            createdAt: new Date(now()).toISOString()
          }
          const prevNotes = await readTeam<any[]>(tx, deps.storeId, 'employeeRuntime.shiftNotes') || []
          prevNotes.unshift(shiftNote)
          await writeTeam(tx, deps.storeId, 'employeeRuntime.shiftNotes', prevNotes.slice(0, 20))
          result = {
            success: true,
            message: '交接班备忘录记录成功，下一班次员工或店长可随时调阅',
            note: shiftNote.note,
            recordedAt: shiftNote.createdAt
          }
        }
        value = result
        const evidence = { action: args.action, result }
        const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
        await writeTeam(tx, deps.storeId, 'employeeRuntime.employeeRequestEvidence.' + fp, evidence)
        sources = [await readEmployeeRuntimeSource(tx, s.grant, s.scope, { kind: 'employee_request_evidence', action: args.action, fingerprint: fp })]
      }else if(v.name==='employee_manage_product'){
        if(!s.grant.actions.includes('products.write')) fail('EMPLOYEE_RUNTIME_ACTION_REVOKED')
        const args = z.object({
          action: z.enum(['auto_link_media_images', 'set_product_image', 'update_product', 'list_products']),
          productId: z.string().optional(),
          productName: z.string().optional(),
          mediaAssetId: z.string().optional(),
          mediaAssetName: z.string().optional(),
          status: z.enum(['active', 'inactive']).optional(),
          description: z.string().optional(),
          limit: z.number().optional()
        }).parse(v.args)
        let result: any = {}

        if (args.action === 'auto_link_media_images') {
          const mediaAssets = await tx.mediaAsset.findMany({
            where: { storeId: deps.storeId }
          })
          const products = await tx.product.findMany({
            where: { storeId: deps.storeId, deletedAt: null },
            include: { images: true }
          })

          const norm = (s: string) => s.toLowerCase()
            .replace(/\.[a-zA-Z0-9]+$/, '')
            .replace(/smothies/g, 'smoothie')
            .replace(/smoothies/g, 'smoothie')
            .replace(/manggo/g, 'mango')
            .replace(/coffe\b/g, 'coffee')
            .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
          const linked: any[] = []
          const skipped: any[] = []

          for (const prod of products) {
            if (prod.images && prod.images.length > 0) {
              skipped.push({
                productId: prod.id,
                productName: prod.name,
                reason: '商品已有关联图片，无需重复关联'
              })
              continue
            }
            const pNorm = norm(prod.name)
            let bestAsset: any = null

            // 1. Exact normalized match
            for (const asset of mediaAssets) {
              const aNorm = norm(asset.name)
              if (aNorm && pNorm && aNorm === pNorm) {
                bestAsset = asset
                break
              }
            }

            // 2. Substring containment match if not found exactly
            if (!bestAsset) {
              for (const asset of mediaAssets) {
                const aNorm = norm(asset.name)
                if (aNorm && pNorm && ((aNorm.length >= 4 && pNorm.includes(aNorm)) || (pNorm.length >= 4 && aNorm.includes(pNorm)))) {
                  bestAsset = asset
                  break
                }
              }
            }

            if (bestAsset) {
              await tx.product.update({
                where: { id: prod.id },
                data: { image: bestAsset.url }
              })
              const existingPi = await tx.productImage.findUnique({
                where: { productId_mediaId: { productId: prod.id, mediaId: bestAsset.id } }
              })
              if (!existingPi) {
                const maxPosPi = await tx.productImage.findFirst({
                  where: { productId: prod.id },
                  orderBy: { position: 'desc' }
                })
                const nextPos = maxPosPi ? maxPosPi.position + 1 : 0
                await tx.productImage.create({
                  data: {
                    productId: prod.id,
                    mediaId: bestAsset.id,
                    position: nextPos
                  }
                })
              }
              linked.push({
                productId: prod.id,
                productName: prod.name,
                mediaId: bestAsset.id,
                mediaName: bestAsset.name,
                imageUrl: bestAsset.url
              })
            } else {
              skipped.push({
                productId: prod.id,
                productName: prod.name,
                reason: '未在媒体库中找到名称匹配的图片'
              })
            }
          }

          result = {
            success: true,
            message: `已自动匹配并关联 ${linked.length} 个商品的媒体图片，${skipped.length} 个商品跳过/未找到同名图片`,
            totalProducts: products.length,
            linkedCount: linked.length,
            skippedCount: skipped.length,
            linkedItems: linked.slice(0, 20),
            skippedItems: skipped.slice(0, 10)
          }
        } else if (args.action === 'set_product_image') {
          let product: any = null
          if (args.productId) {
            product = await tx.product.findFirst({
              where: { id: args.productId, storeId: deps.storeId }
            })
          } else if (args.productName) {
            product = await tx.product.findFirst({
              where: { storeId: deps.storeId, name: { contains: args.productName, mode: 'insensitive' } }
            })
          }
          if (!product) {
            result = {
              success: false,
              error: 'PRODUCT_NOT_FOUND',
              message: `未找到指定商品 "${args.productId || args.productName}"`
            }
          } else {
            let asset: any = null
            if (args.mediaAssetId) {
              asset = await tx.mediaAsset.findFirst({
                where: { id: args.mediaAssetId, storeId: deps.storeId }
              })
            } else if (args.mediaAssetName) {
              asset = await tx.mediaAsset.findFirst({
                where: { storeId: deps.storeId, name: { contains: args.mediaAssetName, mode: 'insensitive' } }
              })
              if (!asset) {
                // Fallback: try matching parts of product name or keyword with orientation awareness
                const cleanQuery = args.mediaAssetName.trim()
                const is9x16 = cleanQuery.includes('9x16')
                const is16x9 = cleanQuery.includes('16x9')
                const candidates = [
                  product.name,
                  ...product.name.split(/[\s\-_]+/).filter((w: string) => w.length > 2),
                  cleanQuery.replace(/[\s\-_]+/g, '')
                ]
                if (is9x16 || is16x9) {
                  const orient = is9x16 ? '9x16' : '16x9'
                  for (const candidate of candidates) {
                    asset = await tx.mediaAsset.findFirst({
                      where: { storeId: deps.storeId, kind: 'image', name: { contains: orient, mode: 'insensitive' }, AND: [{ name: { contains: candidate, mode: 'insensitive' } }] }
                    })
                    if (asset) break
                  }
                }
                if (!asset) {
                  for (const candidate of candidates) {
                    asset = await tx.mediaAsset.findFirst({
                      where: { storeId: deps.storeId, kind: 'image', name: { contains: candidate, mode: 'insensitive' } }
                    })
                    if (asset) break
                  }
                }
              }
            }
            if (!asset) {
              const availableMedia = await tx.mediaAsset.findMany({
                where: { storeId: deps.storeId, kind: 'image' },
                select: { id: true, name: true },
                take: 10
              })
              result = {
                success: false,
                error: 'MEDIA_NOT_FOUND',
                message: `未找到指定媒体图片 "${args.mediaAssetId || args.mediaAssetName}"。媒体库现有可用图片示例: ${availableMedia.map((m: any) => m.name).join(', ')}`,
                availableImages: availableMedia.map((m: any) => ({ id: m.id, name: m.name }))
              }
            } else {
              await tx.product.update({
                where: { id: product.id },
                data: { image: asset.url }
              })
              const existingPi = await tx.productImage.findUnique({
                where: { productId_mediaId: { productId: product.id, mediaId: asset.id } }
              })
              if (!existingPi) {
                const maxPosPi = await tx.productImage.findFirst({
                  where: { productId: product.id },
                  orderBy: { position: 'desc' }
                })
                const nextPos = maxPosPi ? maxPosPi.position + 1 : 0
                await tx.productImage.create({
                  data: {
                    productId: product.id,
                    mediaId: asset.id,
                    position: nextPos
                  }
                })
              }
              result = {
                success: true,
                message: `成功为商品 "${product.name}" 绑定图片 "${asset.name}"`,
                productId: product.id,
                productName: product.name,
                mediaId: asset.id,
                imageUrl: asset.url
              }
            }
          }
        } else if (args.action === 'update_product') {
          if (!args.productId) {
            result = { success: false, error: 'PRODUCT_ID_REQUIRED', message: '缺少 productId' }
          } else {
            const updateData: any = {}
            if (args.status) updateData.status = args.status
            if (args.description !== undefined) updateData.description = args.description
            const updated = await tx.product.update({
              where: { id: args.productId },
              data: updateData
            })
            result = {
              success: true,
              message: `商品 "${updated.name}" 更新成功`,
              product: updated
            }
          }
        } else if (args.action === 'list_products') {
          const limit = args.limit || 50
          const whereClause: any = { storeId: deps.storeId, deletedAt: null }
          if (args.productName) {
            whereClause.name = { contains: args.productName, mode: 'insensitive' }
          }
          const list = await tx.product.findMany({
            where: whereClause,
            include: {
              category: { select: { id: true, name: true } },
              images: { include: { media: true } }
            },
            take: limit,
            orderBy: { createdAt: 'desc' }
          })
          result = {
            success: true,
            total: list.length,
            products: list.map((p: any) => ({
              id: p.id,
              name: p.name,
              category: p.category?.name,
              price: p.price,
              status: p.status,
              hasImage: !!p.image,
              image: p.image,
              imageCount: p.images?.length || 0
            }))
          }
        }

        value = result
        const evidence = { action: args.action, result }
        const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
        await writeTeam(tx, deps.storeId, 'employeeRuntime.productEvidence.' + fp, evidence)
        sources = [await readEmployeeRuntimeSource(tx, s.grant, s.scope, { kind: 'product_evidence', action: args.action, fingerprint: fp })]
      }else if(v.name==='employee_manage_training'){
        if(!s.grant.actions.includes('training.write')) fail('EMPLOYEE_RUNTIME_ACTION_REVOKED')
        const args = z.object({
          action: z.enum(['create_course', 'create_checklist', 'assign_training', 'record_result', 'list_trainings', 'list_courses']),
          title: z.string().optional(),
          category: z.string().optional(),
          subtitle: z.string().optional(),
          minutes: z.number().optional(),
          sections: z.array(z.object({
            title: z.string(),
            points: z.array(z.string()),
            errors: z.array(z.string()).optional(),
            practice: z.string().optional(),
            checklist: z.array(z.string()).optional(),
            warning: z.string().optional(),
            tip: z.string().optional()
          })).optional(),
          checklistItems: z.array(z.string()).optional(),
          quiz: z.array(z.object({
            q: z.string(),
            options: z.array(z.string()),
            answer: z.number(),
            explanation: z.string().optional()
          })).optional(),
          staffId: z.string().optional(),
          staffName: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          duration: z.number().optional(),
          trainingId: z.string().optional(),
          score: z.number().optional(),
          passed: z.boolean().optional(),
          status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
          notes: z.string().optional(),
          limit: z.number().optional()
        }).parse(v.args)
        let result: any = {}
        const adminStaffId = s.scope.requesterStaffId || s.grant.sponsorUserId || 'staff-admin-001'
        const actor = { id: adminStaffId, storeId: deps.storeId, role: 'admin' }

        if (args.action === 'create_course') {
          const courseTitle = args.title || '标准化实操培训SOP'
          const cat = args.category || 'product'
          const minutes = args.minutes || 15
          const moduleKey = 'sop-' + createHash('md5').update(courseTitle + '-' + now()).digest('hex').slice(0, 10)

          const formattedSections = (args.sections && args.sections.length > 0) ? args.sections.map((sec) => ({
            title: { zh: sec.title, id: sec.title, en: sec.title },
            points: sec.points.map(p => ({ zh: p, id: p, en: p })),
            errors: sec.errors ? sec.errors.map(e => ({ zh: e, id: e, en: e })) : undefined,
            practice: sec.practice ? { zh: sec.practice, id: sec.practice, en: sec.practice } : undefined,
            checklist: sec.checklist ? sec.checklist.map(c => ({ zh: c, id: c, en: c })) : undefined,
            warning: sec.warning ? { zh: sec.warning, id: sec.warning, en: sec.warning } : undefined,
            tip: sec.tip ? { zh: sec.tip, id: sec.tip, en: sec.tip } : undefined
          })) : [
            {
              title: { zh: '核心操作规程', id: '核心操作规程', en: 'Standard Operating Procedures' },
              points: [
                { zh: '准备操作台面，严格遵循清洁与消毒标准', id: '准备操作台面，严格遵循清洁与消毒标准', en: 'Prepare counter and sanitize equipment' },
                { zh: '按标准配方与操作指引进行量取与封口制作', id: '按标准配方与操作指引进行量取与封口制作', en: 'Measure ingredients according to recipe cards' },
                { zh: '成品检查（温度、封口平整度、品尝或观感）', id: '成品检查（温度、封口平整度、品尝或观感）', en: 'Check cup sealing, temperature and appearance' }
              ],
              errors: [
                { zh: '未确认封口机温度直接压膜导致漏液', id: '未确认封口机温度直接压膜导致漏液', en: 'Sealing cup before sealer reaches target temp' }
              ],
              warning: { zh: '严禁违规操作或跳过消毒步骤', id: '严禁违规操作或跳过消毒步骤', en: 'Never skip sanitation or critical steps' }
            }
          ]

          const formattedQuiz = args.quiz ? args.quiz.map(q => ({
            q: { zh: q.q, id: q.q, en: q.q },
            options: q.options.map(o => ({ zh: o, id: o, en: o })),
            answer: q.answer,
            explanation: { zh: q.explanation || '请参考SOP标准操作规程', id: q.explanation || '请参考SOP标准操作规程', en: q.explanation || 'Refer to SOP standards' }
          })) : []

          const newModule = {
            key: moduleKey,
            reviewed: true,
            title: { zh: courseTitle, id: courseTitle, en: courseTitle },
            subtitle: { zh: args.subtitle || '门店标准培训课程', id: args.subtitle || '门店标准培训课程', en: args.subtitle || 'Standard Store Training Course' },
            minutes,
            sections: formattedSections,
            quiz: formattedQuiz,
            practical: [],
            sources: []
          }

          const draft = await editTrainingLibrary(actor)
          const modules = [...(draft.catalogue?.modules || [])]
          const existingIdx = modules.findIndex((m: any) => m.title?.zh === courseTitle || m.title?.id === courseTitle)
          if (existingIdx >= 0) {
            modules[existingIdx] = { ...modules[existingIdx], ...newModule, key: modules[existingIdx].key }
          } else {
            modules.push(newModule)
          }

          const saveReqId = randomUUID()
          const saveRes = await writeTrainingLibrary(actor, 'save', {
            requestId: saveReqId,
            expectedGeneration: draft.generation,
            note: `AI编写并更新培训SOP: ${courseTitle}`,
            catalogue: { ...draft.catalogue, modules }
          })

          const pubReqId = randomUUID()
          await writeTrainingLibrary(actor, 'publish', {
            requestId: pubReqId,
            expectedGeneration: (saveRes as any).generation || draft.generation,
            note: `AI发布培训SOP: ${courseTitle}`
          })

          result = {
            success: true,
            message: `培训SOP课程《${courseTitle}》编写并发布成功！员工端与管理端资料库已同步更新上线。`,
            courseKey: newModule.key,
            title: courseTitle,
            category: cat,
            minutes,
            sectionsCount: formattedSections.length,
            quizCount: formattedQuiz.length,
            sectionsSummary: formattedSections.map(s => s.title.zh)
          }
        } else if (args.action === 'create_checklist') {
          const checklistTitle = args.title || '门店岗位日常检查单'
          const items = (args.checklistItems && args.checklistItems.length > 0) ? args.checklistItems : ['设备卫生与温控检查', '原料备料充足度确认', '收银小票机与网络检查']
          const checkKey = 'checklist-' + createHash('md5').update(checklistTitle + '-' + now()).digest('hex').slice(0, 10)

          const newChecklist = {
            key: checkKey,
            title: { zh: checklistTitle, id: checklistTitle, en: checklistTitle },
            items: items.map(item => ({ zh: item, id: item, en: item }))
          }

          const draft = await editTrainingLibrary(actor)
          const checklists = [...(draft.catalogue?.checklists || [])]
          checklists.push(newChecklist)

          const saveReqId = randomUUID()
          const saveRes = await writeTrainingLibrary(actor, 'save', {
            requestId: saveReqId,
            expectedGeneration: draft.generation,
            note: `AI编写并添加检查单: ${checklistTitle}`,
            catalogue: { ...draft.catalogue, checklists }
          })

          const pubReqId = randomUUID()
          await writeTrainingLibrary(actor, 'publish', {
            requestId: pubReqId,
            expectedGeneration: (saveRes as any).generation || draft.generation,
            note: `AI发布检查单: ${checklistTitle}`
          })

          result = {
            success: true,
            message: `岗位检查单《${checklistTitle}》编写并发布成功，共包含 ${items.length} 项检查要点。`,
            checklistKey: checkKey,
            title: checklistTitle,
            items
          }
        } else if (args.action === 'assign_training') {
          let staff: any = null
          if (args.staffId) {
            staff = await tx.staff.findFirst({ where: { id: args.staffId, storeId: deps.storeId } })
          } else if (args.staffName) {
            staff = await tx.staff.findFirst({
              where: { storeId: deps.storeId, name: { contains: args.staffName, mode: 'insensitive' } }
            })
          }
          if (!staff) {
            const allStaff = await tx.staff.findMany({ where: { storeId: deps.storeId }, select: { id: true, name: true } })
            result = {
              success: false,
              error: 'STAFF_NOT_FOUND',
              message: `未找到指定员工 "${args.staffName || args.staffId}"。当前门店在职员工: ${allStaff.map((s: any) => s.name).join(', ')}`
            }
          } else {
            const sDate = args.startDate ? new Date(args.startDate) : new Date(now())
            const eDate = args.endDate ? new Date(args.endDate) : new Date(sDate.getTime() + (args.duration || 2) * 3600000)
            const training = await tx.training.create({
              data: {
                storeId: deps.storeId,
                staffId: staff.id,
                trainingType: args.category || 'product',
                title: args.title || '饮品标准化制作与封口操作培训',
                startDate: sDate,
                endDate: eDate,
                duration: args.duration || 2,
                status: args.status || 'scheduled',
                notes: args.notes || 'AI安排的员工培训计划'
              },
              include: { staff: true }
            })

            result = {
              success: true,
              message: `成功为员工 "${staff.name}" 安排培训《${training.title}》！`,
              trainingId: training.id,
              staffId: staff.id,
              staffName: staff.name,
              title: training.title,
              trainingType: training.trainingType,
              startDate: sDate.toISOString().slice(0, 10),
              durationHours: training.duration,
              status: training.status
            }
          }
        } else if (args.action === 'record_result') {
          let training: any = null
          if (args.trainingId) {
            training = await tx.training.findFirst({
              where: { id: args.trainingId, storeId: deps.storeId },
              include: { staff: true }
            })
          } else if (args.staffName) {
            const staff = await tx.staff.findFirst({
              where: { storeId: deps.storeId, name: { contains: args.staffName, mode: 'insensitive' } }
            })
            if (staff) {
              training = await tx.training.findFirst({
                where: { storeId: deps.storeId, staffId: staff.id },
                orderBy: { createdAt: 'desc' },
                include: { staff: true }
              })
            }
          }
          if (!training) {
            result = {
              success: false,
              error: 'TRAINING_NOT_FOUND',
              message: `未找到匹配的培训记录 (trainingId: ${args.trainingId || '无'}, staffName: ${args.staffName || '无'})`
            }
          } else {
            const score = args.score !== undefined ? args.score : training.score
            const passed = args.passed !== undefined ? args.passed : (score !== null && score !== undefined ? score >= 60 : training.passed)
            const status = args.status || (passed ? 'completed' : 'in_progress')

            const updated = await tx.training.update({
              where: { id: training.id },
              data: {
                score,
                passed,
                status,
                notes: args.notes ? (training.notes ? `${training.notes}; ${args.notes}` : args.notes) : training.notes
              },
              include: { staff: true }
            })

            result = {
              success: true,
              message: `员工 "${updated.staff.name}" 培训《${updated.title}》考核结果登记完成：${score !== null ? score + '分' : '已记录'}，${passed ? '考核合格 ✅' : '未合格 ❌'}，状态已更新为 ${status}。`,
              trainingId: updated.id,
              staffName: updated.staff.name,
              title: updated.title,
              score,
              passed,
              status
            }
          }
        } else if (args.action === 'list_trainings') {
          const limit = args.limit || 20
          let staffIdFilter: string | undefined
          if (args.staffName) {
            const staff = await tx.staff.findFirst({
              where: { storeId: deps.storeId, name: { contains: args.staffName, mode: 'insensitive' } }
            })
            if (staff) staffIdFilter = staff.id
          } else if (args.staffId) {
            staffIdFilter = args.staffId
          }

          const records = await tx.training.findMany({
            where: {
              storeId: deps.storeId,
              ...(staffIdFilter ? { staffId: staffIdFilter } : {}),
              ...(args.status ? { status: args.status } : {})
            },
            include: { staff: { select: { id: true, name: true, position: true, employeeNumber: true } } },
            orderBy: { startDate: 'desc' },
            take: limit
          })

          result = {
            success: true,
            total: records.length,
            records: records.map((r: any) => ({
              id: r.id,
              staffName: r.staff?.name || r.staffId,
              title: r.title,
              type: r.trainingType,
              startDate: r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : null,
              durationHours: r.duration,
              status: r.status,
              score: r.score,
              passed: r.passed,
              notes: r.notes
            }))
          }
        } else if (args.action === 'list_courses') {
          const lib = await readTrainingLibrary(actor)
          result = {
            success: true,
            totalModules: lib.modules.length,
            totalChecklists: lib.checklists.length,
            modules: lib.modules.map((m: any) => ({
              key: m.key,
              title: m.title?.zh || m.title?.id,
              subtitle: m.subtitle?.zh || m.subtitle?.id,
              minutes: m.minutes,
              sectionsCount: m.sections?.length || 0,
              quizCount: m.quiz?.length || 0
            })),
            checklists: lib.checklists.map((c: any) => ({
              key: c.key,
              title: c.title?.zh || c.title?.id,
              itemCount: c.items?.length || 0
            }))
          }
        }

        value = result
        const evidence = { action: args.action, result }
        const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
        await writeTeam(tx, deps.storeId, 'employeeRuntime.trainingEvidence.' + fp, evidence)
        sources = [await readEmployeeRuntimeSource(tx, s.grant, s.scope, { kind: 'training_evidence', action: args.action, fingerprint: fp })]
      } else if (v.name === 'employee_remember_rule') {
        const rArgs = v.args as any
        const existingRules = (await readTeam<any>(tx, deps.storeId, 'employeeWorkflow.rules')) || [
          { category: 'poster_and_tv', rule: '活动海报与电视大屏展示必须自动优先拉取 16:9 横版高分辨率图片；若商品缺少横版图片，必须在媒体库中自适应拉取，或主动向管理员追问，绝不沉默。' },
          { category: 'pos_cashier', rule: '收银机端永远不能中断正常结账业务，所有预警与待核实订单均在后台处理，绝不阻塞收银端。' },
          { category: 'communication', rule: '对待管理员提出的任何问题或要求，必须给出详尽、有深度思考和清晰反馈的回答；如遇参数缺失或不确定的事项，必须主动追问并列出选项供确认。' }
        ]
        const newRule = {
          id: randomUUID(),
          category: rArgs.category || 'general',
          rule: rArgs.rule,
          createdAt: new Date(now()).toISOString()
        }
        existingRules.push(newRule)
        await writeTeam(tx, deps.storeId, 'employeeWorkflow.rules', existingRules)
        value = { success: true, message: `已成功记住并沉淀该项店铺流程规则：${rArgs.rule}`, totalRules: existingRules.length }
        const evidence = { action: 'remember_rule', result: value }
        const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
        await writeTeam(tx, deps.storeId, 'employeeRuntime.trainingEvidence.' + fp, evidence)
        sources = [await readEmployeeRuntimeSource(tx, s.grant, s.scope, { kind: 'training_evidence', action: 'remember_rule', fingerprint: fp })]
      }else if(v.name==='employee_send_message'){
        const args=sendMessage.parse(v.args)
        const bridge=createTeamAgentBridge(tx,{...deps,communication,messageCommitted:undefined})
        const reply=s.scope.requesterStaffId?s.sources.find(x=>x.source.kind==='conversation'&&(x.value as any)?.authorStaffId===s.scope.requesterStaffId):undefined
        if(s.scope.requesterStaffId&&!reply)fail('EMPLOYEE_RUNTIME_REQUESTER_SOURCE_REQUIRED')
        const r=await bridge.send({channelId:s.scope.channelId,task:s.scope.task,requestId:s.ticket.requestId,expectedLastSeq:(await readTeam<any>(tx,deps.storeId,'channel.'+s.scope.channelId)).lastSeq,text:args.text,...(reply?.source.kind==='conversation'?{replyToSeq:reply.source.seq}:{})})
        value={messageId:r.id,seq:r.seq,delivery:'stored',device:'unknown',expectsReply:args.expectsReply===true};s.lastSeq=r.seq
      }else fail('EMPLOYEE_RUNTIME_TOOL_DENIED')
      for(const source of sources)if(!s.sources.some(x=>hash(x.source)===hash(source.source)))s.sources.push(source)
      value=await visibleBusinessData(tx,s.grant,s.scope,value)
      await recordAgentExperience(tx,s.grant,s.scope,v.name,v.args,value)
      s.tools.push({turn:s.turn,toolCallId:v.toolCallId,name:v.name,value,sources,mutating:!v.name.startsWith('employee_read_')&&!['employee_recall_memory','employee_store_memory'].includes(v.name)&&!['list','list_active','list_products','query_products','list_low_stock','list_suppliers','query_revenue_summary','list_recent_expenses','list_pending_leaves','list_staff','list_tasks','list_areas'].includes((v.args as any)?.action)})
      if(s.responses.at(-1).providerMessage.tool_calls.every((c:any)=>s.tools.some(t=>t.toolCallId===c.id)))s.phase='input'
      return {traceVersion:s.version+1,value,sources}
    })},
    async recordOutput(raw){const v=employeeRuntimeOutputSchema.parse(raw);return mutate(v.executionId,v.expectedTraceVersion,async(_tx,s)=>{
      const last=s.responses.at(-1)
      if(s.phase!=='final'||last?.providerRequestId!==v.providerRequestId||hash(last.providerMessage)!==hash(v.providerMessage))fail()
      // A normal final assistant answer is itself a reply; it must not depend on
      // the model remembering a special send tool. Exact response/provenance checks
      // and the same native audience policy still apply, in this transaction.
      if(s.grant.actions.includes('messages.send')&&!s.tools.some(t=>t.name==='employee_send_message')){
        await assertToolSettings(_tx,deps.storeId,'employee_send_message',{})
        const bridge=createTeamAgentBridge(_tx,{...deps,communication,messageCommitted:undefined})
        const reply=s.scope.requesterStaffId?s.sources.find(x=>x.source.kind==='conversation'&&(x.value as any)?.authorStaffId===s.scope.requesterStaffId):undefined
        const c=await readTeam<any>(_tx,deps.storeId,'channel.'+s.scope.channelId)
        const r=await bridge.send({channelId:s.scope.channelId,task:s.scope.task,requestId:s.ticket.requestId,expectedLastSeq:c.lastSeq,text:v.providerMessage.content,...(reply?.source.kind==='conversation'?{replyToSeq:reply.source.seq}:{})})
        const value={messageId:r.id,seq:r.seq,delivery:'stored',device:'unknown',expectsReply:false}
        s.lastSeq=r.seq;s.tools.push({turn:s.turn,toolCallId:'final:'+v.providerRequestId,name:'employee_send_message',value,sources:[],mutating:true})
      }
      s.phase='complete';return {traceVersion:s.version+1,requestId:s.ticket.requestId,text:v.providerMessage.content}
    })},
    async markUnknown(id,version,code){
      await db.$transaction(async(tx:any)=>{await lockTeam(tx,deps.storeId,key(id));const s=await load(tx,id)
        // Crash cleanup is permitted after revocation/expiry, but never resumes tools.
        if(s.phase==='complete'||s.phase==='unknown')return
        if(s.version<version)fail();s.phase='unknown';s.version++;s.fault={code:/^[A-Z0-9_]{1,100}$/.test(code)?code:'EMPLOYEE_RUNTIME_UNCONFIRMED',at:new Date(now()).toISOString()};await writeTeam(tx,deps.storeId,key(id),s)
      })
    },
  }
  const provider = {
    async assertFresh(executionId:string,turn:number,inputHash:string,providerRequest?:unknown) {
      await db.$transaction(async(tx:any)=>{
        await lockTeam(tx,deps.storeId,key(executionId));const s=await load(tx,executionId);await fresh(tx,s)
        const receipt=await readTeam<any>(tx,deps.storeId,key(executionId)+'.provider.'+turn)
        if(s.phase!=='response'||s.turn!==turn||hash(s.inputs.at(-1))!==inputHash||receipt?.state!=='reserved'||receipt.inputHash!==inputHash)fail('EMPLOYEE_RUNTIME_PROVIDER_INPUT_CHANGED')
        if(providerRequest){
          if(receipt.startedAt)fail('EMPLOYEE_RUNTIME_PROVIDER_ALREADY_STARTED')
          await writeTeam(tx,deps.storeId,key(executionId)+'.provider.'+turn,{...receipt,startedAt:new Date(now()).toISOString(),providerRequest:structuredClone(providerRequest)})
        }
      })
    },
    /** Same trace lock, separate admission receipt: no trace-version bump while
     * the trusted child is awaiting the provider's response. */
    async claim(executionId:string,inputHash:string) {
      return db.$transaction(async(tx:any)=>{
        await lockTeam(tx,deps.storeId,key(executionId));const s=await load(tx,executionId);await fresh(tx,s)
        const request=s.inputs.at(-1)
        if(s.phase!=='response'||!request||hash(request)!==inputHash)fail('EMPLOYEE_RUNTIME_PROVIDER_INPUT_CHANGED')
        const admissionKey=key(executionId)+'.provider.'+s.turn
        if(await readTeam(tx,deps.storeId,admissionKey))fail('EMPLOYEE_RUNTIME_PROVIDER_ALREADY_RESERVED')
        const config=await readTeam<any>(tx,deps.storeId,'ai.settings')
        if(!config?.version)fail('EMPLOYEE_RUNTIME_MODEL_CONFIG_UNAVAILABLE')
        await writeTeam(tx,deps.storeId,admissionKey,{state:'reserved',inputHash,turn:s.turn,at:new Date(now()).toISOString(),configVersion:config.version})
        return {storeId:deps.storeId,executionId,turn:s.turn,inputHash,request,configVersion:config.version,deadlineAt:Date.parse(s.expiresAt)}
      })
    },
    async settle(executionId:string,turn:number,inputHash:string,result:{state:'response';value:any}|{state:'unknown'}) {
      await db.$transaction(async(tx:any)=>{
        await lockTeam(tx,deps.storeId,key(executionId));const s=await load(tx,executionId),k=key(executionId)+'.provider.'+turn
        const receipt=await readTeam<any>(tx,deps.storeId,k)
        if(!receipt||receipt.inputHash!==inputHash||receipt.state!=='reserved'||s.turn!==turn)fail('EMPLOYEE_RUNTIME_PROVIDER_RECEIPT_CONFLICT')
        // Result evidence survives expiry/revocation; no further operation is
        // authorized by saving it. Unknown never releases the reservation.
        await writeTeam(tx,deps.storeId,k,{...receipt,...result,completedAt:new Date(now()).toISOString()})
        if(result.state==='unknown'&&s.phase!=='complete'){s.phase='unknown';s.version++;s.fault={code:'EMPLOYEE_RUNTIME_PROVIDER_OUTCOME_UNKNOWN',at:new Date(now()).toISOString()};await writeTeam(tx,deps.storeId,key(executionId),s)}
      })
    },
  }
  return {host,communication,provider,async inspect(id:string){const s=await load(db,id);const g=await fresh(db);if(hash(g)!==hash(s.grant))fail();return {executionId:id,phase:s.phase,version:s.version,turn:s.turn,fault:s.fault}},async recover(id:string){const s=await load(db,id);if(s.phase!=='complete')await host.markUnknown(id,s.version,'EMPLOYEE_RUNTIME_PROCESS_INTERRUPTED')}}
}
