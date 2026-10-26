import {actualInventorySince} from './ActualInventoryPolicy'
import prisma from '../config/database'
import { createHash, randomUUID } from 'crypto'
import { alignInventoryBatches, consumeInventoryBatches, availableBatches } from './InventoryBatchService'
import { markConsumptionDayDirty } from './OrderConsumptionService'
import { recalculateInventoryConsumers } from './InventoryQuantityService'
import { unifiedInventorySince, calibrationAt } from './UnifiedInventoryService'
import { loadInventoryActors } from '../utils/inventoryActors'

export const MANUAL_CORRECTION_PREFIX = 'inventory.manual-correction.'
type Direction = 'stock_in' | 'stock_out'
export class ManualCorrectionError extends Error { constructor(message: string, public statusCode = 409) { super(message) } }
const fail = (message: string): never => { throw new ManualCorrectionError(message) }
const parse = (value?: string | null) => { try { return JSON.parse(value || '{}') } catch { return {} } }
const key = (type: Direction, id: string) => MANUAL_CORRECTION_PREFIX + type + ':' + id
const same = (a: any, b: any) => a.inventoryId === b.inventoryId && a.quantity === b.quantity && a.totalAmount === b.totalAmount
function eligible(type: Direction, log: any) {
  const note = parse(log.note)
  if (note.manualCorrection || log.quantity <= 0) return false
  if (type === 'stock_in') return !log.purchaseOrderId && !note.purchaseOrderId && (!note.kind || note.kind === 'receipt') && !/^Adjustment:|Inventory count:|Initial|期初|Awal|加工|Process|Olahan/.test(log.note || '')
  return !log.orderId && ['withdrawal', 'other', 'loss', 'expired', 'transfer'].includes(log.reason) && (!note.kind || note.kind === 'manual-out')
}
async function root(db: any, storeId: string, type: Direction, id: string) {
  const row = await db[type === 'stock_in' ? 'stockInLog' : 'stockOutLog'].findFirst({ where: { id, inventory: { storeId } }, include: { inventory: true } })
  if (!row) throw new ManualCorrectionError('MANUAL_LOG_NOT_FOUND', 404)
  if (!eligible(type, row)) fail('MANUAL_LOG_NOT_ELIGIBLE')
  return row
}
async function snapshot(db: any, storeId: string, type: Direction, row: any) {
  const note = parse(row.note), since = await unifiedInventorySince(db, storeId)
  const actualSince = await actualInventorySince(db, storeId)
  const internal = note.stockEffect === 'internal_transfer' || !note.stockEffect && row.reason === 'withdrawal' && since && row.createdAt >= since && (!actualSince || row.createdAt < actualSince)
  return { logId: row.id, inventoryId: row.inventoryId, materialName: row.inventory.name, unit: row.inventory.unit, quantity: row.quantity,
    totalAmount: type === 'stock_in' ? row.totalAmount : Number(note.totalAmount ?? Math.round(row.quantity * Number(note.unitCost ?? row.inventory.avgCost))),
    unitCost: type === 'stock_in' ? row.unitCost : Number(note.unitCost ?? row.inventory.avgCost),
    note: typeof note.note === 'string' ? note.note : note.kind ? '' : row.note || '', reason: row.reason || null,
    stockEffect: type === 'stock_in' ? 'physical_in' : internal ? 'internal_transfer' : 'physical_out',
    batchId: row.batchId || null, allocations: note.batchAllocations || [], createdAt: row.createdAt.toISOString(),
    carryingAmount: note.carryingAmount ?? (type === 'stock_in' ? note.costProvided === false ? null : row.totalAmount : typeof note.unitCost === 'number' ? row.quantity * note.unitCost : null),
    ambiguousCost: type === 'stock_in' && note.costProvided === undefined && row.totalAmount === 0,
    originalActor: row.staffId || null }
}

async function revaluationBasis(db: any, current: any) {
  if (!current || current.stockEffect !== 'physical_in' || !current.batchId) return null
  const inventory = await db.inventory.findUnique({ where: { id: current.inventoryId } })
  const batches = await db.batch.findMany({ where: { inventoryId: current.inventoryId, status: 'active' }, orderBy: { createdAt: 'desc' } })
  const batch = await db.batch.findFirst({ where: { id: current.batchId, inventoryId: current.inventoryId } })
  if (!inventory || !batch || batch.quantity < -1e-7 || batch.quantity > current.quantity + 1e-7) return null
  const remainingQuantity = availableBatches(batches, inventory.currentStock).find((b: any) => b.id === current.batchId)?.quantity || 0
  return { remainingQuantity, consumedQuantity: current.quantity - remainingQuantity, quantity: current.quantity, totalAmount: current.totalAmount, carryingAmount: current.carryingAmount ?? current.quantity * Number(inventory.avgCost), averageAmount: current.quantity * Number(inventory.avgCost) }
}

export async function getManualCorrection(storeId: string, type: Direction, id: string, db: any = prisma) {
  const row = await root(db, storeId, type, id), saved = await db.config.findUnique({ where: { storeId_key: { storeId, key: key(type, id) } } })
  const state = saved ? parse(saved.value) : { version: 'original', current: await snapshot(db, storeId, type, row), events: [] }
  const actors = await loadInventoryActors(db, storeId, [state.current?.originalActor, row.staffId, ...state.events.map((e: any) => e.actorId)])
  return { ...state, revaluation: await revaluationBasis(db, state.current), original: await snapshot(db, storeId, type, row), originalActor: actors.get(row.staffId) || null,
    events: state.events.map((e: any) => ({ ...e, actor: actors.get(e.actorId) || { id: e.actorId, name: e.actorName, employeeNumber: '' } })) }
}
export interface CorrectionInput {
  requestId: string; expectedVersion: string; action: 'correct' | 'cancel' | 'revalue'; reason: string
  replacement?: { inventoryId: string; quantity: number; totalAmount: number; note: string }
  legacyCostMode?: 'recorded' | 'current_average'
}
/** Append-only ledger corrections, with a locked per-source revision and durable retry receipt. */
export async function correctManualStock(storeId: string, type: Direction, id: string, actorId: string, actorName: string, input: CorrectionInput, db: any = prisma) {
  const fingerprint = createHash('sha256').update(JSON.stringify({ storeId, type, id, actorId, ...input })).digest('hex')
  const requestKey = MANUAL_CORRECTION_PREFIX + 'request:' + input.requestId
  const replay = async (tx: any) => { const r = await tx.config.findUnique({ where: { storeId_key: { storeId, key: requestKey } } }); if (!r) return null; const saved = parse(r.value); if (saved.fingerprint !== fingerprint) fail('MANUAL_CORRECTION_REQUEST_CONFLICT'); return saved.result }
  try { return await db.$transaction(async (tx: any) => {
    const previous = await replay(tx); if (previous) return previous
    const original = await root(tx, storeId, type, id)
    const initial = { version: 'original', current: await snapshot(tx, storeId, type, original), events: [] }
    const stateKey = key(type, id)
    // A real update obtains the database row lock before reading this revision.
    await tx.config.upsert({ where: { storeId_key: { storeId, key: stateKey } }, create: { storeId, key: stateKey, category: 'inventory', value: JSON.stringify(initial) }, update: { updatedAt: new Date() } })
    const retry = await replay(tx); if (retry) return retry
    const stored = await tx.config.findUniqueOrThrow({ where: { storeId_key: { storeId, key: stateKey } } }), state = parse(stored.value)
    if (state.version !== input.expectedVersion) fail('MANUAL_CORRECTION_CHANGED_REFRESH')
    if (!state.current) fail('MANUAL_CORRECTION_ALREADY_CANCELLED')
    if (!input.reason?.trim() || input.reason.length > 1000) fail('MANUAL_CORRECTION_REASON_REQUIRED')
    const before = state.current, desired = input.action === 'cancel' ? null : input.replacement
    if (input.action !== 'cancel' && (!desired || !Number.isFinite(desired.quantity) || desired.quantity <= 0 || !Number.isSafeInteger(desired.totalAmount) || desired.totalAmount < 0 || desired.totalAmount > 2147483647 || desired.note.length > 2000)) fail('MANUAL_CORRECTION_INVALID_INPUT')
    const inventoryIds = [...new Set<string>([before.inventoryId, ...(desired ? [desired.inventoryId] : [])])].sort(), inventories = new Map<string, any>()
    for (const inventoryId of inventoryIds) {
      const inv = await tx.inventory.findFirst({ where: { id: inventoryId, storeId } })
      if (!inv) throw new ManualCorrectionError('MANUAL_CORRECTION_MATERIAL_NOT_FOUND', 404)
      if (inv.type === 'semi_finished' && inv.processRecipeId) fail('PROCESS_OUTPUT_IS_CONVERSION_ONLY')
      const locked = await tx.inventory.updateMany({ where: { id: inv.id, storeId, currentStock: inv.currentStock, avgCost: inv.avgCost, updatedAt: inv.updatedAt }, data: { currentStock: { increment: 0 } } })
      if (locked.count !== 1) fail('INVENTORY_CONCURRENT_CHANGE_RETRY')
      inventories.set(inv.id, inv)
    }
    if (inventories.get(before.inventoryId).unit !== before.unit) fail('MANUAL_CORRECTION_UNIT_CHANGED')
    const after: any = desired ? { ...before, ...desired, materialName: inventories.get(desired.inventoryId).name, unit: inventories.get(desired.inventoryId).unit, unitCost: desired.totalAmount / desired.quantity, carryingAmount: desired.totalAmount, ambiguousCost: false } : null
    const metadataOnly = after && same(before, after)
    if (metadataOnly) { after.carryingAmount = before.carryingAmount; after.ambiguousCost = before.ambiguousCost }
    const revalue = input.action === 'revalue'
    if (revalue && (type !== 'stock_in' || !after || before.inventoryId !== after.inventoryId || before.quantity !== after.quantity || after.totalAmount === before.totalAmount)) fail('MANUAL_CORRECTION_REVALUE_AMOUNT_ONLY')
    const changesStock = before.stockEffect !== 'internal_transfer' && !metadataOnly && !revalue
    if (changesStock) {
      for (const inventoryId of inventoryIds) {
        const observed = await calibrationAt(tx, storeId, inventoryId)
        if (observed && new Date(original.createdAt) <= observed) fail('MANUAL_CORRECTION_COUNTED_USE_RECONCILIATION')
        const pending = await tx.inventoryCount.findFirst({ where: { storeId, status: { in: ['in_progress', 'pending_review'] } } })
        if (pending) fail('MANUAL_CORRECTION_PENDING_COUNT')
      }
    }
    actorName = (await loadInventoryActors(tx, storeId, [actorId])).get(actorId)?.name || actorName
    const eventId = randomUUID(), now = new Date().toISOString(), balances: any[] = []
    const change = async (inventoryId: string, qty: number, amount: number) => {
      const inv = inventories.get(inventoryId), stock = inv.currentStock + qty, value = Math.max(0, inv.currentStock) * Number(inv.avgCost) + amount
      if (stock < -1e-7) fail('MANUAL_CORRECTION_INSUFFICIENT_STOCK')
      if (!Number.isFinite(value) || value < -0.01 || Math.abs(stock) < 1e-7 && Math.abs(value) > 0.01) fail('MANUAL_CORRECTION_VALUE_REQUIRES_REVIEW')
      const avgCost = stock > 1e-7 ? Math.max(0, value) / stock : 0
      if (avgCost > 2147483647) fail('MANUAL_CORRECTION_VALUE_REQUIRES_REVIEW')
      await tx.inventory.update({ where: { id: inventoryId }, data: { currentStock: Math.max(0, stock), avgCost } })
      balances.push({ inventoryId, beforeStock: inv.currentStock, beforeAvgCost: Number(inv.avgCost), afterStock: Math.max(0, stock), afterAvgCost: avgCost })
      inventories.set(inventoryId, { ...inv, currentStock: Math.max(0, stock), avgCost })
    }
    let reversedCarryingAmount: number | null = null, costDifference: any = null
    if (revalue) {
      const basis = await revaluationBasis(tx, before)
      if (!basis) fail('MANUAL_CORRECTION_RECEIPT_BATCH_MISSING')
      if (before.ambiguousCost && !input.legacyCostMode) fail('MANUAL_CORRECTION_LEGACY_COST_CHOICE_REQUIRED')
      const inv = inventories.get(before.inventoryId)
      const previousAmount = before.ambiguousCost ? input.legacyCostMode === 'current_average' ? basis.averageAmount : before.totalAmount : basis.carryingAmount
      const totalDifference = after.totalAmount - previousAmount
      const inventoryDifference = totalDifference * basis.remainingQuantity / before.quantity
      const consumptionDifference = totalDifference - inventoryDifference
      // A value-only operation keeps physical counts and their observation boundaries intact.
      if (inventoryDifference) await change(inv.id, 0, inventoryDifference)
      else balances.push({inventoryId:inv.id,beforeStock:inv.currentStock,afterStock:inv.currentStock,beforeAvgCost:Number(inv.avgCost),afterAvgCost:Number(inv.avgCost)})
      await tx.batch.update({ where: { id: before.batchId }, data: { unitCost: after.unitCost } })
      reversedCarryingAmount = previousAmount
      costDifference = { ...basis, previousAmount, correctedAmount: after.totalAmount, totalDifference, inventoryDifference, consumptionDifference, basis: 'remaining_batch_proportion_at_correction', postingAt: now }
      if (consumptionDifference) await tx.stockOutLog.create({data:{inventoryId:inv.id,quantity:0,reason:'receipt_cost_adjustment',operationId:'manual-correction:'+eventId+':consumption-cost',staffId:actorId,note:JSON.stringify({version:1,kind:'receipt-cost-adjustment',unitCost:0,totalAmount:consumptionDifference,note:input.reason.trim(),costDifference,manualCorrection:{type,rootId:id,eventId,role:'consumption_cost',action:input.action,reason:input.reason.trim(),actorId,actorName,at:now}})}})
      await recalculateInventoryConsumers(tx, inventoryIds)
    }
    if (changesStock) {
      const inv = inventories.get(before.inventoryId)
      let carrying = before.carryingAmount
      if (before.ambiguousCost && !input.legacyCostMode) fail('MANUAL_CORRECTION_LEGACY_COST_CHOICE_REQUIRED')
      if (before.ambiguousCost) carrying = input.legacyCostMode === 'recorded' ? before.totalAmount : before.quantity * Number(inv.avgCost)
      if (carrying === null || carrying === undefined) carrying = before.quantity * Number(inv.avgCost)
      reversedCarryingAmount = carrying
      if (type === 'stock_in') {
        await alignInventoryBatches(tx, inv)
        if (!before.batchId) fail('MANUAL_CORRECTION_RECEIPT_BATCH_MISSING')
        const batch = await tx.batch.findFirst({ where: { id: before.batchId, inventoryId: before.inventoryId, status: 'active' } })
        if (!batch || Math.abs(batch.quantity - before.quantity) > 1e-7) fail('MANUAL_CORRECTION_RECEIPT_CONSUMED')
        await change(inv.id, -before.quantity, -carrying)
        await tx.batch.update({ where: { id: batch.id }, data: { quantity: 0, status: 'used' } })
        if (after) {
          await alignInventoryBatches(tx, inventories.get(after.inventoryId))
          await change(after.inventoryId, after.quantity, after.totalAmount)
          const newBatch = await tx.batch.create({ data: { inventoryId: after.inventoryId, batchNumber: 'MC-' + eventId, quantity: after.quantity, unitCost: after.unitCost, status: 'active', ...(after.inventoryId === before.inventoryId ? { manufacturingDate: batch.manufacturingDate, expiryDate: batch.expiryDate } : {}) } })
          after.batchId = newBatch.id
        }
      } else {
        await alignInventoryBatches(tx, inv)
        await change(inv.id, before.quantity, carrying)
        // Restore captured allocations; old manual issues have no allocation snapshot.
        let restored = 0
        for (const allocation of before.allocations || []) {
          const batch = await tx.batch.findFirst({ where: { id: allocation.id, inventoryId: inv.id } })
          if (!batch) fail('MANUAL_CORRECTION_BATCH_MISSING')
          await tx.batch.update({ where: { id: batch.id }, data: { quantity: { increment: allocation.quantity }, status: 'active' } }); restored += allocation.quantity
        }
        if (before.quantity - restored > 1e-7) await tx.batch.create({ data: { inventoryId: inv.id, batchNumber: 'MC-RESTORE-' + eventId, quantity: before.quantity - restored, unitCost: carrying / before.quantity, status: 'active' } })
        if (after) {
          const target = inventories.get(after.inventoryId)
          if (target.currentStock < after.quantity) fail('MANUAL_CORRECTION_INSUFFICIENT_STOCK')
          after.allocations = await consumeInventoryBatches(tx, target, after.quantity)
          await change(after.inventoryId, -after.quantity, -after.totalAmount)
        }
      }
      await recalculateInventoryConsumers(tx, inventoryIds)
    }
    const append = async (value: any, sign: number, role: string) => {
      const note = JSON.stringify({ version: 1, kind: type === 'stock_in' ? 'receipt' : 'manual-out', stockEffect: before.stockEffect, unitCost: value.unitCost, totalAmount: sign * value.totalAmount,
        carryingAmount: sign * (role === 'reversal' ? reversedCarryingAmount ?? value.carryingAmount ?? value.totalAmount : value.carryingAmount ?? value.totalAmount), note: value.note, batchAllocations: value.allocations, manualCorrection: { type, rootId: id, eventId, role, action: input.action, reason: input.reason.trim(), actorId, actorName, at: now } })
      const data: any = { inventoryId: value.inventoryId, quantity: sign * value.quantity, operationId: 'manual-correction:' + eventId + ':' + role, staffId: actorId, note }
      if (type === 'stock_in') Object.assign(data, { unitCost: value.unitCost, totalAmount: sign * value.totalAmount, batchId: role === 'replacement' ? value.batchId : null })
      else data.reason = before.reason
      return tx[type === 'stock_in' ? 'stockInLog' : 'stockOutLog'].create({ data })
    }
    const reversal = await append(before, -1, 'reversal')
    if (after) { const replacement = await append(after, 1, 'replacement'); after.logId = replacement.id }
    await markConsumptionDayDirty(tx, storeId, new Date(now))
    const event = { id: eventId, at: now, action: input.action, reason: input.reason.trim(), actorId, actorName, before, after, balances, reversalLogId: reversal.id, legacyCostMode: input.legacyCostMode || null, reversedCarryingAmount, metadataOnly: !!metadataOnly, costDifference }
    const result = { version: eventId, current: after, events: [...state.events, event] }
    await tx.config.update({ where: { storeId_key: { storeId, key: stateKey } }, data: { value: JSON.stringify(result) } })
    await tx.financeAuditLog.create({ data: { storeId, userId: actorId, action: 'update', entityType: 'manual_inventory_correction', entityId: id, description: input.reason.trim(), oldValue: JSON.stringify(before), newValue: JSON.stringify(event) } })
    await tx.config.create({ data: { storeId, key: requestKey, category: 'inventory', value: JSON.stringify({ fingerprint, result }) } })
    return result
  }, { timeout: 20000 }) } catch (error: any) { if (error.code === 'P2002') { const previous = await replay(db); if (previous) return previous } throw error }
}

/** Metadata only: append to the existing response without altering original ledger values. */
export async function manualCorrectionMetadata(db: any, storeId: string, type: Direction, logs: any[]) {
  const roots = logs.filter(log => eligible(type, log)), states = roots.length ? await db.config.findMany({ where: { storeId, key: { in: roots.map(log => key(type, log.id)) } } }) : []
  const map = new Map(states.map((row: any) => [row.key, parse(row.value)]))
  return logs.map(log => { const state: any = map.get(key(type, log.id)); return { ...log, manualCorrectionEligible: eligible(type, log), correctionVersion: state?.version || 'original', correctionStatus: state ? state.current ? 'corrected' : 'cancelled' : null } })
}
