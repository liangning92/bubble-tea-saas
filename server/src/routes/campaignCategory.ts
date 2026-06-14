import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as CampaignCategoryService from '../services/CampaignCategoryService'

const router = Router()

const createCategorySchema = z.object({
  storeId: z.string(),
  name: z.string().min(1).max(50),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().optional().default(0)
})

const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().optional()
})

// GET /api/marketing/campaign-categories
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const categories = await CampaignCategoryService.getCampaignCategories(storeId)
    res.json({ code: 200, data: { list: categories }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get campaign categories error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get campaign categories' })
  }
})

// GET /api/marketing/campaign-categories/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const category = await CampaignCategoryService.getCampaignCategory(req.params.id)
    if (!category) {
      return res.status(404).json({ code: 404, message: 'Category not found' })
    }
    res.json({ code: 200, data: category, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get campaign category error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get campaign category' })
  }
})

// POST /api/marketing/campaign-categories
router.post('/', authenticate, authorize('admin'), validateBody(createCategorySchema), async (req: AuthRequest, res) => {
  try {
    const category = await CampaignCategoryService.createCampaignCategory(req.body)
    res.status(201).json({ code: 201, message: 'Category created', data: category, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Create campaign category error:', error)
    if (error.code === 'P2002') {
      return res.status(400).json({ code: 400, message: 'Category name already exists for this store' })
    }
    res.status(500).json({ code: 500, message: error.message || 'Failed to create campaign category' })
  }
})

// PUT /api/marketing/campaign-categories/:id
router.put('/:id', authenticate, authorize('admin'), validateBody(updateCategorySchema), async (req: AuthRequest, res) => {
  try {
    const category = await CampaignCategoryService.updateCampaignCategory(req.params.id, req.body)
    res.json({ code: 200, message: 'Category updated', data: category, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Update campaign category error:', error)
    if (error.code === 'P2025') {
      return res.status(404).json({ code: 404, message: 'Category not found' })
    }
    res.status(500).json({ code: 500, message: error.message || 'Failed to update campaign category' })
  }
})

// DELETE /api/marketing/campaign-categories/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await CampaignCategoryService.deleteCampaignCategory(req.params.id)
    res.json({ code: 200, message: 'Category deleted', timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Delete campaign category error:', error)
    if (error.message === 'Category not found') {
      return res.status(404).json({ code: 404, message: error.message })
    }
    if (error.message === 'Cannot delete built-in category') {
      return res.status(400).json({ code: 400, message: error.message })
    }
    if (error.message === 'Cannot delete category that is used by campaigns') {
      return res.status(400).json({ code: 400, message: error.message })
    }
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete campaign category' })
  }
})

// POST /api/marketing/campaign-categories/seed - Seed default categories
router.post('/seed', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.body.storeId || req.user!.storeId
    const created = await CampaignCategoryService.seedDefaultCategories(storeId)
    res.json({ code: 200, message: 'Default categories seeded', data: { created }, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Seed campaign categories error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to seed categories' })
  }
})

export { router as campaignCategoryRouter }
