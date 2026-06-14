import prisma from '../config/database'

export async function getFixedAssets(storeId: string, options?: {
  status?: string
}) {
  const where: any = { storeId }
  if (options?.status) where.status = options.status

  return prisma.fixedAsset.findMany({
    where,
    orderBy: { purchaseDate: 'desc' }
  })
}

export async function getFixedAsset(id: string) {
  return prisma.fixedAsset.findUnique({ where: { id } })
}

export async function createFixedAsset(data: {
  storeId: string
  name: string
  description?: string
  purchaseDate: Date
  originalValue: number
  usefulLife: number
  salvageValue: number
  depreciationMethod?: string
}) {
  return prisma.fixedAsset.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      description: data.description,
      purchaseDate: data.purchaseDate,
      originalValue: data.originalValue,
      usefulLife: data.usefulLife,
      salvageValue: data.salvageValue,
      depreciationMethod: data.depreciationMethod || 'straight_line'
    }
  })
}

export async function updateFixedAsset(id: string, data: {
  name?: string
  description?: string
  purchaseDate?: Date
  originalValue?: number
  usefulLife?: number
  salvageValue?: number
  status?: string
}) {
  return prisma.fixedAsset.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.purchaseDate && { purchaseDate: data.purchaseDate }),
      ...(data.originalValue !== undefined && { originalValue: data.originalValue }),
      ...(data.usefulLife !== undefined && { usefulLife: data.usefulLife }),
      ...(data.salvageValue !== undefined && { salvageValue: data.salvageValue }),
      ...(data.status && { status: data.status })
    }
  })
}

export async function deleteFixedAsset(id: string) {
  return prisma.fixedAsset.delete({ where: { id } })
}

// Calculate monthly depreciation using straight-line method
export function calculateDepreciation(asset: {
  originalValue: number
  usefulLife: number
  salvageValue: number
  purchaseDate: Date
  status?: string
}) {
  // Return zero depreciation for disposed/sold assets
  if (asset.status && asset.status !== 'active') {
    return {
      monthlyDepreciation: 0,
      accumulatedDepreciation: 0,
      currentValue: asset.originalValue,
      monthsElapsed: 0,
      remainingMonths: 0,
      isActive: false
    }
  }
  const depreciableAmount = asset.originalValue - asset.salvageValue
  const monthlyDepreciation = depreciableAmount / asset.usefulLife

  // Calculate accumulated depreciation up to now
  const now = new Date()
  const monthsElapsed = Math.max(0,
    (now.getFullYear() - asset.purchaseDate.getFullYear()) * 12 +
    (now.getMonth() - asset.purchaseDate.getMonth())
  )

  const accumulatedDepreciation = Math.min(
    monthlyDepreciation * monthsElapsed,
    depreciableAmount
  )

  const currentValue = asset.originalValue - accumulatedDepreciation

  return {
    monthlyDepreciation: Math.round(monthlyDepreciation),
    accumulatedDepreciation: Math.round(accumulatedDepreciation),
    currentValue: Math.round(currentValue),
    monthsElapsed,
    remainingMonths: Math.max(0, asset.usefulLife - monthsElapsed)
  }
}

export async function getDepreciationSchedule(storeId: string) {
  const assets = await prisma.fixedAsset.findMany({
    where: { storeId, status: 'active' }
  })

  return assets.map(asset => {
    const depreciation = calculateDepreciation(asset)
    return {
      id: asset.id,
      name: asset.name,
      originalValue: asset.originalValue,
      purchaseDate: asset.purchaseDate,
      ...depreciation
    }
  })
}