import prisma from '../config/database'

export interface SupplierFilter {
  storeId?: string
  search?: string
  isActive?: boolean
}

// Get suppliers
export async function getSuppliers(filter: SupplierFilter) {
  const where: any = {}

  if (filter.storeId) where.storeId = filter.storeId
  if (filter.isActive !== undefined) where.isActive = filter.isActive
  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search, mode: 'insensitive' } },
      { contactPerson: { contains: filter.search, mode: 'insensitive' } },
      { phone: { contains: filter.search } }
    ]
  }

  return prisma.supplier.findMany({
    where,
    orderBy: { name: 'asc' }
  })
}

// Get supplier by ID
export async function getSupplierById(supplierId: string) {
  return prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      stockInLogs: {
        orderBy: { createdAt: 'desc' },
        take: 20
      },
      purchaseOrders: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  })
}

// Create supplier
export async function createSupplier(data: {
  storeId: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  note?: string
}) {
  return prisma.supplier.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      contactPerson: data.contactPerson,
      phone: data.phone,
      email: data.email,
      address: data.address,
      note: data.note,
      isActive: true
    }
  })
}

// Update supplier
export async function updateSupplier(supplierId: string, data: Partial<{
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  note: string
  isActive: boolean
}>) {
  return prisma.supplier.update({
    where: { id: supplierId },
    data
  })
}

// Delete supplier (soft delete)
export async function deleteSupplier(supplierId: string) {
  return prisma.supplier.update({
    where: { id: supplierId },
    data: { isActive: false }
  })
}

// Get supplier statistics
export async function getSupplierStats(supplierId: string) {
  const [totalOrders, totalSpent, lastOrder] = await Promise.all([
    prisma.purchaseOrder.count({
      where: { supplierId, status: { not: 'cancelled' } }
    }),
    prisma.purchaseOrder.aggregate({
      where: { supplierId, status: 'received' },
      _sum: { totalAmount: true }
    }),
    prisma.purchaseOrder.findFirst({
      where: { supplierId },
      orderBy: { createdAt: 'desc' }
    })
  ])

  return {
    totalOrders,
    totalSpent: totalSpent._sum.totalAmount || 0,
    lastOrderDate: lastOrder?.createdAt
  }
}

// Get suppliers for dropdown
export async function getSuppliersForDropdown(storeId: string) {
  return prisma.supplier.findMany({
    where: { storeId, isActive: true },
    select: {
      id: true,
      name: true,
      contactPerson: true,
      phone: true
    },
    orderBy: { name: 'asc' }
  })
}