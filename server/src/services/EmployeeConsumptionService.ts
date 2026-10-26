import {correctedConsumptionSnapshots} from './ConsumptionEvidenceService'
import {inventoryProductionComparison} from './InventoryProductionComparison';
import {inventoryUsageMode} from '../utils/inventoryUsagePolicy';
import {inventoryBusinessCalendar} from '../utils/inventoryBusinessCalendar';
import prisma from '../config/database';
import { getInventoryAlertConfig } from './InventoryAlertConfigService';
import { FLOW_CUTOVER_KEY, ensureInventoryFlow, ConsumptionMaterial, ConsumptionIssue } from './OrderConsumptionService';
import { parseDateBoundary } from '../utils/businessDate';
import { formatDate, startOfDay, addDays } from '../utils/dateUtils';
export function classifyEmployeeConsumption(theoretical: number, actual: number, warning: number, critical: number, enabled = true, incomplete = false) {
    const variance = Math.round((actual - theoretical) * 1e9) / 1e9;
    const variancePercent = theoretical === 0 ? null : Math.round(Math.abs(variance) / theoretical * 100 * 1e9) / 1e9;
    return { variance, variancePercent, varianceStatus: incomplete ? 'unavailable' : !enabled ? 'normal' : theoretical === 0 ? (actual > 0 ? 'warning' : 'normal') : variancePercent! >= critical ? 'critical' : variancePercent! >= warning ? 'warning' : 'normal', unavailableReason: incomplete ? 'INCOMPLETE_RECIPE' : theoretical === 0 && actual > 0 ? 'ZERO_THEORETICAL_BASELINE' : null };
}
export async function employeeConsumption(filter: {
    storeId: string;
    startDate: string;
    endDate: string;
}, db: any = prisma) {
    const {boundary,startOfDay}=await inventoryBusinessCalendar(filter.storeId,db);
    const start = boundary(filter.startDate), end = boundary(filter.endDate, true);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start)
        throw Error('INVALID_ANALYSIS_PERIOD');
    const setting = await getInventoryAlertConfig(filter.storeId);
    const cutoverRecord = await db.config.findUnique({ where: { storeId_key: { storeId: filter.storeId, key: FLOW_CUTOVER_KEY } } });
    const cutover = cutoverRecord ? new Date(cutoverRecord.value) : null;
    if (!cutover || cutover > end)
        return { list: [], cutover: cutover?.toISOString() || null, legacyOnly: true, segments: [{ basis: 'legacy', start: start.toISOString(), end: end.toISOString() }] };
    const effectiveStart = new Date(Math.max(start.getTime(), cutover.getTime()));
    const inventory = await db.inventory.findMany({ where: { storeId: filter.storeId }, orderBy: { name: 'asc' } });
    const snapshots = await correctedConsumptionSnapshots(db,{storeId:filter.storeId,createdAt:{gte:effectiveStart,lte:end}});
    const logs = await db.stockOutLog.findMany({ where: { inventory: { storeId: filter.storeId }, createdAt: { gte: effectiveStart, lte: end }, reason: { in: ['withdrawal', 'loss', 'expired', 'other', 'transfer', 'process'] } } });
    const uncovered = await db.order.count({ where: { storeId: filter.storeId, status: { in: ['completed', 'paid'] }, createdAt: { gte: effectiveStart, lte: end }, id: { notIn: snapshots.map((s: any) => s.orderId) } } });
    const materials = new Map<string, {
        quantity: number;
        unit: string;
    }>();
    let incomplete = uncovered > 0;
    for (const snapshot of snapshots) {
        if (snapshot.reversedAt)
            continue;
        const issues: ConsumptionIssue[] = JSON.parse(snapshot.issues);
        if (issues.length)
            incomplete = true;
        for (const material of JSON.parse(snapshot.materials) as ConsumptionMaterial[]) {
            // Old snapshots recorded the processed quantity before its recipe was linked.
            // Keep that evidence intact and do not compare it to raw withdrawals as if equivalent.
            if(inventory.some((i:any)=>i.id===material.inventoryId&&i.type==='semi_finished'&&i.processRecipeId))incomplete=true;
            const previous = materials.get(material.inventoryId);
            if (previous && previous.unit !== material.unit)
                incomplete = true;
            materials.set(material.inventoryId, { quantity: (previous?.quantity || 0) + material.quantity, unit: material.unit });
        }
    }
    const withdrawals=new Map<string,number>(),withdrawalTimes=new Map<string,Date>();
    for(const log of logs)if(log.reason==='withdrawal'){withdrawals.set(log.inventoryId,(withdrawals.get(log.inventoryId)||0)+log.quantity);const first=withdrawalTimes.get(log.inventoryId);if(!first||log.createdAt<first)withdrawalTimes.set(log.inventoryId,log.createdAt);}
    const production=await inventoryProductionComparison(db,filter.storeId,effectiveStart,end,withdrawals,withdrawalTimes);
    const list = inventory.filter((i:any)=>i.type!=='semi_finished'||!i.processRecipeId).map((item: any) => {
        const totals: {
            [key: string]: number;
        } = { withdrawal: 0, loss: 0, expired: 0, other: 0, transfer: 0, process: 0 };
        for (const log of logs.filter((l: any) => l.inventoryId === item.id))
            totals[log.reason] += log.quantity;
        // A unified processing entry describes an internal conversion, not a second issue.

        const actual = totals.withdrawal, theory = materials.get(item.id);
        const classification = classifyEmployeeConsumption(theory?.quantity || 0, actual, setting.varianceWarningPercent, setting.varianceCriticalPercent, setting.enableConsumptionAlert, incomplete || !!theory && theory.unit !== item.unit);
        const usageMode=inventoryUsageMode(item),evidenceIncomplete=incomplete || !!theory && theory.unit!==item.unit;
        const comparison=evidenceIncomplete?{variance:null,variancePercent:null,varianceStatus:'unavailable',unavailableReason:'INCOMPLETE_RECIPE'}:{variance:usageMode==='self_produced'?null:Math.round((actual-(theory?.quantity||0))*1e9)/1e9,variancePercent:null,varianceStatus:'not_compared',unavailableReason:usageMode==='bulk'?'BULK_ISSUE':usageMode==='self_produced'?'SELF_PRODUCED':'BATCH_WITHDRAWAL'};
        return { usageMode, inventoryId: item.id, inventoryName: item.name, unit: item.unit, theoreticalConsumption: evidenceIncomplete?null:theory?.quantity || 0, actualConsumption: actual, actualWithdrawal: actual, production:production.get(item.id)||[], breakdown: totals, ...comparison, windowStart: effectiveStart.toISOString(), windowEnd: end.toISOString(), basis: 'employee_out_vs_sale_recipe', provisional: end >= startOfDay(new Date()), partialPeriod: start < cutover };
    });
    return { list, cutover: cutover.toISOString(), legacyOnly: false, segments: [...(start < cutover ? [{ basis: 'legacy', start: start.toISOString(), end: new Date(cutover.getTime() - 1).toISOString() }] : []), { basis: 'employee_out_vs_sale_recipe', start: effectiveStart.toISOString(), end: end.toISOString() }] };
}
export async function checkConsumptionDay(storeId: string, businessDate: string, now = new Date()) {
    const {boundary,startOfDay}=await inventoryBusinessCalendar(storeId);
    if (boundary(businessDate, true) >= startOfDay(now))
        throw Error('BUSINESS_DAY_NOT_CLOSED');
    const result = await employeeConsumption({ storeId, startDate: businessDate, endDate: businessDate });
    for (const row of result.list) {
        // The transition day's evidence is partial; report it but never trigger an alert from it.
        const status = row.partialPeriod ? 'unavailable' : row.varianceStatus;
        await prisma.consumptionAlert.upsert({ where: { storeId_businessDate_inventoryId: { storeId, businessDate, inventoryId: row.inventoryId } }, create: { storeId, businessDate, inventoryId: row.inventoryId, status, detail: JSON.stringify(row) }, update: { status, detail: JSON.stringify(row) } });
    }
    return result;
}
export async function getConsumptionAlerts(storeId: string) {
    const setting = await getInventoryAlertConfig(storeId);
    if (!setting.enableConsumptionAlert)
        return [];
    await refreshStoreConsumptionDays(storeId);
    const rows = await prisma.consumptionAlert.findMany({ where: { storeId, status: { in: ['warning', 'critical'] } }, orderBy: [{ businessDate: 'desc' }, { inventoryId: 'asc' }] });
    return rows.map(row => ({ ...row, detail: JSON.parse(row.detail) }));
}
// Share one per-store refresh between the scheduler and alert-page requests.
// New evidence writes a new dirty token. Delete only the token actually processed.
const refreshes=new Map<string,Promise<void>>();
export function refreshStoreConsumptionDays(storeId:string,now=new Date()):Promise<void>{
 const running=refreshes.get(storeId);if(running)return running;
 const operation=(async()=>{
  const {startOfDay,addDays,formatDate,boundary}=await inventoryBusinessCalendar(storeId);
  const settings=await getInventoryAlertConfig(storeId);if(!settings.enableConsumptionAlert)return;
  const cutover=await ensureInventoryFlow(storeId,prisma,now),today=startOfDay(now);
  const [checkpoint,version]=await Promise.all([
   prisma.config.findUnique({where:{storeId_key:{storeId,key:'employee_consumption_checkpoint'}}}),
   prisma.config.findUnique({where:{storeId_key:{storeId,key:'employee_consumption_refresh_version'}}})
  ]);
  // One-time repair of old cached results missed by pre-fix offline imports.
  let day=version?.value==='2'&&checkpoint?addDays(boundary(checkpoint.value),1):startOfDay(cutover);
  while(day<today){
   const date=formatDate(day);await checkConsumptionDay(storeId,date,now);
   await prisma.config.upsert({where:{storeId_key:{storeId,key:'employee_consumption_checkpoint'}},create:{storeId,key:'employee_consumption_checkpoint',value:date,category:'inventory'},update:{value:date}});
   day=addDays(day,1);
  }
  const dirty=await prisma.config.findMany({where:{storeId,key:{startsWith:'employee_consumption_dirty:'}}});
  const yesterday=formatDate(addDays(today,-1));
  // Refresh yesterday on demand, including batch withdrawals after the daily run.
  const dates=new Set<string>([...(boundary(yesterday)>=startOfDay(cutover)?[yesterday]:[]),...dirty.map(r=>r.key.slice('employee_consumption_dirty:'.length))]);
  for(const date of dates){
   if(boundary(date)>=today)continue;
   await checkConsumptionDay(storeId,date,now);
   const record=dirty.find(r=>r.key==='employee_consumption_dirty:'+date);
   if(record)await prisma.config.deleteMany({where:{storeId,key:record.key,value:record.value}});
  }
  if(version?.value!=='2'||dirty.some(r=>boundary(r.key.slice('employee_consumption_dirty:'.length))<today))await prisma.config.deleteMany({where:{storeId,key:'inventory_alert_center_checked_at'}});
  await prisma.config.upsert({where:{storeId_key:{storeId,key:'employee_consumption_refresh_version'}},create:{storeId,key:'employee_consumption_refresh_version',value:'2',category:'inventory'},update:{value:'2'}});
 })().finally(()=>refreshes.delete(storeId));
 refreshes.set(storeId,operation);return operation;
}
let running=false;
export async function checkClosedConsumptionDays(now=new Date()){
 if(running)return;running=true;
 try{for(const store of await prisma.store.findMany({select:{id:true}})){
  try{await refreshStoreConsumptionDays(store.id,now)}catch(error){console.error('[Inventory consumption]',store.id,error)}
 }}finally{running=false}
}
export function startConsumptionScheduler() {
    void checkClosedConsumptionDays();
    const timer = setInterval(() => void checkClosedConsumptionDays(), 60 * 60 * 1000);
    timer.unref();
    return timer;
}
