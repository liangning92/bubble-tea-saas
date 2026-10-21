import { createHash } from 'crypto'
import { z } from 'zod'
import { TeamError } from '../TeamCommunicationService'
import { userAccessV2 } from '../StaffPermissionV2Service'
import { buildTeamStockReadOnlySource, StockReadOnlySnapshot } from '../TeamStockReadOnlySource'
import { readAuthorizedBridgeChannel, directDelegationAudienceHash } from './directDelegation'
import type { BridgeGrant, CommunicationScope } from './contract'

export interface EmployeeInventoryEvidence {
  items: Array<{ id:string; name:string; unit:string; bookQuantity:number; bookUpdatedAt:string;
    physicalEvidence: null | { observedAt:string|null; unit:string|null; bookQuantityAtObservation:number|null;
      physicalQuantity:number|null; historicalComparable:boolean; historicalDifference:number|null;
      currentComparable:boolean; currentDifference:number|null; blockers:string[] };
    blockers:string[] }>;
  sourceRefs:string[]; fingerprint:string; hasMoreMatches:boolean
}
export type EmployeeInventoryEvidencePort = (db:any,grant:BridgeGrant,scope:CommunicationScope,input:{query:string})=>Promise<EmployeeInventoryEvidence>
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const deny=():never=>{throw new TeamError(403,'TEAM_EMPLOYEE_INVENTORY_ACCESS_DENIED')}
const inputSchema=z.object({query:z.string().trim().min(1).max(80).refine(q=>!/[\\%_]/.test(q),'LITERAL_INVENTORY_QUERY_REQUIRED')}).strict()
async function authorize(db:any,g:BridgeGrant,scope:CommunicationScope) {
  if(g.revoked||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=Date.now()||!(g.actions as readonly string[]).includes('inventory.read')||!scope.channelId||!scope.requesterStaffId)deny()
  const access=await readAuthorizedBridgeChannel(db,g,scope.task,scope.channelId)
  const audience=access.channel.members.filter(m=>m.staffId!=='agent:'+g.agentId).map(m=>m.staffId).sort()
  if(!audience.length||new Set(scope.audienceStaffIds).size!==scope.audienceStaffIds.length||JSON.stringify(audience)!==JSON.stringify([...scope.audienceStaffIds].sort())||scope.audienceHash!==directDelegationAudienceHash(access.channel)||!audience.includes(scope.requesterStaffId))deny()
  const people=await db.staff.findMany({where:{storeId:g.storeId,id:{in:audience},status:'active'},select:{id:true,userId:true,user:{select:{id:true,storeId:true,role:true}}}})
  if(people.length!==audience.length)deny()
  const permissions=[]
  for(const person of people.sort((a:any,b:any)=>a.id.localeCompare(b.id))){
    if(!person.user||person.user.id!==person.userId||person.user.storeId!==g.storeId)deny()
    const acl=await userAccessV2({staffId:person.id,storeId:g.storeId,role:person.user.role},db)
    // userAccessV2 returns null for a real admin: preserve its intrinsic system
    // permission, but never apply the sponsor's role to any other recipient.
    if(person.user.role!=='admin'&&acl?.modes['inventory.read']!=='allow')deny()
    permissions.push({staffId:person.id,userId:person.user.id,role:person.user.role,revision:acl?.revision??null,inventoryRead:person.user.role==='admin'?'allow':acl!.modes['inventory.read']})
  }
  return hash({storeId:g.storeId,agentId:g.agentId,grantVersion:g.version,clientRevision:g.clientRevision,expiresAt:g.expiresAt,task:scope.task,channelId:scope.channelId,audienceHash:scope.audienceHash,requesterStaffId:scope.requesterStaffId,compartmentKey:scope.compartmentKey,permissions})
}

/** Bounded name/id search, no costs or operational writes. Caller's runtime must
 * separately re-resolve the grant and task ACL and persist this source manifest.
 * Historical physical observations never imply today's physical stock. */
export async function readEmployeeInventoryEvidence(db:any,g:BridgeGrant,scope:CommunicationScope,input:{query:string}):Promise<EmployeeInventoryEvidence> {
  const {query}=inputSchema.parse(input)
  if(typeof db.$transaction!=='function')throw new Error('EMPLOYEE_INVENTORY_TRANSACTION_REQUIRED')
  const captured:{snapshot:StockReadOnlySnapshot;permissionHash:string;proofs:Record<string,string>}=await db.$transaction(async(tx:any)=>{
    const permissionHash=await authorize(tx,g,scope),proofs:Record<string,string>={}
    // Reuse the certified count/boundary checks while restricting the original
    // snapshot reader's only inventory query. Never fetch the whole store.
    const bounded={...tx,config:{findUnique:async(args:any)=>{const row=await tx.config.findUnique(args);proofs[args.where.storeId_key.key]=hash(row?.value??null);return row}},inventory:{findMany:(args:any)=>tx.inventory.findMany({...args,where:{...args.where,OR:[{id:query},{name:{contains:query,mode:'insensitive'}}]},take:11})}}
    const snapshot=await buildTeamStockReadOnlySource({$transaction:(fn:any)=>fn(bounded)},g.storeId)
    return {snapshot,permissionHash,proofs}
  },{isolationLevel:'RepeatableRead'})
  if(await authorize(db,g,scope)!==captured.permissionHash)deny() // Refuse ACL/audience changes during snapshot I/O.
  const chosen=captured.snapshot.items.slice(0,10)
  const items:EmployeeInventoryEvidence['items']=chosen.map(row=>({id:row.id,name:row.name,unit:row.unit,bookQuantity:row.stock,bookUpdatedAt:row.updatedAt,
    physicalEvidence:row.observation?{observedAt:row.observation.observedAt,unit:row.observation.unit,bookQuantityAtObservation:row.observation.bookStockAtObservation,
      physicalQuantity:row.observation.physicalStock,historicalComparable:row.observation.comparable,historicalDifference:row.observation.difference,
      currentComparable:row.currentComparable,currentDifference:row.currentDifference,blockers:row.observation.blockers}:null,blockers:row.blockers}))
  const sourceRefs=chosen.flatMap(row=>[row.sourceId,...(row.observation?.sourceIds||[])])
  const facts={items,sourceRefs,hasMoreMatches:captured.snapshot.items.length>10}
  return {...facts,fingerprint:hash({facts,permissionHash:captured.permissionHash,nativeEvidence:chosen,proofs:chosen.filter(row=>row.observation).map(row=>({itemId:row.observation!.itemId,hash:captured.proofs['inventoryCountObservation.'+row.observation!.itemId]}))})}
}
