import {getInventoryAlertConfig} from './InventoryAlertConfigService'
import {convertQuantity} from '../utils/inventoryUnits'
import {inventoryQuantityCost} from './InventoryQuantityService'
import prisma from '../config/database'

/**
 * 获取所有产品的BOM成本分析
 */
export async function getProductsWithBomCost(storeId: string) {
  const products = await prisma.product.findMany({
    where: { storeId, deletedAt: null },
    include: {
      category: { select: { name: true } },
      specs: { orderBy: { isDefault: 'desc' }, take: 1 },
      bomItems: {
        include: { inventory: true }
      }
    }
  })

  return Promise.all(products.map(async product => {
    const bomCost = await calculateBomCost(product.bomItems)
    const defaultSpec = product.specs[0]
    const sellingPrice = defaultSpec?.price || 0
    const profit = sellingPrice - bomCost
    const profitRate = sellingPrice > 0 ? Math.round(profit / sellingPrice * 100) : 0

    return {
      id: product.id,
      name: product.name,
      code: product.code,
      category: product.category?.name,
      sellingPrice,
      bomCost,
      profit,
      profitRate,
      bomItemCount: product.bomItems.length
    }
  }))
}

/**
 * 获取单个产品的BOM明细
 */
export async function getProductBomDetail(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: { select: { name: true } },
      specs: { orderBy: { isDefault: 'desc' } },
      bomItems: {
        include: { inventory: true }
      }
    }
  })

  if (!product) return null

  const bomDetails = await Promise.all(product.bomItems.map(async (item) => {
    const inv = item.inventory
    const recipeUnit = ((item as any).unit || inv?.unit || '个').toLowerCase()

    // 对于 semi_finished 类型，使用 getInventoryCostBreakdown 递归计算
    if (inv?.type === 'semi_finished' && inv.processRecipeId) {
      const breakdown = await getInventoryCostBreakdown(inv.id, item.quantity, item.unit)
      return {
        inventoryId: inv.id,
        name: inv.name,
        unit: recipeUnit,
        quantity: item.quantity,
        costPerUnit: breakdown.cost / (item.quantity || 1),
        totalCost: breakdown.cost,
        currentStock: Math.sign(inv.currentStock)*convertQuantity(Math.abs(inv.currentStock), inv.unit, item.unit),
        avgCost: Number(inv.avgCost),
        safetyStock: convertQuantity(inv.safetyStock, inv.unit, item.unit),
        inventoryType: 'semi_finished',
        costBreakdown: breakdown.breakdown ? {
          processRecipeName: breakdown.processRecipeName,
          breakdown: breakdown.breakdown
        } : undefined
      }
    }

    // 对于 raw_material，直接计算
    const cpu = convertQuantity(1, item.unit, inv.unit) * Number(inv.avgCost)
    const totalCost = item.quantity * cpu

    return {
      inventoryId: inv?.id || item.inventoryId,
      name: inv?.name || '',
      unit: recipeUnit,
      quantity: item.quantity,
      costPerUnit: Math.round(cpu * 100) / 100,
      totalCost: Math.round(totalCost),
      currentStock: Math.sign(inv.currentStock)*convertQuantity(Math.abs(inv.currentStock), inv.unit, item.unit),
      avgCost: Number(inv?.avgCost || 0),
      safetyStock: convertQuantity(inv.safetyStock, inv.unit, item.unit),
      inventoryType: inv.type
    }
  }))

  const totalBomCost = bomDetails.reduce((sum, item) => sum + item.totalCost, 0)

  return {
    id: product.id,
    name: product.name,
    code: product.code,
    category: product.category?.name,
    specs: product.specs,
    bomDetails,
    totalBomCost: Math.round(totalBomCost),
    suggestedPrices: product.specs.map(spec => {
      const costMarkup = Math.round(totalBomCost * 1.5) // 50% profit minimum
      return {
        specId: spec.id,
        specName: spec.name,
        price: spec.price,
        cost: totalBomCost,
        profit: spec.price - totalBomCost,
        profitRate: spec.price > 0 ? Math.round((spec.price - totalBomCost) / spec.price * 100) : 0
      }
    })
  }
}

async function calculateBomCost(bomItems: {inventoryId:string;quantity:number;unit:string}[]) {
 let total=0
 for(const item of bomItems)total+=await inventoryQuantityCost(prisma,item.inventoryId,item.quantity,item.unit)
 return Math.round(total)
}

/**
 * 获取原料使用预测（根据历史销售）
 */
export async function getMaterialUsageForecast(storeId: string, days: number = 30) {
  if(!Number.isInteger(days)||days<1||days>365)throw new Error('INVALID_FORECAST_DAYS')
  const settings=await getInventoryAlertConfig(storeId)
  const startDate=new Date(Date.now()-days*86400000)
  const materials=await prisma.inventory.findMany({where:{storeId},include:{stockOutLogs:{where:{createdAt:{gte:startDate},reason:{in:['sold','refund_unprepared']}}}}})
  return materials.map(mat=>{
    const totalUsage=mat.stockOutLogs.reduce((sum,log)=>sum+log.quantity,0)
    const dailyUsage=Math.max(0,totalUsage)/days
    const daysUntilStockOut=dailyUsage>0?Math.max(0,mat.currentStock/dailyUsage):null
    return {inventoryId:mat.id,name:mat.name,unit:mat.unit,avgCost:Number(mat.avgCost),currentStock:mat.currentStock,totalUsage,dailyUsage,daysUntilStockOut,
      suggestedReorderQty:dailyUsage>0?Math.max(0,dailyUsage*settings.lowStockWarningDays-mat.currentStock):null,
      basis:'recorded_sales_ledger_estimate',historyDays:days}
  }).sort((a,b)=>(a.daysUntilStockOut??Infinity)-(b.daysUntilStockOut??Infinity))
}

/** Forecast is advisory; no purchase or external notification is issued. */
export async function getLowStockAlerts(storeId:string,days:number=30){
 const settings=await getInventoryAlertConfig(storeId)
 if(!settings.enableLowStockAlert)return []
 return (await getMaterialUsageForecast(storeId,days))
  .filter(mat=>mat.currentStock<=0||(mat.daysUntilStockOut!==null&&mat.daysUntilStockOut<=settings.lowStockWarningDays))
  .map(mat=>({...mat,urgency:mat.currentStock<=0||(mat.daysUntilStockOut!==null&&mat.daysUntilStockOut<=settings.lowStockCriticalDays)?'critical':'warning'}))
}

/**
 * 计算单个产品成本
 */
export async function calculateProductCost(productId: string): Promise<number> {
  const bomItems = await prisma.bOMItem.findMany({
    where: { productId },
    include: { inventory: true }
  })

  return calculateBomCost(bomItems)
}

/**
 * 获取原料的成本分解（支持 semi_finished 递归展开）
 * 用于配方编辑页面显示每个原料的成本来源
 */
export async function getInventoryCostBreakdown(inventoryId:string,quantity:number,unit?:string) {
 const inv=await prisma.inventory.findUnique({where:{id:inventoryId}})
 if(!inv)return {type:'unknown',cost:0,breakdown:null}
 const cost=Math.round(await inventoryQuantityCost(prisma,inventoryId,quantity,unit||inv.unit))
 if(inv.type!=='semi_finished'||!inv.processRecipeId)return {type:inv.type,cost,breakdown:null}
 const recipe=await prisma.processRecipe.findUniqueOrThrow({where:{id:inv.processRecipeId},include:{items:{include:{inventory:true}}}})
 const output=recipe.items.find(i=>i.type==='output')!
 const multiplier=convertQuantity(quantity,unit||inv.unit,recipe.outputUnit)/output.quantity
 const breakdown=await Promise.all(recipe.items.filter(i=>i.type==='input'&&i.inventory).map(async input=>{
  const quantity=input.quantity*multiplier,inventory=input.inventory!
  const totalCost=await inventoryQuantityCost(prisma,inventory.id,quantity,inventory.unit,0,inv.storeId)
  return {inventoryId:inventory.id,name:inventory.name,unit:inventory.unit,quantity,costPerUnit:quantity?totalCost/quantity:0,totalCost:Math.round(totalCost)}
 }))
 return {type:inv.type,cost,breakdown,processRecipeName:recipe.name,processRecipeId:recipe.id,outputQuantity:output.quantity}
}
