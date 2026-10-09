import { quoteOfflineActivity } from './ActivityOfflineService'
import { quoteActivities, enqueueActivityGrants, runActivityJobs, reverseActivityGrants, ensureMigrated } from './ActivityService'
import { getActivityPriceRules } from './ActivityPricingService'
import { activityPrice } from '../utils/activityPricing'
import { findOrderReplay as replayReceipt, encodeOrderReceipt, orderRequestFingerprint, publicOrder } from './OrderReplayService'
import { containsFilter } from '../utils/stringFilter'
import { OrderBusinessRejection } from './OrderBusinessRejection'
import {orderNumberCandidate,isOrderNumberCollision} from '../utils/orderNumber'
import {convertQuantity} from '../utils/inventoryUnits'
import {inventoryQuantityCost} from './InventoryQuantityService'
import { replicaKey } from './ReceiptSyncService'
import { containsText } from '../utils/textSearch'
import { validateRefundItems } from '../utils/refundPolicy'
import { allowedPreviousOrderStatuses } from '../utils/orderStatusPolicy'
import { Prisma } from '@prisma/client'
import prisma from '../config/database'
import { config } from '../config/env'
import { startOfTodayJakarta,formatDate } from '../utils/dateUtils'
import { processOrderReferralRewards } from './ReferralService'
import { getOrCreatePointsRule, calculatePoints } from './PointsRuleService'

export interface CreateOrderData {
  storeId: string
  channelId?: string
  channelName?: string
  shiftSessionId?: string
  dineInCount?: number
  staffId: string
  memberId?: string
  customerCount?: number
  orderNumber?: string       // 自定义订单号（若未传则由服务端生成安全的非线性流水号）
  pickupNumber?: string      // 取餐号/叫号凭据（如 A01 ~ A99 循环模式）
  // 渠道扩展信息
  platformOrderId?: string   // 平台订单号(GoFood/Grab/Shopee)
  tableNumber?: string       // 桌号(堂食)
  callerPhone?: string       // 来电号码(电话订餐)
  driverPickupTime?: Date    // 骑手取餐时间(外卖)
  purchaseOrderNo?: string   // 采购单号(企业订单)
  socialRef?: string         // 社交媒体消息ID(WhatsApp/社媒订单)
  note?: string              // 备注
  items: {
    productId: string
    productName: string
    specId: string
    specName: string
    quantity: number
    unitPrice: number
    addons?: { name: string; price: number; qty?:number }[]
  }[]
  activityOfflineToken?: string
  activityOccurredAt?: string
  activityChannelCode?: string
  activityQuoteSignature?: string
  activityCouponId?: string
  activityPointsRequested?: number
  activityGroupId?: string
  activityGiftSelections?: Record<string,string>
  discountAmount?: number
  pointsRedeemed?: number    // 积分抵扣金额
  taxEnabled?: boolean       // 是否计算税费（根据客户端配置）
  paymentMethod: string
  qrisExternalId?: string
  paymentEvidenceId?: string
  manualPaymentActorId?: string
  status?: string           // 订单状态: completed, suspended
}

export interface OrderRequestContext { actorId: string; storeId: string; allowCreate: boolean; validateActivityPricing?: boolean }

export interface OrderResult {
  replayed?: boolean
  replayedBy?: string
  id: string
  orderNumber: string
  pickupNumber?: string | null
  totalAmount: number
  ppnAmount: number
  grandTotal: number
  status: string
  paymentMethod: string
  items: any[]
  createdAt: Date
}

// Keep store/day counter for pickup queues; authoritative identities are globally random and DB-unique.
export async function generateOrderNumber(storeId: string, prefix: string = 'ORD', date:Date = new Date()): Promise<string> {
  const dateStr = formatDate(date).replace(/-/g, '') // YYYYMMDD
  const today = dateStr

  // Atomic upsert: create if not exists, increment if exists
  // This avoids race conditions between findUnique/create/update
  await prisma.orderCounter.upsert({
    where: {
      storeId_date: { storeId, date: today }
    },
    create: {
      storeId,
      date: today,
      counter: 1
    },
    update: {
      counter: { increment: 1 }
    }
  })

  return orderNumberCandidate(date,prefix)
}

// Calculate BOM cost for a product (recursive for semi_finished items)
export async function calculateBOMCost(productId: string): Promise<number> {
  const bomItems = await prisma.bOMItem.findMany({
    where: { productId },
    include: { inventory: true }
  })

  let totalCost = 0
  for (const item of bomItems) {
    totalCost += await inventoryQuantityCost(prisma, item.inventoryId, item.quantity, item.unit)
  }
  return Math.round(totalCost)
}

// 门店是否允许负库存销售（Config: inventory/allow_negative_stock，默认 true）
export async function isNegativeStockAllowed(storeId: string, database:any=prisma): Promise<boolean> {
  try {
    const cfg = await database.config.findFirst({
      where: { key: 'allow_negative_stock', storeId: { in: [storeId, ''] } },
      orderBy: { storeId: 'desc' } // 门店级优先于全局
    })
    if (!cfg) return true
    const v = JSON.parse(cfg.value)
    return v !== false && v !== 'false'
  } catch {
    return true
  }
}

// Deduct inventory result type
interface DeductResult {
  success: boolean
  error?: string
  insufficientStock?: { inventoryId: string; name: string; available: number; needed: number }
}

// Recursive deduct inventory - handles multi-level BOM
async function deductInventoryRecursive(
  tx: any,
  inventoryId: string,
  qty: number,
  orderId: string,
  depth: number = 0,
  allowNegative: boolean = false,
  storeId?: string
): Promise<DeductResult> {
  // Prevent infinite recursion
  if (depth > 10) {
    return { success: false, error: `Max recursion depth reached for inventory: ${inventoryId}` }
  }

  const inv = await tx.inventory.findUnique({
    where: { id: inventoryId }
  })

  if (!inv) {
    return { success: false, error: `Inventory not found: ${inventoryId}` }
  }

  if (storeId && inv.storeId !== storeId) throw new Error('INVENTORY_STORE_MISMATCH')

  // If raw_material, deduct directly (with stock check)
  if (inv.type === 'raw_material' || inv.type === 'finished_goods' || (inv.type === 'semi_finished' && !inv.processRecipeId)) {
    // 行业惯例（哗啦啦/客如云）：前台收银不能因账面库存滞后而拒单。
    // 开启负库存销售时允许扣成负数，事后由店长补录入库/盘点对冲。
    if (inv.currentStock < qty && !allowNegative) {
      return {
        success: false,
        insufficientStock: {
          inventoryId: inv.id,
          name: inv.name,
          available: inv.currentStock,
          needed: qty
        }
      }
    }
    await tx.inventory.update({
      where: { id: inventoryId },
      data: { currentStock: { decrement: qty } }
    })
    await tx.stockOutLog.create({
      data: {
        inventoryId,
        quantity: qty,
        reason: 'sold',
        note: JSON.stringify({version:1,ledgerUnit:inv.unit,ledgerQuantity:qty}),
        orderId
      }
    })
    return { success: true }
  }

  // If semi_finished, find the process recipe and recursively deduct inputs
  if (inv.type === 'semi_finished' && inv.processRecipeId) {
    const recipe = await tx.processRecipe.findUnique({
      where: { id: inv.processRecipeId },
      include: {
        items: { include: { inventory: true } }
      }
    })

    if (!recipe) {
      return { success: false, error: `Process recipe not found for semi_finished inventory: ${inventoryId} (${inv.name})` }
    }

    // Find output item to determine ratio
    const outputItem = recipe.items.find(i => i.type === 'output')
    if (!outputItem || outputItem.quantity === 0) {
      return { success: false, error: `No output item found in recipe: ${recipe.id}` }
    }

    if (recipe.storeId !== inv.storeId) throw new Error('INVENTORY_STORE_MISMATCH')
    const outputRatio = outputItem.quantity
    qty = convertQuantity(qty, inv.unit, recipe.outputUnit)

    // Recursively deduct each input in the recipe
    const inputs = recipe.items.filter(i => i.type === 'input')
    for (const input of inputs) {
      if (!input.inventoryId) continue
      // Calculate how much of this input is needed for the requested qty
      // If 1kg + 2600ml -> 2600ml output, and we need qty ml of output:
      // input_qty = (qty / outputRatio) * input.quantity
      const inputQty = (qty / outputRatio) * input.quantity
      const result = await deductInventoryRecursive(tx, input.inventoryId, inputQty, orderId, depth + 1, allowNegative, storeId)
      if (!result.success) return result
    }
    return { success: true }
  }

  throw new Error('INVENTORY_TYPE_UNSUPPORTED')
}

// Deduct inventory result
interface DeductInventoryResult {
  success: boolean
  errors: string[]
  lowStockWarnings?: Array<{
    inventoryId: string
    name: string
    currentStock: number
    safetyStock: number
  }>
}

// Deduct inventory based on BOM (with recursive support and transaction)
// Accepts optional tx parameter to reuse existing transaction (avoid nested transaction issue)
export async function deductInventory(storeId: string, orderId: string, items: any[], tx?: any, options?:{allowNegative?:boolean}): Promise<DeductInventoryResult> {
  const errors: string[] = []
  const lowStockWarnings: Array<{
    inventoryId: string
    name: string
    currentStock: number
    safetyStock: number
  }> = []

  // Collect all inventory IDs used in this order for post-check
  const usedInventoryIds = new Set<string>()

  // 读取门店"允许负库存销售"开关（默认开启，避免高峰期因账面库存滞后卡单）
  const allowNegative = options?.allowNegative ?? await isNegativeStockAllowed(storeId,tx||prisma)

  // Use provided transaction or create new one
  const doDeduct = async (transactionClient: any) => {
    for (const item of items) {
      const bomItems = await transactionClient.bOMItem.findMany({
        where: { productId: item.productId },
        include: { inventory: true }
      })

      for (const bom of bomItems) {
        usedInventoryIds.add(bom.inventoryId)
        const deductQty = convertQuantity(bom.quantity * item.quantity, bom.unit, bom.inventory.unit)
        const result = await deductInventoryRecursive(transactionClient, bom.inventoryId, deductQty, orderId, 0, allowNegative, storeId)
        if (!result.success) {
          if (result.insufficientStock) {
            const { name, available, needed } = result.insufficientStock
            errors.push(`INVENTORY_INSUFFICIENT:${name}:${available}:${needed}`)
          } else {
            errors.push(result.error || 'Unknown error')
          }
          if (result.insufficientStock) throw new OrderBusinessRejection('INVENTORY_INSUFFICIENT', errors.join('; '))
          throw new Error(errors.join('; '))
        }
      }
    }
  }

  if (tx) {
    await doDeduct(tx)
  } else {
    await prisma.$transaction(doDeduct)
  }

  // Post-order check: which used items are now below safetyStock
  if (errors.length === 0) {
    const usedInventories = await (tx||prisma).inventory.findMany({
      where: { id: { in: Array.from(usedInventoryIds) } }
    })
    for (const inv of usedInventories) {
      if ((inv.safetyStock > 0 && inv.currentStock <= inv.safetyStock) || inv.currentStock < 0) {
        lowStockWarnings.push({
          inventoryId: inv.id,
          name: inv.name,
          currentStock: inv.currentStock,
          safetyStock: inv.safetyStock
        })
      }
    }
  }

  return { success: errors.length === 0, errors, lowStockWarnings: lowStockWarnings.length > 0 ? lowStockWarnings : undefined }
}

// Update member points (using configured PointsRule)
export async function updateMemberPoints(memberId: string, amount: number, storeId: string) {
  // Get member and points rule
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { birthday: true, level: true }
  })

  const rule = await getOrCreatePointsRule(storeId)

  // Calculate points using PointsRuleService (applies birthday multiplier, tier multiplier, etc.)
  const pointsEarned = calculatePoints(amount, {
    rule: {
      pointsPerRupiah: rule.pointsPerRupiah,
      minPurchase: rule.minPurchase,
      birthdayMultiplier: rule.birthdayMultiplier,
      tierMultiplier: rule.tierMultiplier
    },
    member: {
      birthday: member?.birthday || null,
      level: member?.level || 'bronze'
    }
  })

  if (pointsEarned > 0) {
    await prisma.member.update({
      where: { id: memberId },
      data: {
        points: { increment: pointsEarned },
        totalSpent: { increment: amount },
        lastVisit: new Date()
      }
    })

    await prisma.pointLog.create({
      data: {
        memberId,
        type: 'earn',
        points: pointsEarned,
        note: 'Purchase reward'
      }
    })
  }

  return pointsEarned
}

// Get orders with filtering and pagination
export async function getOrders(params: {
  storeId?: string
  userId?: string
  userRole?: string
  status?: string
  paymentMethod?: string
  channelId?: string
  search?: string
  startDate?: string
  endDate?: string
  date?: string  // Single date for "show orders on this date"
  page?: number
  pageSize?: number
}) {
  const {
    storeId,
    userId,
    userRole,
    status,
    paymentMethod,
    channelId,
    search,
    startDate,
    endDate,
    page = 1,
    pageSize = 20
  } = params

  const where: any = {}

  // Access control
  if (storeId) {
    where.storeId = storeId
  } else if (userRole === 'staff' || userRole === 'cashier') {
    where.storeId = userId // In this case, userId is actually storeId for staff/cashier
  }

  if (status) where.status = status
  if (paymentMethod) where.paymentMethod = paymentMethod
  if (channelId) where.channelId = channelId

  if (search && search.trim()) {
    const s = search.trim()
    where.OR = [
      { orderNumber: containsText(s) },
      { pickupNumber: containsText(s) }
    ]
  }

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt.gte = new Date(startDate)
    if (endDate) where.createdAt.lte = new Date(endDate)
  } else if (params.startDate) {
    // 支持从指定时间查到现在（用于班次过滤）
    where.createdAt = { gte: new Date(params.startDate) }
  } else if (params.date) {
    // Support single date parameter for "show orders on this date"
    // Parse the date string and compute start/end in Asia/Jakarta timezone
    const dateStr = params.date
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(dateStr + 'T00:00:00'))
    const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '1')
    const year = getPart('year')
    const month = getPart('month') - 1
    const day = getPart('day')
    // startOfTodayJakarta gives us midnight WIB of the target date
    const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
    // Subtract 7 hours to get WIB midnight = UTC previous day 17:00
    startOfDay.setUTCHours(startOfDay.getUTCHours() - 7)
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1)
    where.createdAt = {
      gte: startOfDay,
      lte: endOfDay
    }
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: true,
        channel: { select: { id: true, name: true, code: true, icon: true } },
        member: { select: { id: true, name: true, phone: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.order.count({ where })
  ])

  return {
    list: orders.map(publicOrder),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  }
}

// Get single order by ID
export async function getOrderById(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      member: true,
      store: true
    }
  })
  return order ? publicOrder(order) : null
}

// Get channel-specific price for a product
async function getChannelPrice(channelId: string, productId: string, defaultPrice: number): Promise<number> {
  if (!channelId) return defaultPrice

  try {
    const channelPrice = await prisma.productChannelPrice.findUnique({
      where: {
        productId_channelId: {
          productId,
          channelId
        }
      }
    })

    // If channel price exists and is enabled, apply it
    if (channelPrice && channelPrice.enabled) {
      // priceAdjustment is a multiplier, e.g., 1.13 means +13%
      return Math.round(defaultPrice * channelPrice.priceAdjustment)
    }
  } catch (e) {
    // If lookup fails, fall back to default price
    console.error('Error looking up channel price:', e)
  }

  return defaultPrice
}

export async function findOrderReplay(data: CreateOrderData, context?: OrderRequestContext): Promise<OrderResult | null> {
  if (context && (!context.actorId || context.storeId !== data.storeId)) throw new Error('ORDER_REPLAY_STORE_MISMATCH')
  const receipt = await replayReceipt(data)
  return receipt ? {...receipt,replayed:true,replayedBy:context?.actorId} : null
}

// Create new order
export async function createOrder(data: CreateOrderData, context?: OrderRequestContext): Promise<OrderResult> {
  const replay = await findOrderReplay(data, context)
  if (replay) return replay
  if (context && !context.allowCreate) throw new Error('OPEN_SHIFT_REQUIRED')
  const fingerprint = orderRequestFingerprint(data)
  const paymentActorId = context?.actorId || data.manualPaymentActorId
  // References from a client/offline queue must belong to the sale's store.
  const productIds = [...new Set(data.items.map(item => item.productId))]
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId: data.storeId }, select: { id: true }
  })
  if (products.length !== productIds.length) throw new Error('PRODUCT_STORE_MISMATCH')
  if (data.memberId) {
    const member = await prisma.member.findUnique({ where: { id: data.memberId }, select: { storeId: true } })
    if (!member || member.storeId !== data.storeId) throw new Error('MEMBER_STORE_MISMATCH')
  }

  // Get channel info for pricing lookup with smart code resolution and foreign key protection
  let channel: any = null
  if (data.channelId) {
    try {
      // 1. 优先按 ID 精确查询
      channel = await prisma.channel.findUnique({ where: { id: data.channelId } })
      // 2. 若未查到，尝试按 storeId + code 查询
      if (!channel) {
        const codeUpper = data.channelId.toUpperCase()
        channel = await prisma.channel.findFirst({
          where: {
            storeId: data.storeId,
            code: codeUpper
          }
        })
      }
      // 3. 常见别名映射 (如 'dine_in' -> 'DINE_IN', 'counter' -> 'POS')
      if (!channel) {
        const aliasMap: Record<string, string> = {
          'DINE_IN': 'DINE_IN',
          'DINEIN': 'DINE_IN',
          'TAKEAWAY': 'DINE_IN',
          'COUNTER': 'POS',
          'POS': 'POS',
          'GOFOOD': 'GOFOOD',
          'GRAB': 'GRAB',
          'GRABFOOD': 'GRAB',
          'SHOPEE': 'SHOPEE',
          'SHOPEEFOOD': 'SHOPEE'
        }
        const cleaned = data.channelId.toUpperCase().replace(/[^A-Z0-9]/g, '')
        const mappedCode = aliasMap[cleaned] || aliasMap[data.channelId.toUpperCase()]
        if (mappedCode) {
          channel = await prisma.channel.findFirst({
            where: {
              storeId: data.storeId,
              code: mappedCode
            }
          })
        }
      }
    } catch (chErr) {
      console.warn('[OrderService] Channel lookup error:', chErr)
    }
  }
  // 若未指定渠道或未匹配到，尝试查找该门店默认渠道（优先堂食 DINE_IN，兼容 POS 兜底）
  if (!channel) {
    try {
      channel = await prisma.channel.findFirst({
        where: {
          storeId: data.storeId,
          code: 'DINE_IN'
        }
      })
      if (!channel) {
        channel = await prisma.channel.findFirst({
          where: {
            storeId: data.storeId,
            code: 'POS'
          }
        })
      }
    } catch {}
  }

  if (channel && channel.storeId !== data.storeId) throw new Error('CHANNEL_STORE_MISMATCH')

  let unifiedQuote: Awaited<ReturnType<typeof quoteActivities>> & {offline?:boolean} | undefined
  if(data.activityOfflineToken){
    await ensureMigrated(data.storeId)
    unifiedQuote=await quoteOfflineActivity(data.storeId,{items:data.items,channelId:channel?.id,channel:data.activityChannelCode,paymentMethod:data.paymentMethod,taxEnabled:data.taxEnabled},data.activityOfflineToken,data.activityOccurredAt||'')
    if(unifiedQuote.discount!==(data.discountAmount||0)||data.memberId||(data.pointsRedeemed||0)>0)throw Error('ACTIVITY_OFFLINE_PRICE_CHANGED')
  }
  if (data.activityQuoteSignature) {
    await ensureMigrated(data.storeId)
    unifiedQuote = await quoteActivities(data.storeId, {items:data.items,channelId:channel?.id,paymentMethod:data.paymentMethod,memberId:data.memberId,couponId:data.activityCouponId,pointsRequested:data.activityPointsRequested ?? data.pointsRedeemed,groupId:data.activityGroupId,giftSelections:data.activityGiftSelections,taxEnabled:data.taxEnabled})
    if (unifiedQuote.signature !== data.activityQuoteSignature || unifiedQuote.pendingSelections.length || unifiedQuote.discount !== (data.discountAmount||0)+(unifiedQuote.pointsRedeemed ? Math.floor(unifiedQuote.pointsRedeemed/100) : 0) || unifiedQuote.pointsRedeemed !== (data.pointsRedeemed||0)) throw Error('ACTIVITY_PRICE_CHANGED: Refresh and confirm the new total before taking payment')
  }
  if(!unifiedQuote&&context?.validateActivityPricing&&data.status!=='suspended'){
    await ensureMigrated(data.storeId)
    const inferred=await quoteActivities(data.storeId,{items:data.items,channelId:channel?.id,paymentMethod:data.paymentMethod,memberId:data.memberId,pointsRequested:data.pointsRedeemed,taxEnabled:data.taxEnabled})
    const submitted=data.items.reduce((sum,i)=>sum+i.quantity*(i.unitPrice+(i.addons||[]).reduce((amount:any,a:any)=>amount+a.price*(a.qty||1),0)),0)-(data.discountAmount||0)-Math.floor((data.pointsRedeemed||0)/100)
    if(inferred.pendingSelections.length||submitted!==inferred.finalAmount||inferred.discount!==(data.discountAmount||0)+Math.floor((data.pointsRedeemed||0)/100)||inferred.pointsRedeemed!==(data.pointsRedeemed||0)||data.items.some((i,index)=>i.unitPrice!==inferred.items[index].unitPrice))throw Error('ACTIVITY_PRICE_CHANGED: Refresh and confirm the new total before taking payment')
    unifiedQuote=inferred
  }
  const activityRules = !unifiedQuote && context?.validateActivityPricing ? await getActivityPriceRules(data.storeId) : []
  // Calculate totals with channel-specific pricing
  let totalAmount = 0
  const itemsWithPrices = await Promise.all(
    data.items.map(async (item, index) => {
      // Get channel-specific price if available
      let channelPrice = channel
        ? await getChannelPrice(channel.id, item.productId, item.unitPrice)
        : item.unitPrice

      const offerPrice = activityPrice(activityRules,item.productId,Number.MAX_SAFE_INTEGER,channel?.code || data.channelName || 'DINE_IN')
      if (offerPrice !== Number.MAX_SAFE_INTEGER) {
        const spec = await prisma.spec.findFirst({where:{id:item.specId,productId:item.productId}})
        if (!spec) throw new Error('ACTIVITY_SPEC_NOT_FOUND')
        const expected = Math.min(spec.price,offerPrice)
        if (item.unitPrice !== expected) throw new Error('ACTIVITY_PRICE_CHANGED: Refresh the cart before taking payment')
        channelPrice = expected
      }
      if (unifiedQuote) channelPrice = unifiedQuote.items[index].unitPrice
      totalAmount += channelPrice * item.quantity
      return {
        ...item,
        channelPrice // Store the channel price used
      }
    })
  )

  if (unifiedQuote) totalAmount = unifiedQuote.subtotal

  // 统一计算订单金额（服务端作为权威数据源）
  // 积分抵扣必须绑定会员且不超过会员真实余额（防止积分被无限重复抵扣）
  let effectivePointsRedeemed = 0
  if (data.memberId && (data.pointsRedeemed || 0) > 0) {
    const redeemMember = await prisma.member.findUnique({
      where: { id: data.memberId },
      select: { points: true }
    })
    effectivePointsRedeemed = Math.min(data.pointsRedeemed || 0, Math.max(0, redeemMember?.points || 0))
  }
  // Points discount: 100 points = 1 IDR (same as client calculation)
  const pointsDiscount = Math.floor(effectivePointsRedeemed / 100)
  const finalAmount = totalAmount - (data.discountAmount || 0) - pointsDiscount
  if (finalAmount < 0) throw new Error('DISCOUNT_EXCEEDS_TOTAL')

  // Add PPN (Indonesian tax 11%) - only if taxEnabled is not explicitly false
  const ppnAmount = data.taxEnabled !== false ? Math.round(finalAmount * config.indonesia.ppnRate) : 0
  const grandTotal = Math.max(0, finalAmount + ppnAmount)

  let confirmedQris: { id: string; orderId: string | null } | null = null
  // A missing provider reference is the existing manually confirmed static-QR path.
  // Only an explicit provider reference asserts provider verification.
  if (data.paymentMethod === 'qris' && data.status !== 'suspended' && data.qrisExternalId !== undefined) {
    if (!data.qrisExternalId?.startsWith('QRIS2-')) throw new Error('QRIS_PAYMENT_REFERENCE_REQUIRED')
    const payment = await prisma.qrisPayment.findUnique({ where: { externalId: data.qrisExternalId } })
    if (!payment || payment.status !== 'completed') throw new Error('QRIS_PAYMENT_NOT_CONFIRMED')
    if (payment.storeId !== data.storeId || payment.amount !== grandTotal) throw new Error('QRIS_PAYMENT_MISMATCH')
    confirmedQris = payment
  }

  // Calculate BOM cost for each item
  const itemsWithCost = await Promise.all(
    itemsWithPrices.map(async (item) => ({
      ...item,
      unitPrice: item.channelPrice, // Use channel price for the order
      addons: JSON.stringify(item.addons || []),
      bomCost: await calculateBOMCost(item.productId)
    }))
  )

  // Manual evidence is a staff confirmation, not proof of provider settlement.
  let manualProofOrderId: string | null = null
  if (data.paymentEvidenceId) {
    if (data.paymentMethod !== 'qris' || data.qrisExternalId || data.status === 'suspended' || !paymentActorId) throw new Error('INVALID_PAYMENT_EVIDENCE')
    const proof = await prisma.paymentEvidence.findUnique({ where: { id: data.paymentEvidenceId }, select: { storeId: true, amount: true, uploadedBy: true, orderId: true } })
    if (!proof || proof.storeId !== data.storeId || proof.amount !== grandTotal) throw new Error('PAYMENT_EVIDENCE_MISMATCH')
    if (proof.uploadedBy !== paymentActorId) throw new Error('PAYMENT_EVIDENCE_ORIGINAL_OPERATOR_REQUIRED')
    manualProofOrderId = proof.orderId
  }

  if (manualProofOrderId) throw new Error('PAYMENT_EVIDENCE_ALREADY_USED')

  // Calculate member points BEFORE transaction (needs member info + points rule)
  let calculatedPoints = 0
  if (data.memberId) {
    const member = await prisma.member.findUnique({
      where: { id: data.memberId },
      select: { birthday: true, level: true }
    })
    const rule = await getOrCreatePointsRule(data.storeId)
    calculatedPoints = calculatePoints(grandTotal, {
      rule: {
        pointsPerRupiah: rule.pointsPerRupiah,
        minPurchase: rule.minPurchase,
        birthdayMultiplier: rule.birthdayMultiplier,
        tierMultiplier: rule.tierMultiplier
      },
      member: {
        birthday: member?.birthday || null,
        level: member?.level || 'bronze'
      }
    })
  }

  // Generate order number BEFORE transaction (upsert uses its own transaction, must not be nested)
  let orderNumber = data.orderNumber
  let pickupNumber = data.pickupNumber

  // 如果客户端传入的是短取餐号（如 A01, A037），将其分离并作为 pickupNumber，生成权威安全 orderNumber
  const isShortPickupNum = orderNumber && /^[A-Z]\d{2,4}$/i.test(orderNumber)
  if (isShortPickupNum) {
    if (!pickupNumber) pickupNumber = orderNumber
    orderNumber = undefined
  }

  const generatedOrderNumber = !orderNumber
  // 确保系统订单号为安全非线性流水号
  if (!orderNumber) {
    orderNumber = await generateOrderNumber(data.storeId)
  }

  // 若未指定取餐号，根据渠道和当天的订单计数生成 A01 ~ A99 循环取餐号
  if (!pickupNumber) {
    let prefix = 'A'
    if (channel?.code === 'GOFOOD') prefix = 'G'
    else if (channel?.code === 'GRAB') prefix = 'B'
    else if (channel?.code === 'SHOPEE') prefix = 'S'
    else if (channel?.code === 'TAKEAWAY') prefix = 'T'

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const counter = await prisma.orderCounter.findUnique({
      where: { storeId_date: { storeId: data.storeId, date: today } }
    })
    const cycleSeq = (((counter?.counter || 1) - 1) % 99) + 1
    pickupNumber = `${prefix}${cycleSeq.toString().padStart(2, '0')}`
  }

  // Create order with transaction
  let created = false
  const persistOrder = () => prisma.$transaction(async (tx) => {
    if (unifiedQuote && !unifiedQuote.offline) {
      if(data.memberId) await tx.member.updateMany({where:{id:data.memberId,storeId:data.storeId},data:{points:{increment:0}}})
      const fresh = await quoteActivities(data.storeId,{items:data.items,channelId:channel?.id,paymentMethod:data.paymentMethod,memberId:data.memberId,couponId:data.activityCouponId,pointsRequested:data.activityPointsRequested ?? data.pointsRedeemed,groupId:data.activityGroupId,giftSelections:data.activityGiftSelections,taxEnabled:data.taxEnabled},tx)
      if(fresh.signature !== unifiedQuote.signature || fresh.pendingSelections.length) throw Error('ACTIVITY_PRICE_CHANGED')
      unifiedQuote=fresh
    }
    // Use pre-generated order number

    const newOrder = await tx.order.create({
      data: {
        storeId: data.storeId,
        channelId: channel ? channel.id : null,
        staffId: data.staffId,
        memberId: data.memberId,
        customerCount: data.customerCount || 1,
        orderNumber,
        requestFingerprint: fingerprint,
        checkoutTaxAmount: ppnAmount,
        pickupNumber,
        totalAmount,  // 服务端计算的订单总额（含渠道调价）
        discountAmount: data.discountAmount || 0,
        finalAmount: grandTotal,
        status: data.status || 'completed',
        paymentMethod: data.paymentMethod,
        // 渠道扩展信息
        platformOrderId: data.platformOrderId,
        tableNumber: data.tableNumber,
        callerPhone: data.callerPhone,
        driverPickupTime: data.driverPickupTime,
        purchaseOrderNo: data.purchaseOrderNo,
        socialRef: data.socialRef,
        note: data.note,
        items: {
          create: itemsWithCost.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            specId: item.specId,
            specName: item.specName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            addons: item.addons,
            bomCost: item.bomCost
          }))
        }
      },
      include: { items: true }
    })

    if (data.paymentEvidenceId) {
      const claimed = await tx.paymentEvidence.updateMany({
        where: { id: data.paymentEvidenceId, storeId: data.storeId, amount: grandTotal, uploadedBy: paymentActorId, orderId: null, confirmedAt: null, verification: 'unverified' },
        data: { orderId: newOrder.id, confirmedBy: paymentActorId, confirmedAt: new Date(), verification: 'staff_confirmed' }
      })
      if (claimed.count !== 1) throw new Error('PAYMENT_EVIDENCE_ALREADY_USED')
    }
    if (confirmedQris) {
      const claimed = await tx.qrisPayment.updateMany({
        where: { id: confirmedQris.id, storeId: data.storeId, status: 'completed', orderId: null },
        data: { orderId: newOrder.id }
      })
      if (claimed.count !== 1) throw new Error('QRIS_PAYMENT_ALREADY_LINKED')
    }

    // Deduct inventory and get low stock warnings (skip for suspended orders)
    const inventoryResult = data.status === 'suspended'
      ? { success: true, errors: [], lowStockWarnings: [] }
      : await deductInventory(data.storeId, newOrder.id, data.items, tx)

    // 扣减积分抵扣（条件更新防并发重复使用；挂单不扣，恢复挂单时会重新下单）
    if (data.memberId && effectivePointsRedeemed > 0 && data.status !== 'suspended') {
      const redeemed = await tx.member.updateMany({
        where: { id: data.memberId, points: { gte: effectivePointsRedeemed } },
        data: { points: { decrement: effectivePointsRedeemed } }
      })
      if (redeemed.count === 0) {
        throw new Error('INSUFFICIENT_POINTS')
      }
      await tx.pointLog.create({
        data: {
          memberId: data.memberId,
          type: 'redeem',
          points: -effectivePointsRedeemed,
          orderId: newOrder.id,
          note: `Order redeem #${newOrder.orderNumber}`
        }
      })
    }

    // Update member points (skip for suspended orders)
    if (data.memberId && data.status !== 'suspended') {
      await tx.member.update({
        where: { id: data.memberId },
        data: {
          points: { increment: calculatedPoints },
          totalSpent: { increment: grandTotal },
          lastVisit: new Date()
        }
      })
      if (calculatedPoints > 0) await tx.pointLog.create({
        data: {
          memberId: data.memberId,
          type: 'earn',
          points: calculatedPoints,
          orderId: newOrder.id,
          note: 'Purchase reward'
        }
      })
    }

    // 自动创建现金销售事件（仅完成的现金支付，跳过挂单）- 移入transaction保证一致性
    if (data.paymentMethod === 'cash' && data.status !== 'suspended') {
      const saleSessions = await tx.shiftSession.findMany({where:{storeId:data.storeId,...(data.shiftSessionId ? {id:data.shiftSessionId} : {status:'open'})},select:{shift:true},take:2})
      const cashShift = saleSessions.length === 1 ? saleSessions[0].shift : null
      await tx.cashEvent.create({
        data: {
          storeId: data.storeId,
          staffId: data.staffId,
          type: 'cash_sale',
          shift: cashShift,
          amount: grandTotal,
          paymentMethod: 'cash',
          orderId: newOrder.orderNumber,
          note: `订单 #${newOrder.orderNumber}`
        }
      })
    }

    const activityEntitlements = unifiedQuote ? await enqueueActivityGrants(tx,newOrder,unifiedQuote,calculatedPoints) : []
    const response = { ...publicOrder(newOrder), lowStockWarnings: inventoryResult.lowStockWarnings, ppnAmount, grandTotal, activityEntitlements }
    await tx.order.update({ where: { id: newOrder.id }, data: {
      requestFingerprint: orderRequestFingerprint(data), requestReceipt: encodeOrderReceipt(data, response)
    } })
    created = true
    return response
  }).catch(async error => {
    created = false
    if (['P2002', 'P2034', 'P2028'].includes(error?.code)) {
      const winner = await findOrderReplay(data)
      if (winner) return winner
    }
    // Certify only after transaction rejection AND an independent read proves no order exists.
    if (error instanceof OrderBusinessRejection && orderNumber) {
      try { error.rolledBack = !(await prisma.order.findUnique({where:{orderNumber},select:{id:true}})) } catch { error.rolledBack = false }
    }
    throw error
  })


  let order:Awaited<ReturnType<typeof persistOrder>>
  for(let attempt=0;;attempt++){
    try{order=await persistOrder();break}
    catch(error){
      if(!isOrderNumberCollision(error))throw error
      if(!generatedOrderNumber){const replay=await findOrderReplay(data,context);if(replay)return replay;throw error}
      if(attempt>=4)throw new Error('ORDER_NUMBER_ALLOCATION_RETRY_EXHAUSTED')
      orderNumber=orderNumberCandidate()
    }
  }

  // Process referral rewards AFTER transaction (skip for suspended orders)
  if (created && data.memberId && data.status !== 'suspended' && !unifiedQuote?.entitlements.some(p=>p.activity.type==='referral')) {
    processOrderReferralRewards(order.id).catch(err => {
      console.error('Failed to process referral rewards:', err)
    })
  }

  if(created && unifiedQuote) void runActivityJobs().catch(console.error)
  return order
}

// Update order status
export async function updateOrderStatus(orderId: string, status: string) {
  const previous = allowedPreviousOrderStatuses(status)
  return prisma.$transaction(async tx => {
    const updated = await tx.order.updateMany({ where: { id: orderId, status: { in: [...previous] } }, data: { status } })
    if (updated.count !== 1) throw new Error('ORDER_STATUS_TRANSITION_CONFLICT')
    return tx.order.findUniqueOrThrow({ where: { id: orderId } })
  })
}

// Refund order (idempotent, transactional, full rollback of points / coupons / cash)
export async function refundOrder(orderId: string, reason?: string, operatorStaffId?: string, refundAmount?: number, approval?: { requestId: string; approvedBy: string; note?: string; restoreUnprepared?: boolean }) {
  const note = `Refund: ${reason || 'No reason provided'}`

  const order = await prisma.$transaction(async (tx) => {
    // Idempotency guard: only flip status once (atomic conditional update)
    const flipped = await tx.order.updateMany({
      where: { id: orderId, status: { notIn: ['refunded', 'cancelled'] } },
      data: { status: 'refunded' }
    })
    if (flipped.count === 0) {
      const exists = await tx.order.findUnique({ where: { id: orderId }, select: { id: true } })
      if (!exists) throw new Error('Order not found')
      throw new Error('ORDER_ALREADY_REFUNDED')
    }

    const o = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true }
    })

    if (await tx.config.findUnique({ where: { storeId_key: { storeId: o.storeId, key: replicaKey(o.id) } } })) throw new Error('REPLICA_FINANCIAL_ACTION_LOCAL_ONLY')

    const earlier=await tx.refundRequest.findFirst({where:{orderId:o.id,status:{in:['approved','paid']}}})
    if(earlier)throw new Error('REFUND_REMAINING_ITEMS_REQUIRED')

    if (refundAmount !== undefined && (!Number.isSafeInteger(refundAmount) || refundAmount <= 0 || refundAmount > o.finalAmount)) {
      throw new Error('INVALID_REFUND_AMOUNT')
    }

    if (approval?.restoreUnprepared) {
      const request = await tx.refundRequest.findUnique({ where: { id: approval.requestId } })
      if (!request || request.orderId !== o.id || request.reasonCode !== 'paid_unprepared' || request.status !== 'pending') throw new Error('INVALID_UNPREPARED_APPROVAL')
      // Reverse original quantities, including exploded subrecipes; never recalculate today's BOM.
      const deductions = await tx.stockOutLog.findMany({ where: { orderId: o.id, reason: 'sold' }, include: { inventory: true } })
      if (!deductions.length) throw new Error('REFUND_STOCK_EVIDENCE_REQUIRED')
      for (const log of deductions) {
        if (log.inventory.storeId !== o.storeId || !Number.isFinite(log.quantity) || log.quantity <= 0) throw new Error('INVALID_ORIGINAL_STOCK_LEDGER')
        let snapshot: any
        try { snapshot = JSON.parse(log.note || '') } catch { throw new Error('REFUND_STOCK_EVIDENCE_REQUIRED') }
        if (snapshot.version !== 1 || snapshot.ledgerQuantity !== log.quantity || snapshot.ledgerUnit !== log.inventory.unit) throw new Error('REFUND_STOCK_EVIDENCE_REQUIRED')
        await tx.inventory.update({ where: { id: log.inventoryId }, data: { currentStock: { increment: log.quantity } } })
        // Signed stock-out reversal leaves average carrying cost unchanged; no invented purchase.
        await tx.stockOutLog.create({ data: { inventoryId: log.inventoryId, orderId: o.id, quantity: -log.quantity, reason: 'refund_unprepared', note: `Reverse ${log.id}; approved ${approval.requestId} by ${approval.approvedBy}` } })
      }
    }

    // 1. Member points & spend rollback (based on actual point logs of this order)
    if (o.memberId) {
      const logs = await tx.pointLog.findMany({
        where: { memberId: o.memberId, orderId: o.id, type: { in: ['earn', 'redeem'] } }
      })
      const earned = logs.filter(l => l.type === 'earn').reduce((s, l) => s + Math.max(0, l.points), 0)
      const redeemed = logs.filter(l => l.type === 'redeem').reduce((s, l) => s + Math.abs(l.points), 0)

      let applied = false
      for (let attempt = 0; attempt < 5; attempt++) {
        const member = await tx.member.findUnique({ where: { id: o.memberId } })
        if (!member) { applied = true; break }
        const deductEarned = Math.min(earned, member.points + redeemed)
        const netChange = redeemed - deductEarned
        const updated = await tx.member.updateMany({
          where: { id: o.memberId, points: member.points, totalSpent: member.totalSpent },
          data: { points: { increment: netChange }, totalSpent: { decrement: Math.min(o.finalAmount, member.totalSpent) } }
        })
        if (updated.count !== 1) continue // Concurrent redemption/refund changed the snapshot; read it again.
        if (deductEarned > 0) {
          await tx.pointLog.create({
            data: { memberId: o.memberId, type: 'adjust', points: -deductEarned, orderId: o.id, note: `${note} (reverse earned)` }
          })
        }
        if (redeemed > 0) {
          await tx.pointLog.create({
            data: { memberId: o.memberId, type: 'adjust', points: redeemed, orderId: o.id, note: `${note} (return redeemed)` }
          })
        }
        applied = true
        break
      }
      if (!applied) throw new Error('REFUND_MEMBER_CONFLICT') // Entire refund rolls back; caller may retry.
    }

    // 2. Restore coupons used on this order (POS stores orderNumber, others may store id)
    await tx.memberCoupon.updateMany({
      where: { orderId: { in: [o.id, o.orderNumber] }, status: 'used' },
      data: { status: 'unused', usedAt: null }
    })

    // 3. Cash refund → cash_out so drawer reconciliation stays accurate
    const cashRefund = refundAmount && refundAmount > 0 ? Math.min(refundAmount, o.finalAmount) : o.finalAmount
    if (o.paymentMethod === 'cash' && cashRefund > 0) {
      await tx.cashEvent.create({
        data: {
          storeId: o.storeId,
          staffId: operatorStaffId || o.staffId,
          type: 'cash_out',
          amount: cashRefund,
          paymentMethod: 'cash',
          orderId: o.orderNumber,
          note: `Refund #${o.orderNumber}${reason ? ` - ${reason}` : ''}`
        }
      })
    }

    if (approval) {
      const approved = await tx.refundRequest.updateMany({
        where: { id: approval.requestId, orderId, status: 'pending' },
        data: { status: 'approved', amount: refundAmount ?? o.finalAmount, approvedBy: approval.approvedBy, approvedAt: new Date(), note: approval.note }
      })
      if (approved.count !== 1) throw new Error('REFUND_REQUEST_ALREADY_PROCESSED')
    }
    await reverseActivityGrants(tx,o.storeId,o.id,0)
    // Prepared refunds never restore ingredients. Unprepared reversals above share this transaction.
    return o
  })

  return order
}

// Create refund request (from POS)
export async function createRefundRequest(params: {
  requestId?: string
  orderId: string
  reason: string
  requestedBy: string
  reasonCode?: string
  selectedItemIds?: string[]
}) {
  return prisma.$transaction(async tx=>{
  await tx.order.updateMany({where:{id:params.orderId},data:{updatedAt:new Date()}})
  if(params.requestId){
    if(!/^[A-Za-z0-9-]{16,100}$/.test(params.requestId))throw Error('REFUND_REQUEST_ID_REQUIRED')
    const prior=await tx.refundRequest.findUnique({where:{id:params.requestId}})
    if(prior){if(prior.orderId!==params.orderId||prior.reason!==params.reason||prior.reasonCode!==params.reasonCode||prior.requestedBy!==params.requestedBy||prior.selectedItemIds!==JSON.stringify(params.selectedItemIds))throw Error('REFUND_IDEMPOTENCY_CONFLICT');return prior}
  }
  const order = await tx.order.findUnique({
    where: { id: params.orderId }, include: { items: true }
  })

  if (!order) {
    throw new Error('Order not found')
  }

  if (!['customer_dissatisfied', 'paid_unprepared'].includes(params.reasonCode || '')) throw new Error('REFUND_CLASSIFICATION_REQUIRED')
  const selectedItemIds = validateRefundItems(order.items.map(item => item.id), params.selectedItemIds)

  if (order.status !== 'completed') {
    throw new Error('Only completed orders can be refunded')
  }

  // Check for existing pending refund request
  const existingRequest = await tx.refundRequest.findFirst({
    where: {
      orderId: params.orderId,
      status: 'pending'
    }
  })
  if (existingRequest) {
    throw new Error('A pending refund request already exists for this order')
  }

  // Validate total refunded amount won't exceed order total
  const approvedRefunds = await tx.refundRequest.findMany({
    where: {
      orderId: params.orderId,
      status: { in: ['approved', 'paid'] }
    }
  })
  const totalAlreadyRefunded = approvedRefunds.reduce((sum, r) => sum + (r.amount || 0), 0)
  // Default amount=0 means full refund, so check if order is already fully refunded
  if (approvedRefunds.length > 0 || totalAlreadyRefunded >= order.finalAmount) {
    throw new Error('Order has already been fully refunded')
  }

  // Create refund request
  const refundRequest = await tx.refundRequest.create({
    data: {
      id:params.requestId,
      orderId: params.orderId,
      reason: params.reason,
      reasonCode: params.reasonCode,
      selectedItemIds: JSON.stringify(selectedItemIds),
      requestedBy: params.requestedBy,
      amount: order.finalAmount,
      status: 'pending'
    }
  })

  return refundRequest
  })
}

// Return inventory result type
interface ReturnResult {
  success: boolean
  error?: string
}

// Recursive return inventory - handles multi-level BOM for refunds
async function returnInventoryRecursive(
  tx: any,
  inventoryId: string,
  qty: number,
  orderId: string,
  depth: number = 0
): Promise<ReturnResult> {
  // Prevent infinite recursion
  if (depth > 10) {
    return { success: false, error: `Max recursion depth reached for inventory return: ${inventoryId}` }
  }

  const inv = await tx.inventory.findUnique({
    where: { id: inventoryId }
  })

  if (!inv) {
    return { success: false, error: `Inventory not found for return: ${inventoryId}` }
  }

  // If raw_material, return directly to stock
  if (inv.type === 'raw_material') {
    await tx.inventory.update({
      where: { id: inventoryId },
      data: { currentStock: { increment: qty } }
    })
    await tx.stockInLog.create({
      data: {
        inventoryId,
        quantity: qty,
        unitCost: Number(inv.avgCost),
        totalAmount: Math.round(qty * Number(inv.avgCost)),
        note: `Refund: Return ${inv.name}`
      }
    })
    return { success: true }
  }

  // If semi_finished, find the process recipe and recursively return inputs
  if (inv.type === 'semi_finished' && inv.processRecipeId) {
    const recipe = await tx.processRecipe.findUnique({
      where: { id: inv.processRecipeId },
      include: {
        items: { include: { inventory: true } }
      }
    })

    if (!recipe) {
      return { success: false, error: `Process recipe not found for semi_finished return: ${inventoryId}` }
    }

    // Find output item to determine ratio
    const outputItem = recipe.items.find(i => i.type === 'output')
    if (!outputItem || outputItem.quantity === 0) {
      return { success: false, error: `No output item found in recipe: ${recipe.id}` }
    }

    const outputRatio = outputItem.quantity

    // Recursively return each input in the recipe
    const inputs = recipe.items.filter(i => i.type === 'input')
    for (const input of inputs) {
      if (!input.inventoryId) continue
      const inputQty = (qty / outputRatio) * input.quantity
      const result = await returnInventoryRecursive(tx, input.inventoryId, inputQty, orderId, depth + 1)
      if (!result.success) return result
    }
    return { success: true }
  }

  // finished_goods - return directly
  await tx.inventory.update({
    where: { id: inventoryId },
    data: { currentStock: { increment: qty } }
  })
  await tx.stockInLog.create({
    data: {
      inventoryId,
      quantity: qty,
      unitCost: Number(inv.avgCost),
      totalAmount: Math.round(qty * Number(inv.avgCost)),
      note: `Refund: Return ${inv.name}`
    }
  })
  return { success: true }
}

// Return inventory to stock (for refunds) - with transaction
export async function returnInventory(orderId: string, items: any[], transaction?: Prisma.TransactionClient) {
  const errors: string[] = []

  const restore = async (tx: Prisma.TransactionClient) => {
    for (const item of items) {
      const bomItems = await tx.bOMItem.findMany({
        where: { productId: item.productId },
        include: { inventory: true }
      })

      for (const bom of bomItems) {
        const returnQty = bom.quantity * item.quantity
        const result = await returnInventoryRecursive(tx, bom.inventoryId, returnQty, orderId)
        if (!result.success) {
          errors.push(result.error || 'Unknown error')
          throw new Error(errors.join('; '))
        }
      }
    }
  }
  if (transaction) await restore(transaction)
  else await prisma.$transaction(restore)

  return { success: errors.length === 0, errors }
}

// Get orders for KDS (Kitchen Display System)
export async function getKDSOrders(storeId: string, options?: {
  status?: string
  limit?: number
}) {
  const where: any = { storeId }

  // KDS shows orders that are not yet completed/refunded
  if (options?.status) {
    where.status = options.status
  } else {
    where.status = { in: ['pending', 'preparing', 'ready'] }
  }

  return prisma.order.findMany({
    where,
    include: {
      items: true
    },
    orderBy: { createdAt: 'asc' },
    take: options?.limit || 50
  })
}

/**
 * Bulk create orders for POS offline sync.
 * Processes multiple orders, returning individual success/failure results for each order.
 */
export async function bulkCreateOrders(ordersData: CreateOrderData[], context?: OrderRequestContext, creationAllowed?: readonly boolean[]): Promise<Array<{ index: number; localId?: string; success: boolean; data?: any; error?: string }>> {
  const results: Array<{ index: number; localId?: string; success: boolean; data?: any; error?: string }> = []

  for (let i = 0; i < ordersData.length; i++) {
    const orderData = ordersData[i]
    try {
      const order = await createOrder(orderData, context ? { ...context, allowCreate: creationAllowed?.[i] === true } : undefined)
      results.push({
        index: i,
        localId: orderData.orderNumber,
        success: true,
        data: order
      })
    } catch (err: any) {
      results.push({
        index: i,
        localId: orderData.orderNumber,
        success: false,
        error: err?.message || 'Failed to create order'
      })
    }
  }

  return results
}