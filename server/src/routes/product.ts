import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as ProductService from '../services/ProductService'

const router = Router()

// Validation schemas
const createProductSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string(),
  image: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  specs: z.array(z.object({
    name: z.string(),
    price: z.number().int().min(0)
  })).optional(),
  addons: z.array(z.object({
    addonId: z.string(),
    price: z.number().int().optional()
  })).optional(),
  bomItems: z.array(z.object({
    inventoryId: z.string(),
    quantity: z.number().positive()
  })).optional()
})

const updateProductSchema = createProductSchema.partial()

const batchStatusSchema = z.object({
  productIds: z.array(z.string()),
  status: z.string()
})

// GET /api/products
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, categoryId, status, search, includeDeleted } = req.query

    const products = await ProductService.getProducts({
      storeId: storeId as string || req.user!.storeId,
      categoryId: categoryId as string,
      status: status as string,
      search: search as string,
      includeDeleted: includeDeleted === 'true'
    })

    res.json({
      code: 200,
      data: { list: products },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get products error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get products' })
  }
})

// GET /api/products/pos - Products for POS (simplified format)
router.get('/pos', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const products = await ProductService.getProductsForPOS(storeId)

    res.json({
      code: 200,
      data: { list: products },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get POS products error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get POS products' })
  }
})

// GET /api/products/barcode/:barcode - Get product by barcode
router.get('/barcode/:barcode', authenticate, async (req: AuthRequest, res) => {
  try {
    const { barcode } = req.params
    const storeId = req.query.storeId as string || req.user!.storeId
    const product = await ProductService.getProductByBarcode(barcode, storeId)

    if (!product) {
      return res.status(404).json({ code: 404, message: 'Product not found' })
    }

    res.json({
      code: 200,
      data: product,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get product by barcode error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get product by barcode' })
  }
})

// GET /api/products/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const product = await ProductService.getProductById(id)

    if (!product) {
      return res.status(404).json({ code: 404, message: 'Product not found' })
    }

    res.json({
      code: 200,
      data: product,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get product error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get product' })
  }
})

// GET /api/products/:id/cost - Get product cost detail
router.get('/:id/cost', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const costDetail = await ProductService.getProductCostDetail(id)

    if (!costDetail) {
      return res.status(404).json({ code: 404, message: 'Product not found' })
    }

    res.json({
      code: 200,
      data: costDetail,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get product cost error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get product cost' })
  }
})

// POST /api/products
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createProductSchema), async (req: AuthRequest, res) => {
  try {
    const product = await ProductService.createProduct(req.body)

    res.status(201).json({
      code: 201,
      message: 'Product created',
      data: product,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create product error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create product' })
  }
})

// PUT /api/products/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    console.log('PUT /api/products/:id called with:', id, req.body)
    const product = await ProductService.updateProduct(id, req.body)

    res.json({
      code: 200,
      message: 'Product updated',
      data: product,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Update product error:', error.message || error)
    res.status(500).json({
      code: 500,
      message: error.message || 'Failed to update product',
      error: error.stack || error.toString()
    })
  }
})

// DELETE /api/products/:id (soft delete)
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await ProductService.deleteProduct(id)

    res.json({
      code: 200,
      message: 'Product deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete product error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete product' })
  }
})

// PUT /api/products/:id/status - Update product status
router.put('/:id/status', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    await ProductService.updateProduct(id, { status })

    res.json({
      code: 200,
      message: 'Product status updated',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update product status error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update product status' })
  }
})

// POST /api/products/:id/restore - Restore deleted product
router.post('/:id/restore', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const product = await ProductService.restoreProduct(id)

    res.json({
      code: 200,
      message: 'Product restored',
      data: product,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Restore product error:', error)
    res.status(500).json({ code: 500, message: 'Failed to restore product' })
  }
})

// POST /api/products/batch-status - Batch update status
router.post('/batch-status', authenticate, authorize('admin', 'manager'), validateBody(batchStatusSchema), async (req: AuthRequest, res) => {
  try {
    const { productIds, status } = req.body
    await ProductService.batchUpdateStatus(productIds, status)

    res.json({
      code: 200,
      message: `Updated ${productIds.length} products`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Batch update error:', error)
    res.status(500).json({ code: 500, message: 'Failed to batch update' })
  }
})

// POST /api/products/recalculate-costs - Recalculate all products cost
router.post('/recalculate-costs', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const results = await ProductService.recalculateAllCosts(storeId)

    res.json({
      code: 200,
      message: `Recalculated ${results.length} products`,
      data: results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Recalculate costs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to recalculate costs' })
  }
})

// PUT /api/products/:id/bom - Update product BOM (recipe)
const bomUpdateSchema = z.object({
  bomItems: z.array(z.object({
    inventoryId: z.string(),
    quantity: z.number().min(0)
  }))
})

router.put('/:id/bom', authenticate, authorize('admin', 'manager'), validateBody(bomUpdateSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { bomItems } = req.body
    const result = await ProductService.updateProductBom(id, bomItems)

    res.json({
      code: 200,
      message: 'Product BOM updated',
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Update product BOM error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update product BOM' })
  }
})

export { router as productRouter }