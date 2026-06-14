import prisma from '../config/database'

// Get all categories for a store
export async function getCampaignCategories(storeId: string) {
  return prisma.campaignCategory.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
  })
}

// Get single category
export async function getCampaignCategory(id: string) {
  return prisma.campaignCategory.findUnique({
    where: { id }
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
}) {
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
export async function deleteCampaignCategory(id: string) {
  const category = await prisma.campaignCategory.findUnique({
    where: { id }
  })

  if (!category) {
    throw new Error('Category not found')
  }

  if (category.isBuiltIn) {
    throw new Error('Cannot delete built-in category')
  }

  // Check if any campaigns use this category
  const campaignCount = await prisma.campaign.count({
    where: { categoryId: id }
  })

  if (campaignCount > 0) {
    throw new Error('Cannot delete category that is used by campaigns')
  }

  return prisma.campaignCategory.delete({
    where: { id }
  })
}

// Seed default categories for a store
export async function seedDefaultCategories(storeId: string) {
  const defaults = [
    { name: 'birthday', icon: '🎂', color: '#FF6B6B', isBuiltIn: true, sortOrder: 1 },
    { name: 'reactivation', icon: '🔄', color: '#4ECDC4', isBuiltIn: true, sortOrder: 2 },
    { name: 'loyalty', icon: '⭐', color: '#FFE66D', isBuiltIn: true, sortOrder: 3 },
    { name: 'seasonal', icon: '🌙', color: '#95E1D3', isBuiltIn: true, sortOrder: 4 },
    { name: 'welcome', icon: '🎉', color: '#F38181', isBuiltIn: true, sortOrder: 5 },
    { name: 'points_expiring', icon: '⏰', color: '#AA96DA', isBuiltIn: true, sortOrder: 6 }
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
