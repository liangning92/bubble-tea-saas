export interface CartItemAddon {
  id?: string
  name: string
  price: number
  qty?: number
}

export interface CartItemLike {
  id: string
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  addons?: CartItemAddon[]
}

export interface DiscountRuleLike {
  id: string
  name: string
  minOrderAmount: number
  discountValue: number
  discountType: string // 'fixed' | 'percent' | 'second_half' | 'bogo'
  maxDiscount?: number | null
  applicableChannels?: string[] | null
  validFrom?: string | null
  validUntil?: string | null
  priority?: number
  status?: string
}

export interface AppliedPromotion {
  id: string
  name: string
  type: string
  amount: number
  description: string
  pairsCount?: number
}

/**
 * 营销促销计算引擎
 * 支持：第二杯半价 (second_half)、买一送一 (bogo)、满折 (percent)、满减 (fixed)
 * 核心特性：
 * 1. 利润保护：第二杯半价/买一送一仅按单品基础价计算，小料（addons）不打折，并按单杯单价由高到低配对，对低价杯打折。
 * 2. 渠道隔离：支持指定渠道生效（堂食、外卖平台等）。
 * 3. 优先级竞价：多活动同时生效时，优先匹配更高 priority 的活动；同优先级取优惠力度最大的活动。
 */
export function evaluateBestPromotion(
  cartItems: CartItemLike[],
  subtotalAmount: number,
  channelCode?: string,
  rules: DiscountRuleLike[] = []
): AppliedPromotion | null {
  if (!cartItems || cartItems.length === 0 || !rules || rules.length === 0) {
    return null
  }

  const now = new Date()

  // 1. 筛选当前有效且渠道匹配的规则
  const candidateRules = rules.filter(rule => {
    if (rule.status && rule.status !== 'active') return false

    // 有效期检查
    if (rule.validFrom) {
      const from = new Date(rule.validFrom)
      if (!isNaN(from.getTime()) && from > now) return false
    }
    if (rule.validUntil) {
      const until = new Date(rule.validUntil)
      // 若设为某天，直到当天 23:59:59 结束
      if (!isNaN(until.getTime())) {
        const endOfDay = new Date(until)
        if (rule.validUntil.length <= 10) {
          endOfDay.setHours(23, 59, 59, 999)
        }
        if (endOfDay < now) return false
      }
    }

    // 适用渠道检查 (如果规则配置了适用渠道且不为空，当前渠道必须包含在内)
    if (rule.applicableChannels && Array.isArray(rule.applicableChannels) && rule.applicableChannels.length > 0) {
      if (!channelCode) return false
      const match = rule.applicableChannels.some(
        c => c.toUpperCase() === channelCode.toUpperCase()
      )
      if (!match) return false
    }

    return true
  })

  if (candidateRules.length === 0) {
    return null
  }

  let bestPromo: (AppliedPromotion & { priority: number }) | null = null

  for (const rule of candidateRules) {
    let discount = 0
    let desc = ''
    let pairsCount = 0

    if (rule.discountType === 'second_half' || rule.discountType === 'bogo') {
      // 展开购物车所有单品基础价（加料不计入第二杯优惠基数，保障毛利安全）
      const cups: number[] = []
      for (const item of cartItems) {
        const qty = Math.max(0, item.quantity || 0)
        for (let i = 0; i < qty; i++) {
          cups.push(item.unitPrice || 0)
        }
      }

      const totalCups = cups.length
      const minRequired = Math.max(2, rule.minOrderAmount || 2)

      if (totalCups >= minRequired) {
        // 单价由高到低排序，确保优惠施加于价格更低或等价的单杯
        cups.sort((a, b) => b - a)

        pairsCount = Math.floor(totalCups / 2)
        const discountRate = rule.discountType === 'second_half' ? 0.5 : 1.0

        for (let p = 0; p < pairsCount; p++) {
          // 每一对中的第 2 杯（索引 1, 3, 5...）享受折扣
          const secondCupPrice = cups[2 * p + 1]
          discount += Math.round(secondCupPrice * discountRate)
        }

        // 优惠封顶
        if (rule.maxDiscount && rule.maxDiscount > 0) {
          discount = Math.min(discount, rule.maxDiscount)
        }

        desc = rule.discountType === 'second_half'
          ? `第二杯半价 (${pairsCount}对)`
          : `买一送一 (${pairsCount}对)`
      }
    } else if (rule.discountType === 'percent') {
      const minAmount = rule.minOrderAmount || 0
      if (subtotalAmount >= minAmount) {
        discount = Math.round(subtotalAmount * (rule.discountValue / 100))
        if (rule.maxDiscount && rule.maxDiscount > 0) {
          discount = Math.min(discount, rule.maxDiscount)
        }
        desc = `满折: ${rule.discountValue}%`
      }
    } else {
      // 'fixed' 满减
      const minAmount = rule.minOrderAmount || 0
      if (subtotalAmount >= minAmount) {
        discount = rule.discountValue || 0
        desc = `满减`
      }
    }

    // 折扣不能超过当前商品总金额
    discount = Math.min(discount, subtotalAmount)

    if (discount > 0) {
      const priority = rule.priority || 0
      const currentCandidate: AppliedPromotion & { priority: number } = {
        id: rule.id,
        name: rule.name,
        type: rule.discountType,
        amount: discount,
        description: desc,
        pairsCount,
        priority
      }

      if (!bestPromo) {
        bestPromo = currentCandidate
      } else {
        if (priority > bestPromo.priority) {
          bestPromo = currentCandidate
        } else if (priority === bestPromo.priority && discount > bestPromo.amount) {
          bestPromo = currentCandidate
        }
      }
    }
  }

  if (!bestPromo) return null

  const { priority: _p, ...promoResult } = bestPromo
  return promoResult
}

export interface PromotionUpsellHint {
  hint: string
  ruleName: string
  type: string
  gapAmount?: number
}

/**
 * 计算当前购物车的智能凑单/促单诱导提示 (用于副屏客显及收银提示)
 */
export function getPromotionUpsellHint(
  cartItems: CartItemLike[],
  subtotalAmount: number,
  channelCode?: string,
  rules: DiscountRuleLike[] = []
): PromotionUpsellHint | null {
  if (!cartItems || cartItems.length === 0 || !rules || rules.length === 0) {
    return null
  }

  const now = new Date()
  const candidateRules = rules.filter(rule => {
    if (rule.status && rule.status !== 'active') return false
    if (rule.validFrom && new Date(rule.validFrom) > now) return false
    if (rule.validUntil) {
      const until = new Date(rule.validUntil)
      if (rule.validUntil.length <= 10) until.setHours(23, 59, 59, 999)
      if (until < now) return false
    }
    if (rule.applicableChannels && rule.applicableChannels.length > 0) {
      if (!channelCode) return false
      const match = rule.applicableChannels.some(c => c.toUpperCase() === channelCode.toUpperCase())
      if (!match) return false
    }
    return true
  })

  if (candidateRules.length === 0) return null

  // 1. 优先检测“第二杯半价”与“买一送一”单数杯凑单
  let totalCups = 0
  for (const item of cartItems) {
    totalCups += Math.max(0, item.quantity || 0)
  }

  const pairRule = candidateRules.find(r => r.discountType === 'second_half' || r.discountType === 'bogo')
  if (pairRule && totalCups % 2 === 1) {
    if (pairRule.discountType === 'second_half') {
      return {
        hint: '💡 再加 1 杯，立享第二杯半价！',
        ruleName: pairRule.name,
        type: 'second_half'
      }
    } else {
      return {
        hint: '💡 再加 1 杯，立享买一送一！',
        ruleName: pairRule.name,
        type: 'bogo'
      }
    }
  }

  // 2. 检测满减/满折差额凑单 (仅当差距在单杯饮品价格区间如 30.000 以内)
  const thresholdRules = candidateRules.filter(r => (r.minOrderAmount || 0) > subtotalAmount)
  thresholdRules.sort((a, b) => (a.minOrderAmount || 0) - (b.minOrderAmount || 0))

  for (const tr of thresholdRules) {
    const gap = (tr.minOrderAmount || 0) - subtotalAmount
    if (gap > 0 && gap <= 30000) {
      const benefit = tr.discountType === 'percent'
        ? `${tr.discountValue}% 折扣`
        : `Rp ${tr.discountValue.toLocaleString()}`
      return {
        hint: `💡 订单再加 Rp ${gap.toLocaleString()}，立享 ${benefit}！`,
        ruleName: tr.name,
        type: tr.discountType,
        gapAmount: gap
      }
    }
  }

  return null
}

/**
 * 获取当前生效的营销活动亮点摘要 (用于副屏待机轮播文案)
 */
export function getActivePromotionsSummary(
  channelCode?: string,
  rules: DiscountRuleLike[] = []
): string[] {
  if (!rules || rules.length === 0) return []
  const now = new Date()
  const candidateRules = rules.filter(rule => {
    if (rule.status && rule.status !== 'active') return false
    if (rule.validFrom && new Date(rule.validFrom) > now) return false
    if (rule.validUntil) {
      const until = new Date(rule.validUntil)
      if (rule.validUntil.length <= 10) until.setHours(23, 59, 59, 999)
      if (until < now) return false
    }
    if (rule.applicableChannels && rule.applicableChannels.length > 0) {
      if (!channelCode) return false
      const match = rule.applicableChannels.some(c => c.toUpperCase() === channelCode.toUpperCase())
      if (!match) return false
    }
    return true
  })

  return candidateRules.map(r => {
    if (r.discountType === 'second_half') return `🎉 ${r.name || '第二杯半价'}`
    if (r.discountType === 'bogo') return `✨ ${r.name || '买一送一'}`
    if (r.discountType === 'percent') return `🔥 满 Rp ${(r.minOrderAmount || 0).toLocaleString()} 享 ${r.discountValue}% 折扣`
    return `🎁 满 Rp ${(r.minOrderAmount || 0).toLocaleString()} 立减 Rp ${(r.discountValue || 0).toLocaleString()}`
  })
}

