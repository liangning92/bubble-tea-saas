import { audienceAllows } from './employeeAccess'
import { createHash } from 'crypto'
import { z } from 'zod'
import { TeamError } from '../TeamCommunicationService'
import { userAccessV2 } from '../StaffPermissionV2Service'
import { buildTeamStockReadOnlySource, StockReadOnlySnapshot } from '../TeamStockReadOnlySource'
import { readAuthorizedBridgeChannel, directDelegationAudienceHash } from './directDelegation'
import type { BridgeGrant, CommunicationScope } from './contract'
import {employeeStockOutSummary,stockOutPeriodFromQuery} from './employeeStockOutSummary'

export interface EmployeeInventoryEvidence {
  items: Array<{ id:string; name:string; unit:string; bookQuantity:number; bookUpdatedAt:string;
    physicalEvidence: null | { observedAt:string|null; unit:string|null; bookQuantityAtObservation:number|null;
      physicalQuantity:number|null; historicalComparable:boolean; historicalDifference:number|null;
      currentComparable:boolean; currentDifference:number|null; blockers:string[] };
    blockers:string[] }>;
  recentStockOuts?: Array<{
    id: string;
    inventoryId: string;
    name: string;
    quantity: number;
    unit: string;
    reason: string;
    createdAt: string;
    note: string | null;
  }>;
  stockOutSummary?:Omit<Awaited<ReturnType<typeof employeeStockOutSummary>>,'asOf'>;
  sourceRefs:string[]; fingerprint:string; hasMoreMatches:boolean; hasMoreStockOuts?:boolean
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
  if(!await audienceAllows(db,g,scope,'inventory.read'))deny()
  const permissions=[]
  for(const person of people.sort((a:any,b:any)=>a.id.localeCompare(b.id))){
    if(!person.user||person.user.id!==person.userId||person.user.storeId!==g.storeId)deny()
    const acl=await userAccessV2({staffId:person.id,storeId:g.storeId,role:person.user.role},db)
    // userAccessV2 returns null for a real admin: preserve its intrinsic system
    // permission, but never apply the sponsor's role to any other recipient.

    permissions.push({staffId:person.id,userId:person.user.id,role:person.user.role,revision:acl?.revision??null,inventoryRead:'allow'})
  }
  return hash({storeId:g.storeId,agentId:g.agentId,grantVersion:g.version,clientRevision:g.clientRevision,expiresAt:g.expiresAt,task:scope.task,channelId:scope.channelId,audienceHash:scope.audienceHash,requesterStaffId:scope.requesterStaffId,compartmentKey:scope.compartmentKey,permissions})
}

const INVENTORY_ALIASES: Record<string, string[]> = {
  '奶精': ['krimer', 'creamer', 'milk tea powder', 'bubuk'],
  '植脂末': ['krimer', 'creamer', 'powder'],
  '红茶': ['teh hitam', 'black tea', 'hongcha'],
  '绿茶': ['teh hijau', 'green tea'],
  '乌龙': ['oolong', 'teh oolong'],
  '奶茶': ['milk tea', 'bubuk milk tea'],
  '牛奶': ['susu', 'fresh milk'],
  '淡奶': ['evaporated', 'susu evaporasi'],
  '炼乳': ['kental manis', 'condensed'],
  '糖': ['sugar', 'sirup gula', 'gula'],
  '果糖': ['fructose', 'sirup gula'],
  '珍珠': ['boba', 'tapioca'],
  '椰果': ['nata de coco'],
  '布丁': ['pudding'],
  '杯': ['cup'],
  '吸管': ['sedotan', 'straw'],
  '冰淇淋': ['ice cream', 'es krim']
}

/** Bounded name/id search, no costs or operational writes. Caller's runtime must
 * separately re-resolve the grant and task ACL and persist this source manifest.
 * Historical physical observations never imply today's physical stock. */
export async function readEmployeeInventoryEvidence(db:any,g:BridgeGrant,scope:CommunicationScope,input:{query:string}):Promise<EmployeeInventoryEvidence> {
  const {query}=inputSchema.parse(input)
  if(typeof db.$transaction!=='function')throw new Error('EMPLOYEE_INVENTORY_TRANSACTION_REQUIRED')
  const qLower = query.toLowerCase().trim()
  const searchTerms = [query]
  for (const [k, aliases] of Object.entries(INVENTORY_ALIASES)) {
    if (qLower.includes(k.toLowerCase())) searchTerms.push(...aliases)
  }
  const orConditions = searchTerms.flatMap(term => [{ id: term }, { name: { contains: term, mode: 'insensitive' as const } }])
  const isMovementQuery = /outbound|movement|log|stok keluar|hari ini|kemarin|today|yesterday|出库|入库|消耗|昨天|今天|记录|\d{4}-\d{2}-\d{2}/.test(qLower)
  const period=isMovementQuery?stockOutPeriodFromQuery(query):undefined
  const captured = await db.$transaction(async(tx:any)=>{
    const permissionHash=await authorize(tx,g,scope),proofs:Record<string,string>={}
    // Reuse the certified count/boundary checks while restricting the original
    // snapshot reader's only inventory query. Never fetch the whole store.
    const bounded={...tx,config:{findUnique:async(args:any)=>{const row=await tx.config.findUnique(args);proofs[args.where.storeId_key.key]=hash(row?.value??null);return row}},inventory:{findMany:(args:any)=>tx.inventory.findMany({...args,where:{...args.where,OR:orConditions},take:11})}}
    const snapshot=await buildTeamStockReadOnlySource({$transaction:(fn:any)=>fn(bounded)},g.storeId)
    const stockOutWhere = (isMovementQuery || snapshot.items.length === 0)
      ? { inventory: { storeId: g.storeId } }
      : { inventoryId: { in: snapshot.items.slice(0, 10).map((r: any) => r.id) } }
    const rawStockOuts = await tx.stockOutLog.findMany({
      where: {...stockOutWhere,...(period?{createdAt:{gte:new Date(period.startDate!+'T00:00:00+07:00'),lt:new Date(new Date(period.endDate!+'T00:00:00+07:00').getTime()+86400000)}}:{})},
      include: { inventory: { select: { id: true, name: true, unit: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 25
    })
    const recentStockOuts = rawStockOuts.map((s: any) => {
      let cleanNote: string | null = null
      if (s.note) {
        try {
          const parsed = JSON.parse(s.note)
          if (parsed && typeof parsed === 'object') {
            cleanNote = parsed.reason || parsed.remark || parsed.description || (s.reason === 'sale_estimate' ? '销售消耗' : null)
          } else {
            cleanNote = String(s.note)
          }
        } catch {
          cleanNote = String(s.note)
        }
      }
      if (cleanNote && /(?:成本|单价|总价|金额|利润|营业额|营收|cost|price|amount|revenue|profit|margin|biaya|hpp)/i.test(cleanNote)) {
        cleanNote = null
      }
      return {
        id: s.id,
        inventoryId: s.inventoryId,
        name: s.inventory.name,
        quantity: s.quantity,
        unit: s.inventory.unit,
        reason: s.reason === 'sale_estimate' ? '销售消耗' : s.reason,
        createdAt: s.createdAt.toISOString(),
        note: cleanNote
      }
    })
    const summary=period?await employeeStockOutSummary(tx,g.storeId,period):undefined
    // Observation time changes on each read; source equality binds the full
    // native period/results rather than an incidental fresh wall-clock timestamp.
    const stockOutSummary=summary?(({asOf,...stable})=>stable)(summary):undefined
    return {snapshot,permissionHash,proofs,recentStockOuts,rawStockOuts,stockOutSummary}
  },{isolationLevel:'RepeatableRead'})
  if(await authorize(db,g,scope)!==captured.permissionHash)deny() // Refuse ACL/audience changes during snapshot I/O.
  const chosen=captured.snapshot.items.slice(0,10)
  const items:EmployeeInventoryEvidence['items']=chosen.map(row=>({id:row.id,name:row.name,unit:row.unit,bookQuantity:row.stock,bookUpdatedAt:row.updatedAt,
    physicalEvidence:row.observation?{observedAt:row.observation.observedAt,unit:row.observation.unit,bookQuantityAtObservation:row.observation.bookStockAtObservation,
      physicalQuantity:row.observation.physicalStock,historicalComparable:row.observation.comparable,historicalDifference:row.observation.difference,
      currentComparable:row.currentComparable,currentDifference:row.currentDifference,blockers:row.observation.blockers}:null,blockers:row.blockers}))
  const sourceRefs=[...chosen.flatMap(row=>[row.sourceId,...(row.observation?.sourceIds||[])]), ...captured.rawStockOuts.map((s: any)=>'stockOutLog:'+s.id)]
  const facts={items,recentStockOuts:captured.recentStockOuts,...(captured.stockOutSummary?{stockOutSummary:captured.stockOutSummary,hasMoreStockOuts:captured.stockOutSummary.totalRecords>captured.recentStockOuts.length}:{}),sourceRefs,hasMoreMatches:captured.snapshot.items.length>10}
  return {...facts,fingerprint:hash({facts,permissionHash:captured.permissionHash,nativeEvidence:chosen,proofs:chosen.filter(row=>row.observation).map(row=>({itemId:row.observation!.itemId,hash:captured.proofs['inventoryCountObservation.'+row.observation!.itemId]}))})}
}
