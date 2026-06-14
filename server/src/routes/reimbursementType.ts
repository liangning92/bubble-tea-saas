import { Router } from 'express'
import { z } from 'zod'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'

const router = Router()

// Validation schemas
const createReimbursementTypeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional().default('#EC6D88'),
  icon: z.string().optional(),
  maxAmount: z.number().optional().nullable(),
  requiresReceipt: z.boolean().optional().default(true),
  sortOrder: z.number().optional().default(0)
})

const updateReimbursementTypeSchema = createReimbursementTypeSchema.partial()

// GET /api/reimbursement-types - Get all reimbursement types for store
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const reimbursementTypes = await prisma.reimbursementType.findMany({
      where: { storeId, isActive: true },
      orderBy: { sortOrder: 'asc' }
    })

    res.json({
      code: 200,
      data: reimbursementTypes,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get reimbursement types error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get reimbursement types' })
  }
})

// GET /api/reimbursement-types/all - Get all including inactive
router.get('/all', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const reimbursementTypes = await prisma.reimbursementType.findMany({
      where: { storeId },
      orderBy: { sortOrder: 'asc' }
    })

    res.json({
      code: 200,
      data: reimbursementTypes,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get all reimbursement types error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get reimbursement types' })
  }
})

// POST /api/reimbursement-types - Create a new reimbursement type
router.post('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const validated = createReimbursementTypeSchema.parse(req.body)

    // Check if code already exists
    const existing = await prisma.reimbursementType.findUnique({
      where: { storeId_code: { storeId, code: validated.code } }
    })

    if (existing) {
      return res.status(400).json({ code: 400, message: 'Reimbursement type code already exists' })
    }

    const reimbursementType = await prisma.reimbursementType.create({
      data: { ...validated, storeId } as any
    })

    res.status(201).json({
      code: 201,
      message: 'Reimbursement type created',
      data: reimbursementType,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Create reimbursement type error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to create reimbursement type' })
  }
})

// PUT /api/reimbursement-types/:id - Update a reimbursement type
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const validated = updateReimbursementTypeSchema.parse(req.body)

    const reimbursementType = await prisma.reimbursementType.update({
      where: { id },
      data: validated
    })

    res.json({
      code: 200,
      message: 'Reimbursement type updated',
      data: reimbursementType,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Update reimbursement type error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to update reimbursement type' })
  }
})

// DELETE /api/reimbursement-types/:id - Soft delete (deactivate)
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const reimbursementType = await prisma.reimbursementType.update({
      where: { id },
      data: { isActive: false }
    })

    res.json({
      code: 200,
      message: 'Reimbursement type deactivated',
      data: reimbursementType,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Delete reimbursement type error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to delete reimbursement type' })
  }
})

// Seed default reimbursement types
router.post('/seed', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const defaultTypes = [
      { code: 'transportation', name: 'Transportasi', color: '#3B82F6', maxAmount: 500000, requiresReceipt: true, sortOrder: 1 },
      { code: 'meals', name: 'Makan', color: '#F59E0B', maxAmount: 150000, requiresReceipt: true, sortOrder: 2 },
      { code: 'communication', name: 'Komunikasi', color: '#8B5CF6', maxAmount: 200000, requiresReceipt: false, sortOrder: 3 },
      { code: 'medical', name: 'Medis', color: '#EF4444', maxAmount: null, requiresReceipt: true, sortOrder: 4 },
      { code: 'office', name: 'Perlengkapan Kantor', color: '#10B981', maxAmount: 300000, requiresReceipt: true, sortOrder: 5 },
      { code: 'other', name: 'Lainnya', color: '#6B7280', maxAmount: null, requiresReceipt: true, sortOrder: 6 }
    ]

    const created = []
    for (const type of defaultTypes) {
      const existing = await prisma.reimbursementType.findUnique({
        where: { storeId_code: { storeId, code: type.code } }
      })
      if (!existing) {
        const createdType = await prisma.reimbursementType.create({
          data: { ...type, storeId }
        })
        created.push(createdType)
      }
    }

    res.json({
      code: 201,
      message: `Seeded ${created.length} reimbursement types`,
      data: created,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Seed reimbursement types error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to seed reimbursement types' })
  }
})

export { router as reimbursementTypeRouter }