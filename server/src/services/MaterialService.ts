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
  return prisma.inventory.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      category: data.category,
      type: data.type || 'raw_material',
      unit: data.unit,
      avgCost: data.avgCost || 0,
      concentrateRatio: data.concentrateRatio || 1,
      safetyStock: data.safetyStock || 0,
      minStock: data.minStock || 0,
      maxStock: data.maxStock || 0,
      shelfLife: data.shelfLife || 0,
      processRecipeId: data.processRecipeId || null
    }
  })
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
  const current=await prisma.inventory.findUniqueOrThrow({where:{id}})
  if(data.unit!==undefined&&normalizedUnit(data.unit)!==normalizedUnit(current.unit))throw new Error('INVENTORY_UNIT_IMMUTABLE')
  delete data.unit
  return prisma.inventory.update({
    where: { id },
    data
  })
}

// ============================================
// 库存预警检查
// ============================================
export async function checkLowStockAlerts(storeId: string) {
  if(!(await getInventoryAlertConfig(storeId)).enableLowStockAlert)return []
  const inventory=await prisma.inventory.findMany({where:{storeId}}),forecast=await inventoryForecast(storeId)
  return forecast.filter(row=>row.currentStock<=row.effectiveSafetyStock).map(row=>({...row,safetyStock:row.effectiveSafetyStock,type:inventory.find(inv=>inv.id===row.inventoryId)?.type,minStock:inventory.find(inv=>inv.id===row.inventoryId)?.minStock}))
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
   const inv=inventory.find(material=>material.id===row.inventoryId)!,target=Math.max(row.effectiveSafetyStock,row.dailyUsage*daysAhead,inv.minStock||0)
   const needed=Math.max(0,Math.ceil(target-row.currentStock)),suggestQty=inv.maxStock>0?Math.min(needed,Math.max(0,Math.ceil(inv.maxStock-row.currentStock))):needed
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
  note?: string
) {
  const recipe = await prisma.processRecipe.findUnique({
    where: { id: recipeId },
    include: {
      items: { include: { inventory: true } },
      store: { select: { id: true } },
      outputInventory: true  // 产出半成品库存
    }
  })

  if (!recipe) throw new Error('Recipe not found')
  if (!recipe.outputInventory) throw new Error('Recipe has no output inventory configured')

  const inputItems: any[] = []
  let totalInputCost = 0

  // 计算投入成本
  for (const input of recipe.items.filter(i => i.type === 'input')) {
    const inv = input.inventory
    if (!inv) continue
    const deductQty = input.quantity * multiplier
    const itemUnit=inv.unit
    const unitCost=Number(inv.avgCost||0)

    const cost = Number(deductQty) * unitCost
    totalInputCost += cost

    inputItems.push({
      inventoryId: inv.id,
      name: inv.name,
      unit: itemUnit,
      quantity: deductQty,
      unitCost: Math.round(Number(unitCost)),
      cost: Math.round(Number(cost))
    })
  }

  // 计算产出总量
  let totalOutputQty = 0
  for (const output of recipe.items.filter(i => i.type === 'output')) {
    totalOutputQty += output.quantity * multiplier
  }
  totalOutputQty=convertQuantity(totalOutputQty,recipe.outputUnit,recipe.outputInventory.unit)
  const outputUnitCost = totalOutputQty > 0 ? Math.round(totalInputCost / totalOutputQty) : 0

  // 构建产出记录（使用 outputInventory）
  const outputItems = [{
    inventoryId: recipe.outputInventory.id,
    name: recipe.outputInventory.name,
    unit: recipe.outputInventory.unit,
    quantity: totalOutputQty,
    unitCost: outputUnitCost,
    cost: totalInputCost
  }]

  // 事务执行
  return prisma.$transaction(async (tx) => {
    // 扣减投入原料
    for (const input of recipe.items.filter(i => i.type === 'input')) {
      if (!input.inventoryId) continue
      const deductQty = input.quantity * multiplier
      const inv=await tx.inventory.findFirst({where:{id:input.inventoryId,storeId:recipe.storeId}})
      if(!inv||deductQty<=0||inv.currentStock<deductQty)throw Error('Insufficient stock')
      const changed=await tx.inventory.updateMany({where:{id:inv.id,currentStock:inv.currentStock},data:{currentStock:{decrement:deductQty}}})
      if(changed.count!==1)throw Error('INVENTORY_CONCURRENT_CHANGE_RETRY')
      await consumeInventoryBatches(tx,inv,deductQty)
      await tx.stockOutLog.create({
        data: {
          inventoryId: input.inventoryId,
          quantity: deductQty,
          reason: 'process',
          staffId,
          note: `加工: ${recipe.name} x${multiplier}`
        }
      })
    }

    // 添加产出到 outputInventory
    const output=await tx.inventory.findFirstOrThrow({where:{id:recipe.outputInventory.id,storeId:recipe.storeId}})
    const received=await tx.inventory.updateMany({
      where: { id: output.id,currentStock:output.currentStock,avgCost:output.avgCost },
      data: {
        currentStock: { increment: totalOutputQty },
        avgCost: outputUnitCost
      }
    })
    if(received.count!==1)throw Error('INVENTORY_CONCURRENT_CHANGE_RETRY')
    await alignInventoryBatches(tx,output)
    const batch=await tx.batch.create({data:{inventoryId:output.id,batchNumber:`PROCESS-${randomUUID()}`,quantity:totalOutputQty,unitCost:outputUnitCost,status:'active'}})
    await tx.stockInLog.create({
      data: {
        inventoryId: recipe.outputInventory.id,
        batchId:batch.id,
        staffId,
        quantity: totalOutputQty,
        unitCost: outputUnitCost,
        totalAmount: totalInputCost,
        note: `加工产出: ${recipe.name} x${multiplier}`
      }
    })

    // 记录加工日志
    const log = await tx.processingLog.create({
      data: {
        storeId: recipe.store.id,
        recipeId: recipe.id,
        staffId,
        multiplier,
        inputItems: JSON.stringify(inputItems),
        outputItems: JSON.stringify(outputItems),
        totalInputCost,
        totalOutputCost: totalInputCost,
        note
      }
    })

    return {
      id: log.id,
      recipeName: recipe.name,
      multiplier,
      inputItems,
      outputItems,
      totalInputCost,
      totalOutputCost: totalInputCost
    }
  })
}

// ============================================
// 获取加工历史
// ============================================
export async function getProcessingHistory(storeId: string, limit: number = 50) {
  return prisma.processingLog.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    take: limit
  })
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
