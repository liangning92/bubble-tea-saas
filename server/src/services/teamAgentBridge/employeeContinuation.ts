import { randomUUID } from 'crypto'
import { z } from 'zod'
import { lockTeam, readTeam, writeTeam, TeamError } from '../TeamCommunicationService'
import { TaskRef, taskRefSchema } from './contract'

const eventSchema = z.object({ channelId:z.string().uuid(), sourceMessageId:z.string().uuid(), sourceSeq:z.number().int().positive(), sourceStaffId:z.string().min(1) }).strict()
export type EmployeeContinuationEvent = z.infer<typeof eventSchema>
export interface EmployeeContinuationAuthority { fromSeq:number; expiresAt:string; authorizationVersion:string }
export interface EmployeeContinuationReservation { id:string; task:TaskRef; event:EmployeeContinuationEvent; authorizationVersion:string; startedAt?:string; runtimeExecutionId?:string }
export interface EmployeeContinuationPorts {
  enabled?:boolean; storeId:string; now?:()=>number; executionDeadlineMs?:number
  /** Must re-read actual human message, current membership/fromSeq, binding, grant and single-consumer routing. No model/body identity. */
  authorize(tx:any,event:EmployeeContinuationEvent):Promise<EmployeeContinuationAuthority>
  /** Reuse/create the authorized native task atomically on first event; assert the SAME task on continuation. Never repurpose STOCK-RO-001 implicitly. */
  resolveTask(tx:any,event:EmployeeContinuationEvent,existing?:TaskRef):Promise<TaskRef>
  /** Outside the DB transaction. The stable reservation ID is for trusted host correlation, not permission. No automatic retry after this call. */
  execute(reservation:EmployeeContinuationReservation):Promise<{runtimeExecutionId:string}>
  /** Authoritative persisted runtime + actual native outbound receipt, never model's 'done' or caller's supplied question. */
  readExecution(tx:any,reservation:EmployeeContinuationReservation):Promise<{phase:'running'|'complete'|'unknown'; question?:{messageId:string;seq:number}; reportId?:string}>
  /** Decide whether a reservation whose authorization window closed can be released.
   * Only the persisted runtime decides: a released reservation must have produced no
   * outbound employee receipt, otherwise the employee's message was already answered. */
  readAbandoned(tx:any,reservation:EmployeeContinuationReservation):Promise<{releasable:boolean;reason:string}>
}
interface State { lastSource:EmployeeContinuationEvent; version:number; channelId:string; task:TaskRef; phase:'ready'|'running'|'waiting_for_staff'|'awaiting_review'|'unknown'; queue:EmployeeContinuationEvent[]; active?:EmployeeContinuationReservation; lastConsumedSeq:number; question?:{messageId:string;seq:number}; reportId?:string; fault?:{code:string;at:string} }
const key=(channel:string)=>'employeeContinuation.channel.'+channel
const eventKey=(id:string)=>'employeeContinuation.event.'+id
const executionKey=(id:string)=>'employeeContinuation.execution.'+id
const fail=(code:string):never=>{throw new TeamError(409,code)}
const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b)
const observationSchema=z.object({phase:z.enum(['running','complete','unknown']),question:z.object({messageId:z.string().uuid(),seq:z.number().int().positive()}).strict().optional(),reportId:z.string().min(1).optional()}).strict().refine(x=>x.phase!=='complete'||!!x.question||!!x.reportId,'COMPLETE_REQUIRES_STORED_QUESTION_OR_REPORT')

/** Default-disabled orchestration metadata in existing Config; the linked TeamTask remains authoritative. No new scheduler or task store. */
export function createEmployeeContinuation(db:any,ports:EmployeeContinuationPorts) {
  const now=()=>ports.now?.()??Date.now()
  const stamp=()=>new Date(now()).toISOString()
  const enabled=()=>{if(ports.enabled!==true)fail('EMPLOYEE_CONTINUATION_DISABLED')}
  async function authority(tx:any,e:EmployeeContinuationEvent,expected?:string) {
    enabled();const a=await ports.authorize(tx,e)
    if(!a||!Number.isInteger(a.fromSeq)||a.fromSeq<1||e.sourceSeq<a.fromSeq||!a.authorizationVersion||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=now())fail('EMPLOYEE_CONTINUATION_SOURCE_NOT_AUTHORIZED')
    if(expected&&a.authorizationVersion!==expected)fail('EMPLOYEE_CONTINUATION_AUTHORIZATION_CHANGED')
    return a
  }
  async function locked<T>(channelId:string,fn:(tx:any,s:State|null)=>Promise<T>) {
    return db.$transaction(async(tx:any)=>{await lockTeam(tx,ports.storeId,key(channelId));return fn(tx,await readTeam<State>(tx,ports.storeId,key(channelId)))})
  }
  async function save(tx:any,s:State) {s.version++;await writeTeam(tx,ports.storeId,key(s.channelId),s)}
  return {
    async receive(raw:EmployeeContinuationEvent) {
      enabled();const e=eventSchema.parse(raw)
      return db.$transaction(async(tx:any)=>{
        // Global source-id lock precedes channel lock, including invalid cross-channel replays.
        await lockTeam(tx,ports.storeId,eventKey(e.sourceMessageId));await lockTeam(tx,ports.storeId,key(e.channelId))
        const a=await authority(tx,e),prior=await readTeam<any>(tx,ports.storeId,eventKey(e.sourceMessageId))
        if(prior){if(!same(prior.event,e))fail('EMPLOYEE_CONTINUATION_EVENT_CONFLICT');return {event:prior,duplicate:true}}
        let s=await readTeam<State>(tx,ports.storeId,key(e.channelId))
        const task=taskRefSchema.parse(await ports.resolveTask(tx,e,s?.task))
        if(s&&task.taskId!==s.task.taskId)fail('EMPLOYEE_CONTINUATION_TASK_CHANGED')
        if(!s)s={lastSource:e,version:0,channelId:e.channelId,task,phase:'ready',queue:[],lastConsumedSeq:0}
        s.task=task;s.lastSource=e
        // An unseen late event is still real work. Event-id receipts, not a sequence watermark, prevent replay.
        const status='pending'
        if(s.queue.some(x=>x.sourceSeq===e.sourceSeq))fail('EMPLOYEE_CONTINUATION_SEQUENCE_CONFLICT')
        if(status==='pending'){if(s.queue.length>=1000)fail('EMPLOYEE_CONTINUATION_BACKLOG_FULL');s.queue.push(e);s.queue.sort((x,y)=>x.sourceSeq-y.sourceSeq)}
        const receipt={event:e,taskId:task.taskId,status,authorizationVersion:a.authorizationVersion,receivedAt:stamp()}
        await writeTeam(tx,ports.storeId,eventKey(e.sourceMessageId),receipt);await save(tx,s)
        return {event:receipt,duplicate:false}
      })
    },
    async dispatchPending(channelId:string) {
      enabled();z.string().uuid().parse(channelId)
      const reservation=await locked(channelId,async(tx,s)=>{
        if(!s||s.active||!['ready','waiting_for_staff','awaiting_review'].includes(s.phase)||!s.queue.length)return null
        const event=s.queue[0],a=await authority(tx,event),task=taskRefSchema.parse(await ports.resolveTask(tx,event,s.task))
        if(task.taskId!==s.task.taskId)fail('EMPLOYEE_CONTINUATION_TASK_CHANGED')
        const r:EmployeeContinuationReservation={id:randomUUID(),event,task,authorizationVersion:a.authorizationVersion,startedAt:stamp()}
        s.task=task;s.active=r;s.phase='running';s.queue.shift();s.lastConsumedSeq=Math.max(s.lastConsumedSeq,event.sourceSeq);delete s.question;delete s.reportId
        await writeTeam(tx,ports.storeId,executionKey(r.id),{reservation:r,status:'running'})
        const receipt=await readTeam<any>(tx,ports.storeId,eventKey(event.sourceMessageId));await writeTeam(tx,ports.storeId,eventKey(event.sourceMessageId),{...receipt,status:'running',executionId:r.id})
        await save(tx,s);return r
      })
      if(!reservation)return {started:false}
      try {
        const result=await ports.execute(structuredClone(reservation));z.string().uuid().parse(result.runtimeExecutionId)
        const status=await locked(channelId,async(tx,s)=>{
          const saved=await readTeam<any>(tx,ports.storeId,executionKey(reservation.id))
          if(!saved||saved.reservation.id!==reservation.id||!same(saved.reservation.event,reservation.event))fail('EMPLOYEE_CONTINUATION_EXECUTION_CHANGED')
          if(saved.reservation.runtimeExecutionId&&saved.reservation.runtimeExecutionId!==result.runtimeExecutionId)fail('EMPLOYEE_CONTINUATION_RUNTIME_MAPPING_CHANGED')
          saved.reservation.runtimeExecutionId=result.runtimeExecutionId
          if(s?.active?.id===reservation.id){s.active.runtimeExecutionId=result.runtimeExecutionId;await save(tx,s)}
          else if(!['waiting_for_staff','awaiting_review'].includes(saved.status))fail('EMPLOYEE_CONTINUATION_EXECUTION_CHANGED')
          await writeTeam(tx,ports.storeId,executionKey(reservation.id),saved)
          return saved.status

        })
        return {started:true,executionId:reservation.id,runtimeExecutionId:result.runtimeExecutionId,status}
      }catch(_error){
        // Any error after invoking the execution port may mean admission occurred. Preserve correlation, never auto retry.
        await locked(channelId,async(tx,s)=>{if(s?.active?.id===reservation.id&&s.phase==='running'){s.phase='unknown';s.fault={code:'EMPLOYEE_CONTINUATION_ADMISSION_UNKNOWN',at:stamp()};await writeTeam(tx,ports.storeId,executionKey(reservation.id),{reservation:s.active,status:'unknown',fault:s.fault});await save(tx,s)}})
        return {started:true,executionId:reservation.id,status:'unknown' as const}
      }
    },
    async reconcile(channelId:string,executionId:string) {
      enabled();z.string().uuid().parse(channelId);z.string().uuid().parse(executionId)
      return locked(channelId,async(tx,s)=>{
        const saved=await readTeam<any>(tx,ports.storeId,executionKey(executionId))
        if(!s||!saved||saved.reservation.event.channelId!==channelId)fail('EMPLOYEE_CONTINUATION_EXECUTION_NOT_FOUND')
        // A renewed grant changes the authorization version of an unfinished reservation.
        // Every other authority check still has to pass; only the version difference is
        // tolerated, and an invalid or expired current authority keeps failing closed.
        let rotated=false
        try{await authority(tx,saved.reservation.event,saved.reservation.authorizationVersion)}
        catch(error:any){if(error?.message!=='EMPLOYEE_CONTINUATION_AUTHORIZATION_CHANGED')throw error;rotated=true}
        if(rotated){
          if(!s.active||s.active.id!==executionId)fail('EMPLOYEE_CONTINUATION_EXECUTION_CHANGED')
          const release=await ports.readAbandoned(tx,s.active)
          if(!release.releasable)fail('EMPLOYEE_CONTINUATION_RELEASE_REFUSED')
          // Release the abandoned turn and re-queue its source message so the renewed
          // window can answer it. No execution, model call or employee receipt is reused.
          delete s.active;s.phase='ready';s.fault={code:'EMPLOYEE_CONTINUATION_AUTHORIZATION_ROTATED',at:stamp()}
          if(!s.queue.some(x=>x.sourceSeq===saved.reservation.event.sourceSeq))s.queue.push(saved.reservation.event)
          s.queue.sort((x,y)=>x.sourceSeq-y.sourceSeq)
          await writeTeam(tx,ports.storeId,executionKey(executionId),{reservation:saved.reservation,status:'released',fault:s.fault})
          await save(tx,s);return {status:'released'}
        }
        const task=taskRefSchema.parse(await ports.resolveTask(tx,saved.reservation.event,s.task));if(task.taskId!==s.task.taskId)fail('EMPLOYEE_CONTINUATION_TASK_CHANGED')
        if(['waiting_for_staff','awaiting_review'].includes(saved.status))return saved
        if(!s.active||s.active.id!==executionId)fail('EMPLOYEE_CONTINUATION_EXECUTION_CHANGED')
        const observed=observationSchema.parse(await ports.readExecution(tx,s.active)) as Awaited<ReturnType<EmployeeContinuationPorts['readExecution']>>
        if(observed.phase==='running'&&now()-Date.parse(s.active.startedAt!)<(ports.executionDeadlineMs||120000))return {status:s.phase}
        if(observed.phase==='running'||observed.phase==='unknown'){
          s.phase='unknown';s.fault={code:observed.phase==='running'?'EMPLOYEE_CONTINUATION_EXECUTION_TIMEOUT':'EMPLOYEE_CONTINUATION_EXECUTION_UNKNOWN',at:stamp()}
          await writeTeam(tx,ports.storeId,executionKey(executionId),{reservation:s.active,status:'unknown',fault:s.fault});await save(tx,s);return {status:'unknown'}
        }
        // A known completed receipt can resolve unknown without another execution or model call.
        if(observed.question&&(!z.string().uuid().safeParse(observed.question.messageId).success||!Number.isInteger(observed.question.seq)||observed.question.seq<=s.active.event.sourceSeq))fail('EMPLOYEE_CONTINUATION_QUESTION_RECEIPT_INVALID')
        s.phase=observed.question?'waiting_for_staff':'awaiting_review';s.question=observed.question;s.reportId=observed.reportId
        const receipt={reservation:s.active,status:s.phase,question:s.question,reportId:s.reportId,finishedAt:stamp()}
        await writeTeam(tx,ports.storeId,executionKey(executionId),receipt)
        const source=await readTeam<any>(tx,ports.storeId,eventKey(s.active.event.sourceMessageId));await writeTeam(tx,ports.storeId,eventKey(s.active.event.sourceMessageId),{...source,status:s.phase})
        delete s.active;await save(tx,s);return receipt
      })
    },
    async get(channelId:string) {
      enabled();z.string().uuid().parse(channelId)
      return locked(channelId,async(tx,s)=>{if(!s)return null;await authority(tx,s.lastSource);return s})
    }
  }
}
