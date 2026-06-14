import prisma from '../config/database'
import { sendMessageToMember } from './MessageService'

export interface ActionContext {
  memberId: string
  storeId: string
  orderId?: string
  campaignName?: string
}

// Built-in action executors
type ActionExecutor = (config: Record<string, any>, ctx: ActionContext) => Promise<void>

const executors: Record<string, ActionExecutor> = {
  // Send coupon to member
  send_coupon: async (config, ctx) => {
    const { couponId } = config
    if (!couponId) {
      console.warn('send_coupon action: no couponId provided')
      return
    }

    // Generate coupon for member
    await prisma.memberCoupon.create({
      data: {
        memberId: ctx.memberId,
        couponId,
        status: 'unused'
      }
    })

    console.log(`[ActionExecutor] Sent coupon ${couponId} to member ${ctx.memberId}`)
  },

  // Send message to member
  send_message: async (config, ctx) => {
    const { templateId, channel } = config
    if (!templateId) {
      console.warn('send_message action: no templateId provided')
      return
    }

    try {
      const result = await sendMessageToMember(
        ctx.storeId,
        ctx.memberId,
        'campaign',
        channel || 'sms',
        templateId
      )
      console.log(`[ActionExecutor] Sent message to member ${ctx.memberId}:`, result.success ? 'success' : 'failed')
    } catch (error) {
      console.error(`[ActionExecutor] Failed to send message to member ${ctx.memberId}:`, error)
    }
  },

  // Add points to member
  add_points: async (config, ctx) => {
    const { points, note } = config
    if (!points || points <= 0) {
      console.warn('add_points action: no valid points provided')
      return
    }

    await prisma.member.update({
      where: { id: ctx.memberId },
      data: { points: { increment: points } }
    })

    await prisma.pointLog.create({
      data: {
        memberId: ctx.memberId,
        type: 'earn',
        points,
        orderId: ctx.orderId || null,
        note: note || `Campaign: ${ctx.campaignName || 'Unknown'}`
      }
    })

    console.log(`[ActionExecutor] Added ${points} points to member ${ctx.memberId}`)
  },

  // Remove points from member
  remove_points: async (config, ctx) => {
    const { points, note } = config
    if (!points || points <= 0) {
      console.warn('remove_points action: no valid points provided')
      return
    }

    await prisma.member.update({
      where: { id: ctx.memberId },
      data: { points: { decrement: points } }
    })

    await prisma.pointLog.create({
      data: {
        memberId: ctx.memberId,
        type: 'adjust',
        points: -points,
        orderId: ctx.orderId || null,
        note: note || `Campaign: ${ctx.campaignName || 'Unknown'}`
      }
    })

    console.log(`[ActionExecutor] Removed ${points} points from member ${ctx.memberId}`)
  }
}

// Execute a single action
export async function executeAction(
  actionKey: string,
  config: Record<string, any>,
  ctx: ActionContext
): Promise<void> {
  const executor = executors[actionKey]
  if (!executor) {
    console.warn(`[ActionExecutor] Unknown action key: ${actionKey}`)
    return
  }

  try {
    await executor(config, ctx)
  } catch (error) {
    console.error(`[ActionExecutor] Error executing action ${actionKey}:`, error)
  }
}

// Execute multiple actions for a campaign
export async function executeCampaignActions(
  actions: Array<{ actionKey: string; config: string; sortOrder: number }>,
  ctx: ActionContext
): Promise<{ executed: number; failed: number }> {
  let executed = 0
  let failed = 0

  // Sort by sortOrder
  const sorted = [...actions].sort((a, b) => a.sortOrder - b.sortOrder)

  for (const action of sorted) {
    try {
      const config = typeof action.config === 'string' ? JSON.parse(action.config) : action.config
      await executeAction(action.actionKey, config, ctx)
      executed++
    } catch (error) {
      console.error(`[ActionExecutor] Failed to execute action ${action.actionKey}:`, error)
      failed++
    }
  }

  return { executed, failed }
}

// Get all action definitions (for UI)
export function getActionDefinitions() {
  return [
    {
      key: 'send_coupon',
      name: 'Send Coupon',
      description: 'Send a coupon to the member',
      configSchema: {
        type: 'object',
        properties: {
          couponId: { type: 'string', label: 'Select Coupon' }
        },
        required: ['couponId']
      }
    },
    {
      key: 'send_message',
      name: 'Send Message',
      description: 'Send a notification message to the member',
      configSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string', label: 'Select Template' },
          channel: { type: 'string', label: 'Channel', enum: ['sms', 'whatsapp'] }
        },
        required: ['templateId']
      }
    },
    {
      key: 'add_points',
      name: 'Add Points',
      description: 'Add points to the member account',
      configSchema: {
        type: 'object',
        properties: {
          points: { type: 'number', label: 'Points to Add' },
          note: { type: 'string', label: 'Note (optional)' }
        },
        required: ['points']
      }
    },
    {
      key: 'remove_points',
      name: 'Remove Points',
      description: 'Remove points from the member account',
      configSchema: {
        type: 'object',
        properties: {
          points: { type: 'number', label: 'Points to Remove' },
          note: { type: 'string', label: 'Reason (optional)' }
        },
        required: ['points']
      }
    }
  ]
}
