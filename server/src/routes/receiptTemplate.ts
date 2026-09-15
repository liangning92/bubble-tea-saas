import { Router } from 'express'
import { z } from 'zod'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import { seedDefaultReceiptTemplate } from '../services/HygieneService'

const router = Router()

// Schema for receipt block
const receiptBlockSchema = z.object({
  id: z.string(),
  type: z.enum([
    'logo', 'header', 'storeInfo', 'orderInfo', 'items',
    'subtotal', 'tax', 'total', 'paymentInfo',
    'qrCode', 'barcode', 'footer', 'divider', 'customText'
  ]),
  enabled: z.boolean(),
  order: z.number(),
  style: z.object({
    bold: z.boolean().optional(),
    fontSize: z.enum(['small', 'normal', 'large']).optional(),
    align: z.enum(['left', 'center', 'right']).optional()
  }),
  config: z.record(z.any())
})

// Template content schema
const templateContentSchema = z.object({
  version: z.number().optional().default(1),
  blocks: z.array(receiptBlockSchema)
})

// Receipt template schema
const createReceiptTemplateSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1).max(100),
  content: z.string(), // JSON string of template content
  isDefault: z.boolean().optional()
})

const updateReceiptTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  content: z.string().optional(),
  isDefault: z.boolean().optional()
})

// Helper: validate template content
function validateTemplateContent(content: string): boolean {
  try {
    const parsed = JSON.parse(content)
    const result = templateContentSchema.safeParse(parsed)
    return result.success
  } catch {
    return false
  }
}

// GET /api/receipt-templates?storeId=
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId } = req.query
    if (!storeId || typeof storeId !== 'string') {
      res.status(400).json({ code: 400, message: 'storeId is required' })
      return
    }

    const templates = await prisma.receiptTemplate.findMany({
      where: { storeId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    })

    res.json({
      code: 200,
      data: templates,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('List receipt templates error:', error)
    res.status(500).json({ code: 500, message: 'Failed to list receipt templates' })
  }
})

// GET /api/receipt-templates/default?storeId=
router.get('/default', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId } = req.query
    if (!storeId || typeof storeId !== 'string') {
      res.status(400).json({ code: 400, message: 'storeId is required' })
      return
    }

    const template = await prisma.receiptTemplate.findFirst({
      where: { storeId, isDefault: true }
    })

    res.json({
      code: 200,
      data: template,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get default receipt template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get default template' })
  }
})

// GET /api/receipt-templates/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const template = await prisma.receiptTemplate.findUnique({
      where: { id }
    })

    if (!template) {
      res.status(404).json({ code: 404, message: 'Template not found' })
      return
    }

    res.json({
      code: 200,
      data: template,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get receipt template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get template' })
  }
})

// POST /api/receipt-templates
router.post('/', authenticate, validateBody(createReceiptTemplateSchema), async (req: AuthRequest, res) => {
  try {
    const { storeId, name, content, isDefault } = req.body

    // Validate template content JSON
    if (!validateTemplateContent(content)) {
      res.status(400).json({ code: 400, message: 'Invalid template content format' })
      return
    }

    // Check if name already exists for this store
    const existing = await prisma.receiptTemplate.findUnique({
      where: { storeId_name: { storeId, name } }
    })
    if (existing) {
      res.status(409).json({ code: 409, message: 'Template name already exists for this store' })
      return
    }

    // If isDefault=true, unset other defaults first
    if (isDefault) {
      await prisma.receiptTemplate.updateMany({
        where: { storeId, isDefault: true },
        data: { isDefault: false }
      })
    }

    const template = await prisma.receiptTemplate.create({
      data: { storeId, name, content, isDefault: isDefault ?? false }
    })

    res.json({
      code: 200,
      data: template,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create receipt template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create template' })
  }
})

// PUT /api/receipt-templates/:id
router.put('/:id', authenticate, validateBody(updateReceiptTemplateSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, content, isDefault } = req.body

    const existing = await prisma.receiptTemplate.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ code: 404, message: 'Template not found' })
      return
    }

    // Validate template content if provided
    if (content !== undefined && !validateTemplateContent(content)) {
      res.status(400).json({ code: 400, message: 'Invalid template content format' })
      return
    }

    // Check name uniqueness if name is being changed
    if (name && name !== existing.name) {
      const nameConflict = await prisma.receiptTemplate.findUnique({
        where: { storeId_name: { storeId: existing.storeId, name } }
      })
      if (nameConflict) {
        res.status(409).json({ code: 409, message: 'Template name already exists for this store' })
        return
      }
    }

    // If isDefault=true, unset other defaults first
    if (isDefault) {
      await prisma.receiptTemplate.updateMany({
        where: { storeId: existing.storeId, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      })
    }

    const template = await prisma.receiptTemplate.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(content && { content }),
        ...(isDefault !== undefined && { isDefault })
      }
    })

    res.json({
      code: 200,
      data: template,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update receipt template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update template' })
  }
})

// PUT /api/receipt-templates/:id/set-default
router.put('/:id/set-default', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.receiptTemplate.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ code: 404, message: 'Template not found' })
      return
    }

    // Unset all defaults for this store, then set this one
    await prisma.$transaction([
      prisma.receiptTemplate.updateMany({
        where: { storeId: existing.storeId, isDefault: true },
        data: { isDefault: false }
      }),
      prisma.receiptTemplate.update({
        where: { id },
        data: { isDefault: true }
      })
    ])

    res.json({
      code: 200,
      data: { id, isDefault: true },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Set default receipt template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to set default template' })
  }
})

// DELETE /api/receipt-templates/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.receiptTemplate.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ code: 404, message: 'Template not found' })
      return
    }

    await prisma.receiptTemplate.delete({ where: { id } })

    res.json({
      code: 200,
      data: { id },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete receipt template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete template' })
  }
})

// POST /api/receipt-templates/seed - 初始化默认模板
router.post('/seed', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const created = await seedDefaultReceiptTemplate(storeId)
    res.json({
      code: 200,
      data: { created, message: created.length > 0 ? 'Default template created' : 'Template already exists' },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Seed receipt template error:', error)
    res.status(500).json({ code: 500, message: 'Failed to seed default template' })
  }
})

export { router as receiptTemplateRouter }
