export interface CheckIdentity { userId:string; storeId:string }
export interface CheckScope { version:number; region:'global'|'cn'; model:string }
export interface CheckTicket extends CheckIdentity, CheckScope { requestId:string; expectedCheckRevision:number }
const key=(identity:CheckIdentity,scope:CheckScope)=>'bubble-tea:ai-check:'+encodeURIComponent(identity.userId)+':'+encodeURIComponent(identity.storeId)+':'+scope.version
export function readCheckTicket(identity:CheckIdentity,scope:CheckScope):CheckTicket|null {
 const value=localStorage.getItem(key(identity,scope));if(!value)return null
 const ticket=JSON.parse(value) as CheckTicket
 if(ticket.userId!==identity.userId||ticket.storeId!==identity.storeId||ticket.version!==scope.version||ticket.region!==scope.region||ticket.model!==scope.model||!Number.isSafeInteger(ticket.expectedCheckRevision)||ticket.expectedCheckRevision<0||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticket.requestId))throw Error('INVALID_CHECK_JOURNAL')
 return ticket
}
export function writeCheckTicket(ticket:CheckTicket) {
 localStorage.setItem(key(ticket,ticket),JSON.stringify(ticket))
 if(readCheckTicket(ticket,ticket)?.requestId!==ticket.requestId)throw Error('CHECK_JOURNAL_NOT_SAVED')
}
export function finishCheckTicket(ticket:CheckTicket) {
 const current=readCheckTicket(ticket,ticket)
 if(current?.requestId===ticket.requestId)localStorage.removeItem(key(ticket,ticket))
}
