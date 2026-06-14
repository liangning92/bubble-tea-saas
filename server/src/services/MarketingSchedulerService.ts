import prisma from '../config/database'
import * as MarketingService from './MarketingAutomationService'

const CHECK_INTERVAL = 60 * 1000 // 1 minute
const CONFIG_KEY = 'marketing.automation_time'
const DEFAULT_TIME = '00:00'

let schedulerInterval: NodeJS.Timeout | null = null
let lastRunTime = 0

/**
 * 获取配置的营销自动化执行时间
 */
export async function getAutomationTime(storeId: string): Promise<string> {
  try {
    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: CONFIG_KEY } }
    })
    return config?.value || DEFAULT_TIME
  } catch {
    return DEFAULT_TIME
  }
}

/**
 * 设置营销自动化执行时间
 */
export async function setAutomationTime(storeId: string, time: string): Promise<void> {
  await prisma.config.upsert({
    where: { storeId_key: { storeId, key: CONFIG_KEY } },
    create: { storeId, key: CONFIG_KEY, value: time, category: 'marketing' },
    update: { value: time }
  })
}

/**
 * 执行营销自动化检查
 */
async function runMarketingAutomation() {
  console.log('[MarketingScheduler] Running marketing automation...')

  try {
    const stores = await prisma.store.findMany({
      where: {}
    })

    for (const store of stores) {
      //1. 生日触发
      try {
        await MarketingService.checkBirthdayCampaign(store.id)
      } catch (e) {
        console.error(`[MarketingScheduler] Birthday campaign error for store ${store.id}:`, e)
      }

      // 2. 重新激活 (7天未消费)
      try {
        await MarketingService.checkReactivationCampaign(store.id)
      } catch (e) {
        console.error(`[MarketingScheduler] Reactivation campaign error for store ${store.id}:`, e)
      }

      // 3. 积分过期提醒
      try {
        await MarketingService.checkPointsExpiringCampaign(store.id)
      } catch (e) {
        console.error(`[MarketingScheduler] Points expiring campaign error for store ${store.id}:`, e)
      }

      // 4. 季节性活动
      try {
        await MarketingService.checkSeasonalCampaign(store.id)
      } catch (e) {
        console.error(`[MarketingScheduler] Seasonal campaign error for store ${store.id}:`, e)
      }

      // 5. 新客欢迎
      try {
        await MarketingService.checkWelcomeCampaign(store.id)
      } catch (e) {
        console.error(`[MarketingScheduler] Welcome campaign error for store ${store.id}:`, e)
      }
    }

    console.log('[MarketingScheduler] Marketing automation completed')
  } catch (error) {
    console.error('[MarketingScheduler] Error running marketing automation:', error)
  }
}

/**
 * 启动营销自动化调度器
 */
export function startMarketingScheduler() {
  if (schedulerInterval) {
    console.log('[MarketingScheduler] Already running')
    return
  }

  console.log('[MarketingScheduler] Starting marketing automation scheduler')

  schedulerInterval = setInterval(async () => {
    const now = new Date()
    const currentMinute = now.getTime()

    // Skip if we already ran in this minute
    if (currentMinute - lastRunTime < 60000) return

    // Get automation time from first active store (or default)
    const store = await prisma.store.findFirst()
    if (!store) return

    const automationTime = await getAutomationTime(store.id)
    const timeParts = automationTime.split(':')
    const targetHour = parseInt(timeParts[0], 10)
    const targetMin = parseInt(timeParts[1], 10)

    // Validate parsed values
    if (isNaN(targetHour) || isNaN(targetMin)) {
      console.warn('[MarketingScheduler] Invalid automation time configured:', automationTime)
      return
    }

    // Check if current time matches configured time
    if (now.getHours() === targetHour && now.getMinutes() === targetMin) {
      lastRunTime = currentMinute
      await runMarketingAutomation()
    }
  }, CHECK_INTERVAL)
}

/**
 * 停止营销自动化调度器
 */
export function stopMarketingScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    console.log('[MarketingScheduler] Stopped')
  }
}

/**
 * 手动触发一次营销自动化 (用于测试)
 */
export async function triggerMarketingAutomationNow() {
  await runMarketingAutomation()
}