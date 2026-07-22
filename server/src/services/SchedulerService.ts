import * as HygieneService from './HygieneService'

// 调度器定时检查间隔 (毫秒)
const CHECK_INTERVAL = 60 * 1000 // 1分钟
const isDev = process.env.NODE_ENV !== 'production'

let schedulerInterval: NodeJS.Timeout | null = null

/**
 * 启动卫生任务调度器
 * 每分钟检查一次是否有模板需要触发
 */
export function startHygieneScheduler() {
  if (schedulerInterval) {
    if (isDev) console.log('[Scheduler] Hygiene scheduler already running')
    return
  }

  if (isDev) console.log('[Scheduler] Starting hygiene task scheduler (every 60s)')

  // 立即执行一次
  processHygieneTasks()

  //定时执行
  schedulerInterval = setInterval(processHygieneTasks, CHECK_INTERVAL)
}

/**
 * 停止调度器
 */
export function stopHygieneScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    if (isDev) console.log('[Scheduler] Hygiene scheduler stopped')
  }
}

/**
 * 处理到期的卫生任务模板
 */
async function processHygieneTasks() {
  try {
    const count = await HygieneService.processDueTemplates()
    if (isDev && count > 0) {
      console.log(`[Scheduler] Created ${count} hygiene tasks`)
    }
  } catch (error) {
    console.error('[Scheduler] Error processing hygiene tasks:', error)
  }
}

/**
 * 手动触发一次任务生成 (用于测试或手动补救)
 */
export async function triggerHygieneTasksNow() {
  return processHygieneTasks()
}