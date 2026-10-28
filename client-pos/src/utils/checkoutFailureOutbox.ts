// Only failure diagnostics live here: never credentials or requests that create a sale.
export interface FailureScope { backend: string; storeId: string; actorId: string }
export interface FailureEvent { eventId: string; action: string; sessionId: string; description: string; entityId?: string; metadata?: Record<string,any>; severity?: 'info'|'warning'|'critical' }
const prefix = (scope: FailureScope) => `pos.checkout-failure:${encodeURIComponent(scope.backend)}:${encodeURIComponent(scope.storeId)}:${encodeURIComponent(scope.actorId)}:`
const flushing = new Map<string,Promise<void>>()
export function flushCheckoutFailures(scope: FailureScope, send: (event:FailureEvent)=>Promise<unknown>, storage: Storage = localStorage): Promise<void> {
 const base = prefix(scope)
 const active = flushing.get(base)
 if (active) return active
 const task = (async()=>{
  const keys = Array.from({length:storage.length},(_,index)=>storage.key(index)).filter((key):key is string=>!!key?.startsWith(base))
  for (const key of keys) {
   const raw = storage.getItem(key)
   if (!raw) continue
   let event:FailureEvent
   try { event=JSON.parse(raw);if(event.action!=='checkout_failed'||key!==base+event.eventId)continue } catch { continue }
   try { await send(event) } catch { break }
   // Only remove exactly the acknowledged diagnostic. A failed HTTP reply leaves it for retry.
   if (storage.getItem(key)===raw) storage.removeItem(key)
  }
 })().finally(()=>flushing.delete(base))
 flushing.set(base,task)
 return task
}
export async function reportCheckoutFailure(scope: FailureScope, input:Omit<FailureEvent,'eventId'>, send:(event:FailureEvent)=>Promise<unknown>, storage:Storage=localStorage):Promise<void> {
 const event:FailureEvent={...input,eventId:crypto.randomUUID(),metadata:{...input.metadata,occurredAt:new Date().toISOString()},severity:'warning'}
 try { storage.setItem(prefix(scope)+event.eventId,JSON.stringify(event)) }
 catch { await send(event);return }
 await flushCheckoutFailures(scope,send,storage)
}
