import { manualCorrectionMetadata } from './ManualStockCorrectionService'
import {unifiedInventorySince,CALIBRATED_PREFIX} from './UnifiedInventoryService'
import {inventoryUsageMode} from '../utils/inventoryUsagePolicy'
import {validateInventoryProcessLink} from '../utils/inventoryProcessLink'
import {recalculateInventoryConsumers,inventoryQuantityCost} from './InventoryQuantityService'
import {loadInventoryActors, inventoryLogActorId} from '../utils/inventoryActors'
import {getInventoryAlertConfig} from './InventoryAlertConfigService'
import {inventoryForecast} from './InventoryForecastService'
import {alignInventoryBatches,consumeInventoryBatches,receiptBatchDates,availableBatches} from './InventoryBatchService'
import { createHash,randomUUID } from 'crypto'
import {physicalInventoryVariance} from './InventoryVarianceService'
import {convertQuantity,normalizedUnit,validatePackage,InventoryPackage} from '../utils/inventoryUnits'
import { containsText } from '../utils/textSearch'
import prisma from '../config/database'

// ============================================
// BigInt 序列化辅助函数
// ============================================
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'bigint') return Number(obj)
  if (obj instanceof Date) return obj.toISOString()
  if (Array.isArray(obj)) return obj.map(serializeBigInt)
  if (typeof obj === 'object') {
    const result: any = {}
    for (const key of Object.keys(obj)) {
      result[key] = serializeBigInt(obj[key])
    }
    return result
  }
  return obj
}

export interface InventoryFilter {
  storeId?: string
  categoryId?: string
  search?: string
  lowStock?: boolean
}

export interface StockOperation {
  expiryDate?:string
  manufacturingDate?:string
  operationId?: string
  inventoryId: string
  storeId: string
  quantity: number
  inputUnit?: string
  reason: string
  note?: string
  staffId?: string
  orderId?: string
  supplierId?: string
}

// Get inventory items with filtering
export async function getInventory(filter: InventoryFilter) {
  const where: any = {}

  if (filter.storeId) where.storeId = filter.storeId
  if (filter.categoryId) where.category = filter.categoryId
  if (filter.search) {
    where.OR = [
      { name: containsText(filter.search) }
    ]
  }

  // Low stock filter based on safetyStock
  const items = await prisma.inventory.findMany({
    where,
    orderBy: { name: 'asc' }
  })

  const packages=await prisma.config.findMany({where:{key:{startsWith:'inventoryPackage:'},...(filter.storeId?{storeId:filter.storeId}:{})}})
  const forecasts=filter.storeId?await inventoryForecast(filter.storeId):[]
  const enriched=await Promise.all(items.map(async item=>{
    const saved=packages.find(p=>p.storeId===item.storeId&&p.key===`inventoryPackage:${item.id}`)
    let packaging:InventoryPackage|null=null
    try{if(saved)packaging=validatePackage(JSON.parse(saved.value),item.unit)}catch{}
    const forecast=forecasts.find((row:any)=>row.inventoryId===item.id)
    let unitCost=Number(item.avgCost),processCostAvailable=true
    if(item.type==='semi_finished'&&item.processRecipeId){try{unitCost=await inventoryQuantityCost(prisma,item.id,1,item.unit,0,item.storeId)}catch{unitCost=0;processCostAvailable=false}}
    return {...item,unifiedStock:!!(forecast&&'calibrationRequired' in forecast),calibrationRequired:forecast&&'calibrationRequired' in forecast?forecast.calibrationRequired:false,avgCost:unitCost,processCostAvailable,packaging,effectiveSafetyStock:forecast?.effectiveSafetyStock??item.safetyStock,dynamicSafetyStock:forecast?.dynamicSafetyStock??0,forecastHistoryDays:forecast?.historyDays??0,daysUntilStockOut:forecast?.daysUntilStockOut??null}
  }))
  // Filter low stock using safetyStock threshold
  if (filter.lowStock) {
    return serializeBigInt(enriched.filter(item => !item.calibrationRequired && item.currentStock <= item.effectiveSafetyStock))
  }

  return serializeBigInt(enriched)
}

// Get single inventory item
export async function getInventoryById(inventoryId: string) {
  const result = await prisma.inventory.findUnique({
    where: { id: inventoryId },
    include: {
      stockInLogs: {
        orderBy: { createdAt: 'desc' },
        take: 20
      },
      stockOutLogs: {
        orderBy: { createdAt: 'desc' },
        take: 20
      }
    }
  })
  return serializeBigInt(result)
}

// Stock in operation
export async function stockIn(data: StockOperation & { unitCost?: number }, db:any=prisma) {
  const { inventoryId, storeId, unitCost, note, staffId, supplierId } = data

  const fingerprint = createHash('sha256').update(JSON.stringify({inventoryId,storeId,quantity:data.quantity,inputUnit:data.inputUnit||'',unitCost:('unitCost' in data?data.unitCost:null),reason:data.reason,expiryDate:data.expiryDate||'',manufacturingDate:data.manufacturingDate||'',note:note||'',supplierId:data.supplierId||'',staffId})).digest('hex')
  const replay = async (tx:any) => {
    if (!data.operationId) return null
    const log = await tx.stockInLog.findUnique({where:{operationId:data.operationId},include:{inventory:true}})
    if (!log) return null
    let saved:any;try{saved=JSON.parse(log.note||'null')}catch{}
    if (log.inventory.storeId!==storeId||saved?.requestFingerprint!==fingerprint) throw Error('STOCK_IDEMPOTENCY_CONFLICT')
    return serializeBigInt(log.inventory)
  }
  try { return await db.$transaction(async (tx) => {
    const previous=await replay(tx);if(previous)return previous
    // Get current inventory
    const inventory = await tx.inventory.findFirst({
      where: { id: inventoryId, storeId }
    })

    if (!inventory) {
      throw new Error('Inventory not found')
    }

    if(inventory.type==='semi_finished'&&inventory.processRecipeId)throw Error('PROCESS_OUTPUT_IS_CONVERSION_ONLY')
    if(supplierId&&!await tx.supplier.findFirst({where:{id:supplierId,storeId}}))throw Error('SUPPLIER_STORE_MISMATCH')
    if(!Number.isFinite(data.quantity)||data.quantity<=0||unitCost!==undefined&&(!Number.isSafeInteger(unitCost)||unitCost<0))throw new Error('INVALID_STOCK_INPUT')
    const inputUnit=data.inputUnit||inventory.unit
    const saved=data.inputUnit?await tx.config.findUnique({where:{storeId_key:{storeId,key:`inventoryPackage:${inventoryId}`}}}):null
    const pack=saved?validatePackage(JSON.parse(saved.value),inventory.unit):null
    const quantity=convertQuantity(data.quantity,inputUnit,inventory.unit,pack)
    if(quantity<=0)throw new Error('INVALID_QUANTITY')
    const totalAmount=Math.round((unitCost||0)*data.quantity)
    const baseCost=quantity>0?totalAmount/quantity:0
    if(!Number.isSafeInteger(totalAmount)||totalAmount>2147483647||baseCost>2147483647)throw new Error('INVALID_STOCK_COST')
    const logNote=JSON.stringify({version:1,kind:'receipt',requestFingerprint:fingerprint,inputQuantity:data.quantity,inputUnit,ledgerUnit:inventory.unit,ledgerQuantity:quantity,inputUnitCost:unitCost??0,costProvided:unitCost!==undefined,carryingAmount:unitCost!==undefined?totalAmount:null,pack,note:note||''})

    // Missing cost preserves the carrying average; an explicit zero is a free receipt.
    const avgCost = Number(inventory.avgCost)
    let newAvgCost = avgCost
    if (unitCost !== undefined) {
      const totalCurrentValue = avgCost * Math.max(0,inventory.currentStock)
      const totalNewValue = totalAmount
      newAvgCost = (totalCurrentValue + totalNewValue) / (Math.max(0,inventory.currentStock) + quantity)
    }

    const dates=receiptBatchDates(data.manufacturingDate,data.expiryDate)
    await alignInventoryBatches(tx,inventory)
    const changed=await tx.inventory.updateMany({where:{id:inventoryId,storeId,currentStock:inventory.currentStock,avgCost:inventory.avgCost},data:{currentStock:{increment:quantity},avgCost:newAvgCost}})
    if(changed.count!==1)throw new Error('INVENTORY_CONCURRENT_CHANGE_RETRY')
    const updated=await tx.inventory.findUniqueOrThrow({where:{id:inventoryId}})

    const batch=await tx.batch.create({data:{inventoryId,batchNumber:`IN-${data.operationId||randomUUID()}`,quantity,unitCost:baseCost,status:'active',...dates}})
    // Create stock in log
    await tx.stockInLog.create({
      data: {
        inventoryId,
        operationId: data.operationId,
        batchId:batch.id,
        quantity,
        unitCost: baseCost,
        totalAmount,
        supplierId,
        staffId,
        note: logNote
      }
    })

    if (unitCost !== undefined) await recalculateInventoryConsumers(tx,[inventoryId])
    return serializeBigInt(updated)
  }) } catch(error:any) {if(error.code==='P2002'){const previous=await replay(db);if(previous)return previous}throw error}
}

// Stock out operation
export async function stockOut(data: StockOperation, db:any=prisma) {
  const { inventoryId, storeId, reason, note, staffId, orderId } = data

  const fingerprint = createHash('sha256').update(JSON.stringify({inventoryId,storeId,quantity:data.quantity,inputUnit:data.inputUnit||'',unitCost:('unitCost' in data?data.unitCost:null),reason:data.reason,expiryDate:data.expiryDate||'',manufacturingDate:data.manufacturingDate||'',note:note||'',supplierId:data.supplierId||'',staffId})).digest('hex')
  const replay = async (tx:any) => {
    if (!data.operationId) return null
    const log = await tx.stockOutLog.findUnique({where:{operationId:data.operationId},include:{inventory:true}})
    if (!log) return null
    let saved:any;try{saved=JSON.parse(log.note||'null')}catch{}
    if (log.inventory.storeId!==storeId||saved?.requestFingerprint!==fingerprint) throw Error('STOCK_IDEMPOTENCY_CONFLICT')
    return serializeBigInt(log.inventory)
  }
  try { return await db.$transaction(async (tx) => {
    const previous=await replay(tx);if(previous)return previous
    // Get current inventory
    const inventory = await tx.inventory.findFirst({
      where: { id: inventoryId, storeId }
    })

    if (!inventory) {
      throw new Error('Inventory not found')
    }

    if(inventory.type==='semi_finished'&&inventory.processRecipeId)throw Error('PROCESS_OUTPUT_IS_CONVERSION_ONLY')
    if(!Number.isFinite(data.quantity)||data.quantity<=0)throw new Error('INVALID_QUANTITY')
    const saved=data.inputUnit?await tx.config.findUnique({where:{storeId_key:{storeId,key:`inventoryPackage:${inventoryId}`}}}):null
    const quantity=convertQuantity(data.quantity,data.inputUnit||inventory.unit,inventory.unit,saved?validatePackage(JSON.parse(saved.value),inventory.unit):null)
    if(reason==='other'&&!note?.trim())throw Error('OUT_REASON_REQUIRED')
    const internalIssue=reason==='withdrawal'&&!!(await unifiedInventorySince(tx,storeId))
    if(await unifiedInventorySince(tx,storeId)){if(['sold','adjust'].includes(reason||''))throw Error('USE_SALE_OR_COUNT_WORKFLOW')}
    if (!internalIssue && inventory.currentStock < quantity) {
      throw new Error('Insufficient stock')
    }

    const changed=await tx.inventory.updateMany({where:{id:inventoryId,storeId,currentStock:inventory.currentStock},data:{currentStock:{decrement:internalIssue?0:quantity}}})
    if(changed.count!==1)throw new Error('INVENTORY_CONCURRENT_CHANGE_RETRY')
    const updated=await tx.inventory.findUniqueOrThrow({where:{id:inventoryId}})

    const batchAllocations = !internalIssue ? await consumeInventoryBatches(tx,inventory,quantity) : []
    // Create stock out log
    await tx.stockOutLog.create({
      data: {
        inventoryId,
        operationId: data.operationId,
        staffId,
        quantity,
        reason,
        note:JSON.stringify({version:1,kind:'manual-out',batchAllocations,carryingAmount:quantity*Number(inventory.avgCost),stockEffect:internalIssue?'internal_transfer':'physical_out',unitCost:Number(inventory.avgCost),totalAmount:Math.round(quantity*Number(inventory.avgCost)),note:note||'',requestFingerprint:fingerprint,inputQuantity:data.quantity,inputUnit:data.inputUnit||inventory.unit,ledgerUnit:inventory.unit,ledgerQuantity:quantity}),
        orderId
      }
    })

    return serializeBigInt(updated)
  }) } catch(error:any) {if(error.code==='P2002'){const previous=await replay(db);if(previous)return previous}throw error}
}

// Get low stock alerts (using safetyStock as threshold)
export async function getLowStockAlerts(storeId:string){
 const settings=await getInventoryAlertConfig(storeId)
 if(!settings.enableLowStockAlert)return []
 return (await inventoryForecast(storeId)).filter(row=>!('calibrationRequired' in row&&row.calibrationRequired)&&inventoryUsageMode({name:row.name})!=='self_produced'&&row.currentStock<=row.effectiveSafetyStock).map(row=>({...row,safetyStock:row.effectiveSafetyStock,shortage:row.suggestedReorderQty,estimatedRestockCost:Math.round(row.suggestedReorderQty*row.avgCost)}))
}

// Adjust inventory (for inventory count correction)
export async function adjustInventory(
  inventoryId: string,
  newStock: number,
  reason: string,
  staffId: string
) {
  return prisma.$transaction(async (tx) => {
    const inventory = await tx.inventory.findUnique({
      where: { id: inventoryId }
    })

    if (!inventory) {
      throw new Error('Inventory not found')
    }

    if(inventory.type==='semi_finished'&&inventory.processRecipeId)throw Error('PROCESS_OUTPUT_IS_CONVERSION_ONLY')
    const difference = newStock - inventory.currentStock

    // Update stock
    const updated = await tx.inventory.update({
      where: { id: inventoryId },
      data: {
        currentStock: newStock
      }
    })

    // Create appropriate log
    if (difference > 0) {
      await tx.stockInLog.create({
        data: {
          inventoryId,
          quantity: difference,
          unitCost: Number(inventory.avgCost),
          totalAmount: Math.round(difference * Number(inventory.avgCost)),
          note: `Adjustment: ${reason}`
        }
      })
    } else {
      await tx.stockOutLog.create({
        data: {
          inventoryId,
          quantity: Math.abs(difference),
          reason: 'adjust',
          note: `Adjustment: ${reason}`
        }
      })
    }

    return updated
  })
}

// Get inventory statistics
export async function getInventoryStats(storeId: string) {
  const items = await prisma.inventory.findMany({
    where: { storeId,OR:[{type:{not:'semi_finished'}},{processRecipeId:null}] }
  })

  const total = items.length
  const lowStock = items.filter(i => i.currentStock > 0 && i.currentStock <= i.minStock).length
  const outOfStock = items.filter(i => i.currentStock === 0).length
  const totalValue = items.reduce((sum, i) => sum + Math.round(i.currentStock * Number(i.avgCost)), 0)
  const totalItems = items.reduce((sum, i) => sum + i.currentStock, 0)

  return { total, lowStock, outOfStock, totalValue, totalItems }
}

// Get stock in logs
export interface StockLogInFilter {
  storeId: string
  inventoryId?: string
  startDate?: string
  endDate?: string
  category?: string
  search?: string
  take?: number
}

export interface StockLogOutFilter {
  storeId: string
  inventoryId?: string
  startDate?: string
  endDate?: string
  reason?: string
  category?: string
  search?: string
  take?: number
}

export async function getStockInLogs(
  storeIdOrFilter: string | StockLogInFilter,
  inventoryId?: string
) {
  const filter: StockLogInFilter = typeof storeIdOrFilter === 'string'
    ? { storeId: storeIdOrFilter, inventoryId }
    : storeIdOrFilter

  const where: any = {
    inventory: {
      storeId: filter.storeId
    }
  }

  if (filter.inventoryId) {
    where.inventoryId = filter.inventoryId
  }

  if (filter.category) {
    where.inventory.category = filter.category
  }

  if (filter.search) {
    where.inventory.name = containsText(filter.search)
  }

  if (filter.startDate || filter.endDate) {
    where.createdAt = {}
    if (filter.startDate) {
      const start = new Date(filter.startDate)
      start.setHours(0, 0, 0, 0)
      where.createdAt.gte = start
    }
    if (filter.endDate) {
      const end = new Date(filter.endDate)
      end.setHours(23, 59, 59, 999)
      where.createdAt.lte = end
    }
  }

  const logs = await prisma.stockInLog.findMany({
    where,
    include: {
      inventory: { select: { id: true, name: true, unit: true, category: true, avgCost: true } },
      supplier: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: filter.take || 200
  })

  const actors = await loadInventoryActors(prisma, filter.storeId, logs.map(inventoryLogActorId))
  return manualCorrectionMetadata(prisma, filter.storeId, 'stock_in', logs.map((l: any) => ({
    operator: actors.get(inventoryLogActorId(l) || '') || null,
    ...l,
    unitCost: Number(l.unitCost || 0),
    totalAmount: Number(l.totalAmount || 0),
    inventory: l.inventory ? {
      ...l.inventory,
      avgCost: Number(l.inventory.avgCost || 0)
    } : null
  })))
}

// Get stock out logs
export async function getStockOutLogs(
  storeIdOrFilter: string | StockLogOutFilter,
  inventoryId?: string
) {
  const filter: StockLogOutFilter = typeof storeIdOrFilter === 'string'
    ? { storeId: storeIdOrFilter, inventoryId }
    : storeIdOrFilter

  const where: any = {
    inventory: {
      storeId: filter.storeId
    }
  }

  if (filter.inventoryId) {
    where.inventoryId = filter.inventoryId
  }

  if (filter.reason) {
    where.reason = filter.reason
  }

  if (filter.category) {
    where.inventory.category = filter.category
  }

  if (filter.search) {
    where.inventory.name = containsText(filter.search)
  }

  if (filter.startDate || filter.endDate) {
    where.createdAt = {}
    if (filter.startDate) {
      const start = new Date(filter.startDate)
      start.setHours(0, 0, 0, 0)
      where.createdAt.gte = start
    }
    if (filter.endDate) {
      const end = new Date(filter.endDate)
      end.setHours(23, 59, 59, 999)
      where.createdAt.lte = end
    }
  }

  const logs = await prisma.stockOutLog.findMany({
    where,
    include: {
      inventory: { select: { id: true, name: true, unit: true, category: true, avgCost: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: filter.take || 200
  })

  const actors = await loadInventoryActors(prisma, filter.storeId, logs.map(inventoryLogActorId))
  return manualCorrectionMetadata(prisma, filter.storeId, 'stock_out', logs.map((l:any)=>{let valuation:any;try{valuation=JSON.parse(l.note||'null')}catch{}
    return ({
    unitCost:valuation?.unitCost??Number(l.inventory?.avgCost||0),
    totalAmount:valuation?.totalAmount??Math.round(l.quantity*Number(l.inventory?.avgCost||0)),
    valuationBasis:valuation?.unitCost!==undefined?'at_operation':'current_average_estimate',
    operator: actors.get(inventoryLogActorId(l) || '') || null,
    ...l,
    inventory: l.inventory ? {
      ...l.inventory,
      avgCost: Number(l.inventory.avgCost || 0)
    } : null
  })}))
}

// Create inventory item
export async function createInventory(data: {
  storeId: string
  name: string
  category: string
  type?: string
  processRecipeId?: string | null
  unit: string
  avgCost?: number
  minStock?: number
  maxStock?: number
  safetyStock?: number
  shelfLife?: number
  concentrateRatio?: number
}) {
  await validateInventoryProcessLink(prisma, {...data, type:data.type||'raw_material'})
  const result = await prisma.inventory.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      category: data.category,
      type: data.type || 'raw_material',
      processRecipeId: data.processRecipeId || null,
      unit: data.unit,
      avgCost: data.avgCost || 0,
      minStock: data.minStock || 0,
      maxStock: data.maxStock || 0,
      safetyStock: data.safetyStock || 0,
      shelfLife: data.shelfLife || 0,
      concentrateRatio: data.concentrateRatio || 1
    }
  })
  return serializeBigInt(result)
}

// Update inventory item
export async function updateInventory(
  inventoryId: string,
  data: Partial<{
    name: string
    category: string
    type: string
    processRecipeId: string | null
    unit: string
    currentStock: number
    avgCost: number
    minStock: number
    maxStock: number
    safetyStock: number
    shelfLife: number
    packaging: InventoryPackage | null
    concentrateRatio: number
  }>
) {
  return prisma.$transaction(async tx=>{
    if('ledgerSequence' in data||'ledgerEpoch' in data)throw new Error('INVENTORY_METADATA_FIELD_NOT_ALLOWED')
    const current=await tx.inventory.findUniqueOrThrow({where:{id:inventoryId}})
    if(data.unit!==undefined&&normalizedUnit(data.unit)!==normalizedUnit(current.unit))throw new Error('INVENTORY_UNIT_IMMUTABLE')
    if(data.currentStock!==undefined&&data.currentStock!==current.currentStock)throw new Error('USE_INVENTORY_COUNT_OR_ADJUSTMENT')
    if(data.type!==undefined||data.processRecipeId!==undefined||data.name!==undefined)await validateInventoryProcessLink(tx,{...current,...data})
    const {packaging,unit,currentStock,...fields}=data
    if(packaging!==undefined){
      const key=`inventoryPackage:${inventoryId}`
      if(packaging===null)await tx.config.deleteMany({where:{storeId:current.storeId,key}})
      else{const value=JSON.stringify(validatePackage(packaging,current.unit));await tx.config.upsert({where:{storeId_key:{storeId:current.storeId,key}},create:{storeId:current.storeId,key,value,category:'inventory'},update:{value}})}
    }
    const updated=await tx.inventory.update({where:{id:inventoryId},data:fields})
    await recalculateInventoryConsumers(tx,[inventoryId])
    return serializeBigInt(updated)
  })
}

// Delete inventory item
export async function deleteInventory(inventoryId: string) {
  // Delete in a transaction to handle foreign key constraints
  return prisma.$transaction(async (tx) => {
    // Serialize deletion against corrections; never erase their source or signed trail.
    await tx.inventory.update({where:{id:inventoryId},data:{currentStock:{increment:0}}})
    const historyWhere={inventoryId,operationId:{startsWith:'manual-correction:'}}
    if(await tx.stockInLog.findFirst({where:historyWhere,select:{id:true}})||await tx.stockOutLog.findFirst({where:historyWhere,select:{id:true}}))throw new Error('MANUAL_CORRECTION_HISTORY_RETAIN_MATERIAL')
    // Delete related records first
    await tx.stockInLog.deleteMany({ where: { inventoryId } })
    await tx.stockOutLog.deleteMany({ where: { inventoryId } })
    await tx.batch.deleteMany({ where: { inventoryId } })
    await tx.bOMItem.deleteMany({ where: { inventoryId } })
    await tx.inventoryCountItem.deleteMany({ where: { inventoryId } })
    await tx.processRecipeItem.deleteMany({ where: { inventoryId } })

    // Now delete the inventory item
    return tx.inventory.delete({
      where: { id: inventoryId }
    })
  })
}
// Get batch list
export async function getBatches(storeId: string, inventoryId?: string) {
  const where: any = { inventory: { storeId } }
  if (inventoryId) where.inventoryId = inventoryId

  return prisma.batch.findMany({
    where,
    include: {
      inventory: { select: { id: true, name: true, unit: true } }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// Get expiring batches (for shelf life alerts)
export async function getExpiringBatches(storeId: string, daysAhead: number = 7) {
  const now=new Date(),cutoffDate=new Date(now.getTime()+daysAhead*86400000)
  const inventory=await prisma.inventory.findMany({where:{storeId},include:{batches:{where:{status:'active',quantity:{gt:0}}}}})
  return inventory.flatMap(inv=>availableBatches(inv.batches,inv.currentStock).filter(batch=>batch.quantity>0&&batch.expiryDate&&batch.expiryDate<=cutoffDate).map(batch=>({...batch,inventory:{id:inv.id,name:inv.name,unit:inv.unit,shelfLife:inv.shelfLife}}))).sort((a,b)=>a.expiryDate!.getTime()-b.expiryDate!.getTime())
}

// ============================================
// 库存异常预警 - 理论消耗 vs 实际消耗对比
// ============================================

export interface ConsumptionAnalysis {
  inventoryId: string
  inventoryName: string
  unit: string
  theoreticalConsumption: number  // 根据BOM和订单计算的理论消耗
  actualConsumption: number // 实际出库量
  variance: number                // 差异量 = 实际 -理论
  variancePercent: number // 差异百分比
  varianceStatus: 'normal' | 'warning' | 'critical'  // 状态
  orderCount: number              // 关联订单数
  lastOrderDate: string | null    // 最后订单时间
}

export interface ConsumptionAnalysisFilter {
  storeId: string
  startDate: string
  endDate: string
  varianceThreshold?: number      // 差异百分比阈值，默认10%
  varianceCriticalThreshold?: number
  category?: string              // 原料分类过滤
}

/**
 * 分析库存异常：理论消耗 vs 实际消耗
 *
 * 理论消耗 = SUM(BOM用量 × 订单数量) for each material
 * 实际消耗 = SUM(StockOutLog.quantity) for each material
 *
 * 如果 variancePercent > varianceThreshold，标记为异常
 */
export async function getConsumptionAnalysis(filter:ConsumptionAnalysisFilter){return physicalInventoryVariance(filter)}

// 获取异常预警汇总
export async function getAnomalySummary(filter: ConsumptionAnalysisFilter) {
  const analysis = await getConsumptionAnalysis(filter)

  const summary = {
    total: analysis.length,
    unavailable: analysis.filter(a => a.varianceStatus === 'unavailable').length,
    normal: analysis.filter(a => a.varianceStatus === 'normal').length,
    warning: analysis.filter(a => a.varianceStatus === 'warning').length,
    critical: analysis.filter(a => a.varianceStatus === 'critical').length,
    criticalItems: analysis.filter(a => a.varianceStatus === 'critical')
  }

  return summary
}
