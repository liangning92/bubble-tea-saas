import prisma from '../config/database'

export async function createAuditLog(data: {
  storeId: string
  userId: string
  action: 'create' | 'update' | 'delete'
  entityType: string
  entityId: string
  description: string
  oldValue?: Record<string, any>
  newValue?: Record<string, any>
  ipAddress?: string
}) {
  return prisma.financeAuditLog.create({
    data: {
      storeId: data.storeId,
      userId: data.userId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      description: data.description,
      oldValue: data.oldValue ? JSON.stringify(data.oldValue) : null,
      newValue: data.newValue ? JSON.stringify(data.newValue) : null,
      ipAddress: data.ipAddress || null
    }
  })
}

export async function getAuditLogs(storeId: string, options?: {
  entityType?: string
  userId?: string
  startDate?: Date
  endDate?: Date
  limit?: number
}) {
  const where: any = { storeId }
  if (options?.entityType) where.entityType = options.entityType
  if (options?.userId) where.userId = options.userId
  if (options?.startDate || options?.endDate) {
    where.createdAt = {}
    if (options.startDate) where.createdAt.gte = options.startDate
    if (options.endDate) where.createdAt.lte = options.endDate
  }

  return prisma.financeAuditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 100
  })
}
