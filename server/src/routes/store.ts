import { Router } from 'express'
import prisma from '../config/database'

const router = Router()

// POST /api/stores - Create a new store with tenant
router.post('/', async (req, res) => {
  try {
    const { name, address, phone } = req.body

    // Create tenant first
    const tenant = await prisma.tenant.create({
      data: {
        name: name || 'My Store'
      }
    })

    // Create store with tenant
    const store = await prisma.store.create({
      data: {
        tenantId: tenant.id,
        name: name || 'My Store',
        address: address || '',
        phone: phone || ''
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Store created successfully',
      data: store
    })
  } catch (error) {
    console.error('Create store error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create store' })
  }
})

// GET /api/stores/:id - Get store by ID
router.get('/:id', async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.params.id }
    })

    if (!store) {
      return res.status(404).json({ code: 404, message: 'Store not found' })
    }

    res.json({
      code: 200,
      data: store
    })
  } catch (error) {
    console.error('Get store error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get store' })
  }
})

export { router as storeRouter }