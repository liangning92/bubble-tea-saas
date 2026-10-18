import * as InventoryService from './InventoryService'
import {executeRecipe} from './ProcessRecipeService'
import {loadInventoryActors} from '../utils/inventoryActors'
import {inventoryForecast} from './InventoryForecastService'
import {getInventoryAlertConfig} from './InventoryAlertConfigService'
import {getExpiringBatches} from './InventoryService'
import {alignInventoryBatches,consumeInventoryBatches} from './InventoryBatchService'
import {randomUUID} from 'crypto'
import {convertQuantity,normalizedUnit} from '../utils/inventoryUnits'
import prisma from '../config/database'

// ============================================
// BigInt 序列化辅助函数
// ============================================
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'bigint') return Number(obj)
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

// ============================================
// 原料分类类型
// ============================================
export const INVENTORY_TYPES = {
  RAW_MATERIAL: 'raw_material',       // 原料(毛料) - 直接采购使用
  SEMI_FINISHED: 'semi_finished',       // 加工原料(半成品) - 需要加工
  FINISHED_GOODS: 'finished_goods'     // 成品 - 直接销售
}

export const INVENTORY_TYPE_LABELS: Record<string, string> = {
  [INVENTORY_TYPES.RAW_MATERIAL]: '原料(毛料)',
  [INVENTORY_TYPES.SEMI_FINISHED]: '加工原料(半成品)',
  [INVENTORY_TYPES.FINISHED_GOODS]: '成品'
}

export const INVENTORY_CATEGORIES = {
  TEA: '茶叶',
  MILK: '奶类',
  SUGAR: '糖类',
  TOPPING: '小料',
  SYRUP: '调味糖浆',
  SUPPLIES: '耗材',
  OTHER: '其他'
}

// ============================================
// 获取原料列表（带分类筛选）
// ============================================
export async function getInventoryList(storeId: string, type?: string) {
  const where: any = { storeId }
  if (type) where.type = type

  const result = await prisma.inventory.findMany({
    where,
    orderBy: [
      { category: 'asc' },
      { name: 'asc' }
    ]
  })
  return serializeBigInt(result)
}

// ============================================
// 获取单个原料详情（含批次）
// ============================================
export async function getInventoryDetail(id: string) {
  const result = await prisma.inventory.findUnique({
    where: { id },
    include: {
      batches: {
        where: { status: 'active' },
        orderBy: { expiryDate: 'asc' }
      }
    }
  })
  return serializeBigInt(result)
}

// ============================================
// 创建原料
// ============================================
export async function createInventory(data: {
  storeId: string
  name: string
  category: string
  type?: string
  unit: string
  avgCost?: number
  concentrateRatio?: number
  safetyStock?: number
  minStock?: number
  maxStock?: number
  shelfLife?: number
  processRecipeId?: string
}) {
  return InventoryService.createInventory(data)
}

// ============================================
// 更新原料
// ============================================
export async function updateInventory(id: string, data: Partial<{
  name: string
  category: string
  type: string
  unit: string
  avgCost: number
  concentrateRatio: number
  safetyStock: number
  minStock: number
  maxStock: number
  shelfLife: number
}>) {
  const permitted=new Set(['name','category','type','unit','avgCost','concentrateRatio','safetyStock','minStock','maxStock','shelfLife','processRecipeId'])
  if(Object.keys(data).some(key=>!permitted.has(key)))throw new Error('INVENTORY_METADATA_FIELD_NOT_ALLOWED')
  return InventoryService.updateInventory(id,data)
}

// ============================================
// 库存预警检查
// ============================================
export async function checkLowStockAlerts(storeId: string) {
  if(!(await getInventoryAlertConfig(storeId)).enableLowStockAlert)return []
  const inventory=await prisma.inventory.findMany({where:{storeId}}),forecast=await inventoryForecast(storeId)
  return forecast.filter(row=>!('calibrationRequired' in row&&row.calibrationRequired)&&row.currentStock<=row.effectiveSafetyStock).map(row=>({...row,safetyStock:row.effectiveSafetyStock,type:inventory.find(inv=>inv.id===row.inventoryId)?.type,minStock:inventory.find(inv=>inv.id===row.inventoryId)?.minStock}))
}

// ============================================
// 过期预警检查
// ============================================
export async function checkExpiryAlerts(storeId: string, daysAhead: number = 7) {
  if(!Number.isInteger(daysAhead)||daysAhead<1||daysAhead>365)throw Error('INVALID_FORECAST_DAYS')
  const now=new Date(),batches=await getExpiringBatches(storeId,daysAhead)
  return batches.map(batch=>({id:batch.id,batchNumber:batch.batchNumber,inventoryId:batch.inventoryId,inventoryName:batch.inventory.name,quantity:batch.quantity,unit:batch.inventory.unit,expiryDate:batch.expiryDate,daysUntilExpiry:Math.ceil((batch.expiryDate!.getTime()-now.getTime())/86400000)}))
}

// ============================================
// 计算补货建议
// ============================================
export async function calculateRestockSuggestions(storeId: string, daysAhead: number = 15) {
  if(!Number.isInteger(daysAhead)||daysAhead<1||daysAhead>365)throw Error('INVALID_FORECAST_DAYS')
  const forecast=await inventoryForecast(storeId),inventory=await prisma.inventory.findMany({where:{storeId}})
  return forecast.flatMap(row=>{
   const inv=inventory.find(material=>material.id===row.inventoryId)!,target=Math.max(row.effectiveSafetyStock,('predictionAvailable' in row&&!row.predictionAvailable?0:row.dailyUsage*daysAhead),inv.minStock||0)
   const pack='orderPackQuantity' in row?Number(row.orderPackQuantity)||1:1
   const needed=Math.max(0,Math.ceil((target-row.currentStock-('onOrderQty' in row?Number(row.onOrderQty):0))/pack)*pack),suggestQty=inv.maxStock>0?Math.min(needed,Math.max(0,Math.floor((inv.maxStock-row.currentStock-('onOrderQty' in row?Number(row.onOrderQty):0))/pack)*pack)):needed
   return suggestQty>0?[{...row,currentStock:Math.round(row.currentStock*100)/100,dailyUsage:Math.round(row.dailyUsage*100)/100,targetStock:target,suggestQty,suggestCost:suggestQty*Number(inv.avgCost||0)}]:[]
  }).sort((a,b)=>b.suggestCost-a.suggestCost)
}

// ============================================
// 执行加工配方
// ============================================
export async function executeProcessing(
  recipeId: string,
  staffId: string,
  multiplier: number = 1,
  note?: string,
  storeId?:string,
  operationId?:string
) {
  return executeRecipe(recipeId,multiplier,staffId,storeId,operationId,note)
}

// ============================================
// 获取加工历史
// ============================================
export async function getProcessingHistory(storeId: string, limit: number = 50) {
  const logs = await prisma.processingLog.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1,Math.min(200,limit||50)),
    include:{recipe:{select:{name:true}}}
  })
  const actors=await loadInventoryActors(prisma,storeId,logs.map(l=>l.staffId))
  return logs.map(l=>({...l,operator:actors.get(l.staffId)||null}))
}

// ============================================
// 获取加工日志详情
// ============================================
export async function getProcessingLogDetail(id: string) {
  const log = await prisma.processingLog.findUnique({
    where: { id }
  })

  if (!log) return null

  return {
    ...log,
    inputItems: JSON.parse(log.inputItems as string),
    outputItems: JSON.parse(log.outputItems as string)
  }
}
