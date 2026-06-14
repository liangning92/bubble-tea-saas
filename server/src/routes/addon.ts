import { Router } from 'express'
import { z } from 'zod'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'

const router = Router()

const createAddonSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1).max(50),
  price: z.number().int().optional().default(0),
  priceAdjustment: z.number().int().optional().default(0),
  isFree: z.boolean().optional().default(false)
})

const updateAddonSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  price: z.number().int().optional(),
  priceAdjustment: z.number().int().optional(),
  isFree: z.boolean().optional()
})

// GET /api/addons
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId } = req.query

    const where: any = {}
    if (storeId) where.storeId = storeId as string
    else if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
      where.storeId = req.user!.storeId
    }

    const addons = await prisma.addon.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    })

    res.json({
      code: 200,
      data: addons,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get addons error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get addons' })
  }
})

// GET /api/addons/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const addon = await prisma.addon.findUnique({
      where: { id },
      include: {
        productAddons: {
          include: {
            product: { select: { id: true, name: true } },
            spec: { select: { id: true, name: true } }
          }
        }
      }
    })

    if (!addon) {
      return res.status(404).json({ code: 404, message: 'Addon not found' })
    }

    res.json({
      code: 200,
      data: addon,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get addon error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get addon' })
  }
})

// POST /api/addons
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createAddonSchema), async (req: AuthRequest, res) => {
  try {
    const { storeId, name, price, priceAdjustment, isFree } = req.body

    const addon = await prisma.addon.create({
      data: {
        storeId,
        name,
        price,
        priceAdjustment,
        isFree
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Addon created',
      data: addon,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create addon error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create addon' })
  }
})

// PUT /api/addons/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, price, priceAdjustment, isFree } = req.body

    const addon = await prisma.addon.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(price !== undefined && { price }),
        ...(priceAdjustment !== undefined && { priceAdjustment }),
        ...(isFree !== undefined && { isFree })
      }
    })

    res.json({
      code: 200,
      message: 'Addon updated',
      data: addon,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update addon error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update addon' })
  }
})

// DELETE /api/addons/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    // Delete related ProductAddon records first
    await prisma.productAddon.deleteMany({ where: { addonId: id } })
    await prisma.addon.delete({ where: { id } })

    res.json({
      code: 200,
      message: 'Addon deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete addon error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete addon' })
  }
})

export { router as addonRouter }