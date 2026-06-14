import prisma from '../config/database'

// Variable placeholders for message templates
const AVAILABLE_VARIABLES = [
  'member_name',
  'member_phone',
  'coupon_code',
  'coupon_value',
  'coupon_expiry',
  'points',
  'points_value',
  'expiry_date',
  'store_name',
  'store_phone',
  'order_number',
  'order_amount',
  'campaign_name',
  'referral_code',
  'tier_name',
  'tier_benefits'
]

// Replace variables in message body
export function replaceVariables(
  body: string,
  variables: Record<string, string | number>
): string {
  let result = body
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
  }
  return result
}

// Get available variables
export function getAvailableVariables(): string[] {
  return AVAILABLE_VARIABLES
}

// Create message channel
export async function createMessageChannel(data: {
  storeId: string
  type: string
  name: string
  provider: string
  config: Record<string, string>
  enabled?: boolean
  priority?: number
  costPerSms?: number
  dailyLimit?: number
  monthlyLimit?: number
  isDefault?: boolean
}) {
  return prisma.messageChannel.create({
    data: {
      storeId: data.storeId,
      type: data.type,
      name: data.name,
      provider: data.provider,
      config: JSON.stringify(data.config),
      enabled: data.enabled ?? true,
      priority: data.priority ?? 0,
      costPerSms: data.costPerSms ?? 0,
      dailyLimit: data.dailyLimit ?? 1000,
      monthlyLimit: data.monthlyLimit ?? 10000,
      isDefault: data.isDefault ?? false
    }
  })
}

// Get message channels for store
export async function getMessageChannels(storeId: string) {
  return prisma.messageChannel.findMany({
    where: { storeId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
  })
}

// Get default channel for type
export async function getDefaultChannel(storeId: string, type: string) {
  return prisma.messageChannel.findFirst({
    where: { storeId, type, enabled: true },
    orderBy: [{ isDefault: 'desc' }, { priority: 'desc' }]
  })
}

// Update message channel
export async function updateMessageChannel(
  id: string,
  data: Partial<{
    name: string
    provider: string
    config: Record<string, string>
    enabled: boolean
    priority: number
    costPerSms: number
    dailyLimit: number
    monthlyLimit: number
    isDefault: boolean
  }>
) {
  const updateData: any = { ...data }
  if (data.config) {
    updateData.config = JSON.stringify(data.config)
  }
  return prisma.messageChannel.update({
    where: { id },
    data: updateData
  })
}

// Delete message channel
export async function deleteMessageChannel(id: string) {
  return prisma.messageChannel.delete({ where: { id } })
}

// Create message template
export async function createMessageTemplate(data: {
  storeId: string
  type: string
  name: string
  channel: string
  subject?: string
  body: string
  variables?: string[]
  enabled?: boolean
  isDefault?: boolean
  sortOrder?: number
}) {
  return prisma.messageTemplate.create({
    data: {
      storeId: data.storeId,
      type: data.type,
      name: data.name,
      channel: data.channel,
      subject: data.subject,
      body: data.body,
      variables: JSON.stringify(data.variables || []),
      enabled: data.enabled ?? true,
      isDefault: data.isDefault ?? false,
      sortOrder: data.sortOrder ?? 0
    }
  })
}

// Get message templates for store
export async function getMessageTemplates(storeId: string, type?: string) {
  const where: any = { storeId }
  if (type) where.type = type
  return prisma.messageTemplate.findMany({
    where,
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }]
  })
}

// Get template by type and channel
export async function getTemplateByTypeAndChannel(
  storeId: string,
  type: string,
  channel: string
) {
  // First try to find template matching both type and channel
  let template = await prisma.messageTemplate.findFirst({
    where: {
      storeId,
      type,
      channel: { in: [channel, 'all'] },
      enabled: true
    },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }]
  })

  // Fallback to 'all' channel template
  if (!template) {
    template = await prisma.messageTemplate.findFirst({
      where: { storeId, type, channel: 'all', enabled: true },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }]
    })
  }

  return template
}

// Update message template
export async function updateMessageTemplate(
  id: string,
  data: Partial<{
    name: string
    channel: string
    subject: string
    body: string
    variables: string[]
    enabled: boolean
    isDefault: boolean
    sortOrder: number
  }>
) {
  const updateData: any = { ...data }
  if (data.variables) {
    updateData.variables = JSON.stringify(data.variables)
  }
  return prisma.messageTemplate.update({
    where: { id },
    data: updateData
  })
}

// Delete message template
export async function deleteMessageTemplate(id: string) {
  return prisma.messageTemplate.delete({ where: { id } })
}

// Send message result interface
export interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
  cost?: number
}

// SMS Provider interfaces
interface SMSProvider {
  send(phone: string, message: string): Promise<SendMessageResult>
}

interface WhatsAppProvider {
  send(phone: string, templateName: string, variables: Record<string, string>): Promise<SendMessageResult>
}

// Mock SMS Provider (for development/testing)
class MockSMSProvider implements SMSProvider {
  async send(phone: string, message: string): Promise<SendMessageResult> {
    console.log(`[MockSMS] Sending to ${phone}: ${message.substring(0, 50)}...`)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 100))
    return {
      success: true,
      messageId: `mock_sms_${Date.now()}`,
      cost: 150 // 150 IDR per SMS
    }
  }
}

// Mock WhatsApp Provider
class MockWhatsAppProvider implements WhatsAppProvider {
  async send(phone: string, templateName: string, variables: Record<string, string>): Promise<SendMessageResult> {
    console.log(`[MockWhatsApp] Sending to ${phone} with template ${templateName}`)
    await new Promise(resolve => setTimeout(resolve, 100))
    return {
      success: true,
      messageId: `mock_wa_${Date.now()}`,
      cost: 500 // 500 IDR per WhatsApp message
    }
  }
}

// Get provider instance based on type
function getProvider(provider: string, config: Record<string, string>): SMSProvider | WhatsAppProvider {
  switch (provider) {
    case 'twilio':
      // In production, implement actual Twilio integration
      // const twilio = require('twilio')(config.accountSid, config.authToken)
      return new MockSMSProvider()
    case 'nexmo':
      // In production, implement actual Nexmo/Vonage integration
      return new MockSMSProvider()
    case 'whatsapp':
      return new MockWhatsAppProvider()
    default:
      return new MockSMSProvider()
  }
}

// Send message to member
export async function sendMessageToMember(
  storeId: string,
  memberId: string,
  type: string,
  channelType: string,
  templateId: string | null,
  customBody?: string
): Promise<SendMessageResult> {
  // Get member info
  const member = await prisma.member.findUnique({
    where: { id: memberId }
  })
  if (!member) {
    return { success: false, error: 'Member not found' }
  }

  // Get store info
  const store = await prisma.store.findUnique({
    where: { id: storeId }
  })

  // Get channel
  const channel = await getDefaultChannel(storeId, channelType)
  if (!channel) {
    return { success: false, error: `No enabled ${channelType} channel configured` }
  }

  // Get template if not custom
  let template = null
  let body = customBody || ''
  if (templateId) {
    template = await prisma.messageTemplate.findUnique({
      where: { id: templateId }
    })
    if (template) {
      body = template.body
    }
  }

  // Prepare variables
  const variables: Record<string, string | number> = {
    member_name: member.name,
    member_phone: member.phone,
    store_name: store?.name || '',
    store_phone: store?.phone || '',
    tier_name: member.level
  }

  // Replace variables in body
  const finalBody = replaceVariables(body, variables)

  // Get provider and send
  const provider = getProvider(channel.provider, JSON.parse(channel.config))

  let result: SendMessageResult
  if (channelType === 'whatsapp' && template) {
    // Convert all variables to strings for WhatsApp
    const stringVars: Record<string, string> = {}
    for (const [key, value] of Object.entries(variables)) {
      stringVars[key] = String(value)
    }
    result = await (provider as WhatsAppProvider).send(
      member.phone,
      template.name,
      stringVars
    )
  } else {
    result = await (provider as SMSProvider).send(member.phone, finalBody)
  }

  // Log the message
  await prisma.messageLog.create({
    data: {
      storeId,
      memberId,
      channelId: channel.id,
      templateId,
      type,
      channelType,
      recipient: member.phone,
      subject: template?.subject,
      body: finalBody,
      status: result.success ? 'sent' : 'failed',
      providerId: result.messageId,
      errorMessage: result.error,
      cost: result.cost ?? 0,
      sentAt: result.success ? new Date() : null
    }
  })

  return result
}

// Broadcast message to multiple members
export async function broadcastMessage(
  storeId: string,
  memberIds: string[],
  type: string,
  channelType: string,
  templateId: string | null,
  customBody?: string
): Promise<{ success: number; failed: number; results: SendMessageResult[] }> {
  const results: SendMessageResult[] = []
  let success = 0
  let failed = 0

  for (const memberId of memberIds) {
    const result = await sendMessageToMember(
      storeId,
      memberId,
      type,
      channelType,
      templateId,
      customBody
    )
    results.push(result)
    if (result.success) {
      success++
    } else {
      failed++
    }
  }

  return { success, failed, results }
}

// Get message logs
export async function getMessageLogs(
  storeId: string,
  options: {
    memberId?: string
    type?: string
    channelType?: string
    status?: string
    startDate?: Date
    endDate?: Date
    limit?: number
    offset?: number
  } = {}
) {
  const where: any = { storeId }
  if (options.memberId) where.memberId = options.memberId
  if (options.type) where.type = options.type
  if (options.channelType) where.channelType = options.channelType
  if (options.status) where.status = options.status
  if (options.startDate || options.endDate) {
    where.createdAt = {}
    if (options.startDate) where.createdAt.gte = options.startDate
    if (options.endDate) where.createdAt.lte = options.endDate
  }

  const [logs, total] = await Promise.all([
    prisma.messageLog.findMany({
      where,
      include: {
        member: { select: { name: true, phone: true } },
        channel: { select: { name: true, type: true } },
        template: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.offset ?? 0
    }),
    prisma.messageLog.count({ where })
  ])

  return { logs, total }
}

// Get message statistics
export async function getMessageStats(storeId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [todayLogs, monthLogs, pendingLogs, failedLogs] = await Promise.all([
    prisma.messageLog.aggregate({
      where: { storeId, createdAt: { gte: today } },
      _count: true,
      _sum: { cost: true }
    }),
    prisma.messageLog.aggregate({
      where: { storeId, createdAt: { gte: monthStart } },
      _count: true,
      _sum: { cost: true }
    }),
    prisma.messageLog.count({ where: { storeId, status: 'pending' } }),
    prisma.messageLog.count({ where: { storeId, status: 'failed' } })
  ])

  return {
    today: {
      count: todayLogs._count,
      cost: todayLogs._sum.cost || 0
    },
    month: {
      count: monthLogs._count,
      cost: monthLogs._sum.cost || 0
    },
    pending: pendingLogs,
    failed: failedLogs
  }
}

// Create default templates for a store
export async function createDefaultTemplates(storeId: string) {
  const templates = [
    {
      type: 'birthday',
      name: 'Birthday Greeting (SMS)',
      channel: 'sms',
      subject: null,
      body: 'Selamat ulang tahun {member_name}! 🎂 Nikmati minuman GRATIS hari ini dengan menunjukkan pesan ini. Berlaku 1x di {store_name}. Selamat berbelanja! 🧋',
      isDefault: true
    },
    {
      type: 'birthday',
      name: 'Birthday Greeting (WhatsApp)',
      channel: 'whatsapp',
      subject: '🎂 Happy Birthday!',
      body: 'Selamat ulang tahun {member_name}! 🎂\n\nDapatkan minuman GRATIS hari ini di {store_name}!\n\nTunjukkan pesan ini ke kasir.\n\nSemoga harimu menyenangkan! 🧋',
      isDefault: true
    },
    {
      type: 'reactivation',
      name: 'Reactivation Reminder (SMS)',
      channel: 'sms',
      subject: null,
      body: 'Hai {member_name}! Kami rindu kamu! 🧋 Kunjungi {store_name} dan dapatkan kupon spesial 20% untuk minuman favoritmu. Berlaku sampai akhir bulan ini!',
      isDefault: true
    },
    {
      type: 'points_expiring',
      name: 'Points Expiring Warning (SMS)',
      channel: 'sms',
      subject: null,
      body: 'Hai {member_name}! Poin kamu ({points} poin) akan segera kadaluarsa dalam 14 hari. Segera tukarkan dengan hadiah menarik di {store_name}! 🏪',
      isDefault: true
    },
    {
      type: 'seasonal',
      name: 'Ramadan Promotion (SMS)',
      channel: 'sms',
      subject: null,
      body: 'Selamat Ramadan {member_name}! 🌙 Dapatkan DISKON 15% untuk semua minuman di {store_name} sepanjang bulan suci ini. Berlaku setiap hari. Selamat beribadah! 🕌',
      isDefault: true
    },
    {
      type: 'welcome',
      name: 'Welcome Message (SMS)',
      channel: 'sms',
      subject: null,
      body: 'Selamat {member_name}! 🎉 Anda sekarang adalah member {tier_name} di {store_name}. Kumpulkan poin setiap pembelian dan tukarkan dengan minuman GRATIS! 🧋',
      isDefault: true
    },
    {
      type: 'referral',
      name: 'Referral Success (SMS)',
      channel: 'sms',
      subject: null,
      body: '{member_name}, teman Anda telah mendaftar menggunakan kode referral Anda! 🎉 Anda mendapatkan {points} poin. Terima kasih sudah mengajak teman! 🧋',
      isDefault: true
    }
  ]

  const created = []
  for (const t of templates) {
    const existing = await prisma.messageTemplate.findFirst({
      where: { storeId, type: t.type, channel: t.channel }
    })
    if (!existing) {
      const createdTemplate = await prisma.messageTemplate.create({
        data: {
          storeId,
          ...t,
          variables: JSON.stringify(['member_name', 'store_name', 'tier_name', 'points', 'coupon_code'])
        }
      })
      created.push(createdTemplate)
    }
  }

  return created
}
