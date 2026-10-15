import prisma from '../config/database'

export interface ReimbursementApplication {
  staffId: string
  storeId: string
  type: string
  amount: number
  description: string
  receiptUrls?: string[]
}

// Apply for reimbursement
export async function applyReimbursement(data: ReimbursementApplication, editing?:{id:string;expectedVersion:string}) {
  const persist=async(options:any)=>{
   if(!editing)return prisma.reimbursement.create(options);
   return prisma.$transaction(async tx=>{const old=await tx.reimbursement.findFirst({where:{id:editing.id,staffId:data.staffId,storeId:data.storeId,status:'pending'}});if(!old)throw new Error('REQUEST_CHANGED_OR_NOT_OWNED');const changed=await tx.reimbursement.updateMany({where:{id:old.id,status:'pending',updatedAt:new Date(editing.expectedVersion)},data:options.data});if(changed.count!==1)throw new Error('REQUEST_CHANGED_REFRESH');await tx.financeAuditLog.create({data:{storeId:data.storeId,userId:data.staffId,action:'update',entityType:'reimbursement',entityId:old.id,description:'Owner revised pending reimbursement',oldValue:JSON.stringify(old),newValue:JSON.stringify(options.data)}});return tx.reimbursement.findUniqueOrThrow({where:{id:old.id}})})
  };
  return persist({
    data: {
      staffId: data.staffId,
      storeId: data.storeId,
      type: data.type,
      amount: data.amount,
      description: data.description,
      receiptUrls: data.receiptUrls ? JSON.stringify(data.receiptUrls) : null,
      status: 'pending'
    },
    include: {
      staff: { select: { id: true, name: true, employeeNumber: true } }
    }
  })
}

// Approve reimbursement
export async function approveReimbursement(reimbursementId: string, approverId: string) {
  const reimbursement = await prisma.reimbursement.findUnique({ where: { id: reimbursementId } })
  if (!reimbursement) throw new Error('Reimbursement not found')
  if (reimbursement.status !== 'pending') throw new Error('Reimbursement is not pending')

  const changed = await prisma.reimbursement.updateMany({ where: { id: reimbursementId, status: 'pending' }, data: { status: 'approved', approvedBy: approverId, approvedAt: new Date() } })
  if (changed.count !== 1) throw new Error('Reimbursement is no longer pending')
  return prisma.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } })
}

// Reject reimbursement
export async function rejectReimbursement(reimbursementId: string, approverId: string, reason: string) {
  const reimbursement = await prisma.reimbursement.findUnique({ where: { id: reimbursementId } })
  if (!reimbursement) throw new Error('Reimbursement not found')
  if (reimbursement.status !== 'pending') throw new Error('Reimbursement is not pending')

  const changed = await prisma.reimbursement.updateMany({ where: { id: reimbursementId, status: 'pending' }, data: { status: 'rejected', approvedBy: approverId, approvedAt: new Date(), rejectionReason: reason } })
  if (changed.count !== 1) throw new Error('Reimbursement is no longer pending')
  return prisma.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } })
}

// Mark as paid
export async function markAsPaid(reimbursementId: string, paidBy: string) {
  const reimbursement = await prisma.reimbursement.findUnique({ where: { id: reimbursementId } })
  if (!reimbursement) throw new Error('Reimbursement not found')
  if (reimbursement.status !== 'approved') throw new Error('Reimbursement must be approved before marking as paid')

  // Get reimbursement type name for expense category (type stores code, not id)
  const reimbType = await prisma.reimbursementType.findFirst({
    where: { storeId: reimbursement.storeId, code: reimbursement.type }
  })

  return prisma.$transaction(async (tx) => {
    // Update reimbursement status
    const changed = await tx.reimbursement.updateMany({
      where: { id: reimbursementId, status: 'approved' },
      data: {
        status: 'paid',
        paidAt: new Date(),
        paidBy
      }
    })

    if (changed.count !== 1) throw new Error('Reimbursement is no longer approved')
    // Auto-create expense record
    await tx.expense.create({
      data: {
        storeId: reimbursement.storeId,
        type: 'reimbursement',
        category: reimbType?.name || 'Ganti Rugi',
        amount: reimbursement.amount,
        description: `[Reimbursement] ${reimbursement.description}`,
        referenceId: reimbursementId,
        referenceType: 'reimbursement'
      }
    })

    return tx.reimbursement.findUniqueOrThrow({ where: { id: reimbursementId } })
  })
}

// Cancel reimbursement (by staff)
export async function cancelReimbursement(reimbursementId: string, staffId: string) {
  const reimbursement = await prisma.reimbursement.findUnique({ where: { id: reimbursementId } })
  if (!reimbursement) throw new Error('Reimbursement not found')
  if (reimbursement.staffId !== staffId) throw new Error('Not authorized')
  if (reimbursement.status !== 'pending') throw new Error('Only pending reimbursements can be cancelled')

  return prisma.reimbursement.update({
    where: { id: reimbursementId },
    data: { status: 'cancelled' }
  })
}

// Get staff reimbursements
export async function getStaffReimbursements(staffId: string, options?: {
  status?: string
  startDate?: Date
  endDate?: Date
}) {
  const where: any = { staffId }
  if (options?.status) where.status = options.status
  if (options?.startDate || options?.endDate) {
    where.createdAt = {}
    if (options.startDate) where.createdAt.gte = options.startDate
    if (options.endDate) where.createdAt.lte = options.endDate
  }

  return prisma.reimbursement.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  })
}

// Get store reimbursements
export async function getStoreReimbursements(storeId: string, options?: {
  status?: string
  staffId?: string
  startDate?: Date
  endDate?: Date
}) {
  const where: any = { storeId }
  if (options?.status) where.status = options.status
  if (options?.staffId) where.staffId = options.staffId
  if (options?.startDate || options?.endDate) {
    where.createdAt = {}
    if (options.startDate) where.createdAt.gte = options.startDate
    if (options.endDate) where.createdAt.lte = options.endDate
  }

  return prisma.reimbursement.findMany({
    where,
    include: {
      staff: { select: { id: true, name: true, employeeNumber: true } }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// Get reimbursement by ID
export async function getReimbursementById(reimbursementId: string) {
  return prisma.reimbursement.findUnique({
    where: { id: reimbursementId },
    include: {
      staff: { select: { id: true, name: true, employeeNumber: true, storeId: true } }
    }
  })
}

// Update receipt URLs
export async function updateReceiptUrls(reimbursementId: string, receiptUrls: string[]) {
  return prisma.reimbursement.update({
    where: { id: reimbursementId },
    data: {
      receiptUrls: JSON.stringify(receiptUrls)
    }
  })
}