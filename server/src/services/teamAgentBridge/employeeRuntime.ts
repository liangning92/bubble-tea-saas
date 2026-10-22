import { randomUUID } from 'crypto'
import { z } from 'zod'
import { TeamChannel, TeamError, readTeam, writeTeam, lockTeam } from '../TeamCommunicationService'
import { createTeamAgentBridge } from './service'
import { employeeSystemTemplateHash } from './employeeRuntimeSystem'
import { readAuthorizedBridgeChannel } from './directDelegation'
import { readEmployeeInventoryEvidence } from './employeeInventoryEvidence'
import { TEAM_AGENT_PREFIX } from './events'
import { BridgeDependencies, BridgeGrant, CommunicationPolicyPort, CommunicationScope, CommunicationSource, grantSchema } from './contract'
import { readCommunicationScope, textHash } from './confidentiality'
import { employeeRuntimeDigest as hash, employeeRuntimePrivate, readEmployeeRuntimeSource } from './employeeRuntimeSources'
import { EMPLOYEE_RUNTIME_INSTRUCTION, EMPLOYEE_RUNTIME_PROTOCOL, EmployeeRuntimeHostPort, EmployeeRuntimeSource, EmployeeRuntimeTicket, employeeRuntimeInputSchema, employeeRuntimeOutputSchema, employeeRuntimeResponseSchema, employeeRuntimeToolSchema } from './employeeRuntimeContract'

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
const history=(messages:any[])=>messages.map(m=>m.tool_calls?{...m,tool_calls:m.tool_calls.map((c:any)=>({...c,function:{...c.function,arguments:JSON.parse(c.function.arguments)}}))}:m)
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
  const atomic = (tx: any) => ({ config: tx.config, staff: tx.staff, user: tx.user, financeAuditLog: tx.financeAuditLog, store: tx.store, inventory:tx.inventory, inventoryCountItem:tx.inventoryCountItem, $transaction: async (operation: any) => operation(atomic(tx)) })
  async function fresh(tx: any, s?: State) {
    if (deps.enabled !== true) fail('EMPLOYEE_RUNTIME_DISABLED')
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
      for (const source of s.sources) if (hash(await readEmployeeRuntimeSource(tx,g,scope,source.source)) !== hash(source)) fail('EMPLOYEE_RUNTIME_SOURCE_CHANGED')
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
      await readEmployeeRuntimeSource(tx,g,scope,source)
      return { dataClasses:['operational'] }
    },
    async admitOutput(tx,g,scope,input) {
      const p = await readTeam<any>(tx,g.storeId,pointer(scope)), s = p && await load(tx,p.executionId)
      if (!s || s.phase !== 'tools' || hash(g)!==hash(s.grant) || hash({...scope,executionId:undefined})!==hash(s.scope)) fail()
      await fresh(tx,s)
      const response = s.responses.at(-1)
      const call = response?.providerMessage.tool_calls?.find((c:any)=>c.function.name==='employee_send_message')
      const args = call && sendMessage.parse(JSON.parse(call.function.arguments))
      if (!args || input.purpose !== 'message' || input.requestId !== s.ticket.requestId || textHash(args.text)!==input.textHash || employeeRuntimePrivate(args.text)) fail()
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
        if (previous) { const old = await load(tx,previous.executionId); if (old.phase!=='complete') fail('EMPLOYEE_RUNTIME_PREVIOUS_UNRESOLVED') }
        const facts:EmployeeRuntimeSource[]=[]
        for(const source of sources) facts.push(await readEmployeeRuntimeSource(tx,g,scope,source))
        const executionId=randomUUID(),requestId=randomUUID(),tools=[]
        if(g.actions.includes('messages.read')) tools.push(fn('employee_read_message','Read one current audience-visible message',{seq:{type:'integer',minimum:1}},['seq']))
        if(g.actions.includes('tasks.read')) tools.push(fn('employee_read_task','Read this assigned employee task',{},[]))
        if(g.actions.includes('inventory.read')) tools.push(fn('employee_read_inventory','Read authorized book inventory and certified physical-count evidence for any named item; no costs, no writes, ambiguous matches require clarification',{query:{type:'string',minLength:1,maxLength:80}},['query']))
        if(g.actions.includes('messages.send')) tools.push(fn('employee_send_message','Send at most one natural operational reply in this execution to this exact current audience; set expectsReply only for a question requiring new staff facts, not an acknowledgement',{text:{type:'string',minLength:1,maxLength:4000},expectsReply:{type:'boolean'}},['text']))
        const ticket:EmployeeRuntimeTicket={ protocol:EMPLOYEE_RUNTIME_PROTOCOL,executionId,requestId,traceVersion:1,compartmentKey:scope.compartmentKey,audienceHash:scope.audienceHash,
          inputContextHash:hash(facts),toolSchemaHash:hash(canonicalTools(tools)),sealedUserContent:JSON.stringify({task:scope.task,capabilities:{replyRoute:'Use employee_send_message for a relevant employee answer or clarification. The final assistant response is an internal report, never automatically posted to the employee. Report actions and blockers honestly.',conversation:'Free operational questions and clarification; not limited to one item or fixed phrases',actions:'Only the issued tools can execute actions. Without an implementing tool, explain that leave/profile/purchase changes have not been performed; never promise completion or approval.',restrictedRequests:'No extra data grant. Explain the access boundary without fetching data or asking for private details.',evidence:'Book stock is not a physical count. A report is not manager acceptance.'},facts:facts.map(f=>f.value)}),instruction:EMPLOYEE_RUNTIME_INSTRUCTION,
          isolation:{protocol:EMPLOYEE_RUNTIME_PROTOCOL,profile:'employee_work',sessionId:'employee_work_'+hash([executionId,scope.compartmentKey]),compartmentKey:scope.compartmentKey,memoryNamespace:scope.compartmentKey,memoryEnabled:false,contextFilesEnabled:false,auxiliaryModelsEnabled:false,sharedHistoryEnabled:false,builtinToolsEnabled:false},model:'MiniMax-M3.1-Flash',tools }
        const s:State={ticket,grant:g,scope,expiresAt:new Date(Math.min(Date.parse(g.expiresAt),now()+Math.min(deps.maxExecutionMs||60000,120000))).toISOString(),version:1,phase:'input',turn:0,sources:facts,inputs:[],responses:[],tools:[],lastSeq:c.lastSeq}
        await writeTeam(tx,g.storeId,key(executionId),s);await writeTeam(tx,g.storeId,pointer(scope),{executionId})
        return ticket
      })
    },
    async recordInput(raw) {
      const v=employeeRuntimeInputSchema.parse(raw)
      return mutate(v.executionId,v.expectedTraceVersion,async(_tx,s)=>{
        if(s.phase!=='input'||v.turn!==s.turn+1||v.turn>3) fail('EMPLOYEE_RUNTIME_SEND_ALREADY_RESERVED')
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
      let invalid=(v.finishReason==='tool_calls' ? !calls.length : calls.length>0||!v.providerMessage.content) || calls.length>5 || new Set(calls.map(c=>c.id)).size!==calls.length || calls.some(c=>!s.ticket.tools.some(t=>t.function.name===c.function.name))
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
      if(v.name==='employee_read_message'){
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
      }else if(v.name==='employee_send_message'){
        const args=sendMessage.parse(v.args)
        const bridge=createTeamAgentBridge(tx,{...deps,communication,messageCommitted:undefined})
        const reply=s.scope.requesterStaffId?s.sources.find(x=>x.source.kind==='conversation'&&(x.value as any)?.authorStaffId===s.scope.requesterStaffId):undefined
        if(s.scope.requesterStaffId&&!reply)fail('EMPLOYEE_RUNTIME_REQUESTER_SOURCE_REQUIRED')
        const r=await bridge.send({channelId:s.scope.channelId,task:s.scope.task,requestId:s.ticket.requestId,expectedLastSeq:s.lastSeq,text:args.text,...(reply?.source.kind==='conversation'?{replyToSeq:reply.source.seq}:{})})
        value={messageId:r.id,seq:r.seq,delivery:'stored',device:'unknown',expectsReply:args.expectsReply===true};s.lastSeq=r.seq
      }else fail('EMPLOYEE_RUNTIME_TOOL_DENIED')
      for(const source of sources)if(!s.sources.some(x=>hash(x.source)===hash(source.source)))s.sources.push(source)
      s.tools.push({turn:s.turn,toolCallId:v.toolCallId,name:v.name,value,sources})
      if(s.responses.at(-1).providerMessage.tool_calls.every((c:any)=>s.tools.some(t=>t.toolCallId===c.id)))s.phase='input'
      return {traceVersion:s.version+1,value,sources}
    })},
    async recordOutput(raw){const v=employeeRuntimeOutputSchema.parse(raw);return mutate(v.executionId,v.expectedTraceVersion,async(_tx,s)=>{
      const last=s.responses.at(-1)
      if(s.phase!=='final'||last?.providerRequestId!==v.providerRequestId||hash(last.providerMessage)!==hash(v.providerMessage)||employeeRuntimePrivate(v.providerMessage.content))fail()
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
