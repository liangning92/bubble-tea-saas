import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as SupplierService from '../services/SupplierService'

const router = Router()

// Validation schemas
const createSupplierSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  note: z.string().optional()
})

// GET /api/suppliers
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, search, isActive } = req.query

    const suppliers = await SupplierService.getSuppliers({
      storeId: storeId as string || req.user!.storeId,
      search: search as string,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
    })

    res.json({
      code: 200,
      data: { list: suppliers },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get suppliers error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get suppliers' })
  }
})

// GET /api/suppliers/dropdown
router.get('/dropdown', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const suppliers = await SupplierService.getSuppliersForDropdown(storeId)

    res.json({
      code: 200,
      data: { list: suppliers },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get suppliers dropdown error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get suppliers' })
  }
})

// GET /api/suppliers/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const supplier = await SupplierService.getSupplierById(id)

    if (!supplier) {
      return res.status(404).json({ code: 404, message: 'Supplier not found' })
    }

    res.json({
      code: 200,
      data: supplier,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get supplier error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get supplier' })
  }
})

// GET /api/suppliers/:id/stats
router.get('/:id/stats', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const stats = await SupplierService.getSupplierStats(id)

    res.json({
      code: 200,
      data: stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get supplier stats error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get supplier stats' })
  }
})

// POST /api/suppliers
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createSupplierSchema), async (req: AuthRequest, res) => {
  try {
    const supplier = await SupplierService.createSupplier(req.body)

    res.status(201).json({
      code: 201,
      message: 'Supplier created',
      data: supplier,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create supplier error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create supplier' })
  }
})

// PUT /api/suppliers/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const supplier = await SupplierService.updateSupplier(id, req.body)

    res.json({
      code: 200,
      message: 'Supplier updated',
      data: supplier,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update supplier error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update supplier' })
  }
})

// DELETE /api/suppliers/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await SupplierService.deleteSupplier(id)

    res.json({
      code: 200,
      message: 'Supplier deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete supplier error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete supplier' })
  }
})

export { router as supplierRouter }