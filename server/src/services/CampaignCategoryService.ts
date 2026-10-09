import prisma from '../config/database'
import { listActivities } from './ActivityService'

// Get all categories for a store
export async function getCampaignCategories(storeId: string) {
  const categories = await prisma.campaignCategory.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
  })
  const activities = await listActivities(storeId)
  return categories.map(category => ({ ...category, activityCount: activities.filter(activity => activity.categoryId === category.id).length }))
}

// Get single category
export async function getCampaignCategory(id: string, storeId: string) {
  return prisma.campaignCategory.findFirst({
    where: { id, storeId }
  })
}

// Create category
export async function createCampaignCategory(data: {
  storeId: string
  name: string
  icon?: string
  color?: string
  sortOrder?: number
}) {
  return prisma.campaignCategory.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      icon: data.icon || null,
      color: data.color || null,
      sortOrder: data.sortOrder || 0,
      isBuiltIn: false
    }
  })
}

// Update category
export async function updateCampaignCategory(id: string, data: {
  name?: string
  icon?: string
  color?: string
  sortOrder?: number
}, storeId: string) {
  if (!await getCampaignCategory(id, storeId)) throw new Error('Category not found')
  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.icon !== undefined) updateData.icon = data.icon
  if (data.color !== undefined) updateData.color = data.color
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder

  return prisma.campaignCategory.update({
    where: { id },
    data: updateData
  })
}

// Delete category (only if not built-in)
export async function deleteCampaignCategory(id: string, storeId: string) {
  return prisma.$transaction(async tx => {
    const category = await tx.campaignCategory.findFirst({ where: { id, storeId } })
    if (!category) throw new Error('Category not found')
    if (category.isBuiltIn) throw new Error('Cannot delete built-in category')
    const campaignCount = await tx.campaign.count({ where: { categoryId: id, storeId } })
    if (campaignCount > 0 || (await listActivities(storeId, tx)).some(activity => activity.categoryId === id)) {
      throw new Error('Cannot delete category that is used by campaigns')
    }
    return tx.campaignCategory.delete({ where: { id } })
  }, { isolationLevel: 'Serializable' })
}

// Seed default categories for a store
export async function seedDefaultCategories(storeId: string) {
  const defaults = [
    { name: 'birthday', icon: '🎂', color: '#FF6B6B', isBuiltIn: true, sortOrder: 1 },
    { name: 'reactivation', icon: '🔄', color: '#4ECDC4', isBuiltIn: true, sortOrder: 2 },
    { name: 'loyalty', icon: '⭐', color: '#FFE66D', isBuiltIn: true, sortOrder: 3 },
    { name: 'seasonal', icon: '🌙', color: '#95E1D3', isBuiltIn: true, sortOrder: 4 },
    { name: 'welcome', icon: '🎉', color: '#F38181', isBuiltIn: true, sortOrder: 5 },
    { name: 'points_expiring', icon: '⏰', color: '#AA96DA', isBuiltIn: true, sortOrder: 6 },
    { name: 'opening', icon: '🎊', color: '#EC6D88', isBuiltIn: true, sortOrder: 7 },
    { name: 'new_product', icon: '🥤', color: '#10B981', isBuiltIn: true, sortOrder: 8 },
    { name: 'repurchase', icon: '🛍️', color: '#3B82F6', isBuiltIn: true, sortOrder: 9 }
  ]

  const created = []
  for (const d of defaults) {
    const existing = await prisma.campaignCategory.findFirst({
      where: { storeId, name: d.name }
    })
    if (!existing) {
      const cat = await prisma.campaignCategory.create({
        data: { ...d, storeId }
      })
      created.push(cat)
    }
  }
  return created
}
