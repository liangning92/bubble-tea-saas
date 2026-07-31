import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

// CLOUD API base URL
const CLOUD_API = 'https://api.aicube.online'

// POST /api/sync/connect
// Body: { phone: string, password: string }
// Returns: { storeId, storeName, tenantId } or error
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body
    if (!phone || !password) {
      return res.status(400).json({ code: 400, message: 'Phone and password required' })
    }

    // Call cloud API to login
    const cloudRes = await fetch(`${CLOUD_API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    })
    const cloudData = await cloudRes.json() as { token?: string; storeId?: string; storeName?: string; tenantId?: string; role?: string; message?: string }

    if (!cloudRes.ok || !cloudData.token) {
      return res.status(401).json({ code: 401, message: cloudData.message || 'Invalid credentials' })
    }

    const { token, storeId, storeName, tenantId, role } = cloudData

    return res.json({
      code: 200,
      data: { storeId, storeName, tenantId, role, token }
    })
  } catch (err: any) {
    return res.status(500).json({ code: 500, message: err.message || 'Connection failed' })
  }
})

// POST /api/sync/full
// Body: { storeId: string, token: string }
// Fetches all data from cloud for this store and writes to local SQLite
router.post('/full', async (req: Request, res: Response) => {
  try {
    const { storeId, token } = req.body
    if (!storeId || !token) {
      return res.status(400).json({ code: 400, message: 'storeId and token required' })
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }

    // Fetch all data in parallel
    const [storeRes, categoriesRes, productsRes, specsRes, addonsRes, configRes] = await Promise.all([
      fetch(`${CLOUD_API}/api/stores/${storeId}`, { headers }).catch(() => null),
      fetch(`${CLOUD_API}/api/categories?storeId=${storeId}`, { headers }).catch(() => null),
      fetch(`${CLOUD_API}/api/products/pos?storeId=${storeId}`, { headers }).catch(() => null),
      fetch(`${CLOUD_API}/api/specs?storeId=${storeId}`, { headers }).catch(() => null),
      fetch(`${CLOUD_API}/api/addons?storeId=${storeId}`, { headers }).catch(() => null),
      fetch(`${CLOUD_API}/api/config/${storeId}`, { headers }).catch(() => null),
    ])

    // Parse responses
    const storeData = storeRes ? await storeRes.json() : null
    const categoriesData = categoriesRes ? await categoriesRes.json() : { data: [] }
    const productsData = productsRes ? await productsRes.json() : { data: [] }
    const specsData = specsRes ? await specsRes.json() : { data: [] }
    const addonsData = addonsRes ? await addonsRes.json() : { data: [] }
    const configData = configRes ? await configRes.json() : { data: {} }

    const store = storeData?.data || storeData as any || {}
    const categories = (categoriesData.data || []) as any[]
    const products = (productsData.data || []) as any[]
    const specs = (specsData.data || []) as any[]
    const addons = (addonsData.data || []) as any[]
    const configs = (configData.data || {}) as Record<string, any>

    // Write to local database in a transaction
    await prisma.$transaction(async (tx) => {
      // Clear existing data first (in case of re-sync)
      await tx.store.deleteMany()
      await tx.tenant.deleteMany()
      await tx.user.deleteMany()
      await tx.category.deleteMany()
      await tx.product.deleteMany()
      await tx.addon.deleteMany()
      await tx.config.deleteMany()

      // Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          id: store?.tenantId || 'default-tenant',
          name: store?.tenantName || store?.name || 'My Store',
        }
      })

      // Create Store
      await tx.store.create({
        data: {
          id: storeId,
          tenantId: tenant.id,
          name: store?.name || 'My Store',
          address: store?.address || '',
          phone: store?.phone || '',
        }
      })

      // Create Config entries
      for (const [key, value] of Object.entries(configs)) {
        if (value !== undefined && value !== null) {
          await tx.config.create({
            data: {
              storeId,
              key,
              value: String(value),
              category: 'pos',
            }
          })
        }
      }

      // Create Categories
      for (const cat of categories) {
        await tx.category.create({
          data: {
            id: cat.id,
            storeId,
            name: cat.name,
            code: cat.code || cat.name?.substring(0, 3).toUpperCase() || 'MISC',
            sortOrder: cat.sortOrder || 0,
          }
        })
      }

      // Create Addons
      for (const addon of addons) {
        await tx.addon.create({
          data: {
            id: addon.id,
            storeId,
            name: addon.name,
            price: Math.round((addon.price || 0) * 100), // convert to cents
            priceAdjustment: Math.round((addon.priceAdjustment || 0) * 100),
            isFree: addon.isFree || false,
          }
        })
      }

      // Create Products with their Specs and Addon relations
      for (const product of products) {
        // Generate a unique product code
        const productCode = product.sku || product.code || `PROD-${product.id?.substring(0, 8).toUpperCase() || Math.random().toString(36).substring(2, 10).toUpperCase()}`

        await tx.product.create({
          data: {
            id: product.id,
            storeId,
            code: productCode,
            categoryId: product.categoryId,
            name: product.name,
            description: product.description || '',
            image: product.image || '',
            status: product.status || 'active',
            costPrice: Math.round((product.costPrice || 0) * 100),
            sortOrder: product.sortOrder || 0,
            tags: product.tags || '[]',
          }
        })

        // Create Specs for this product
        if (specs && specs.length > 0) {
          const productSpecs = specs.filter((s: any) => s.productId === product.id)
          for (const spec of productSpecs) {
            await tx.spec.create({
              data: {
                id: spec.id,
                productId: product.id,
                name: spec.name,
                price: Math.round((spec.price || 0) * 100), // cents
                priceAdjustment: Math.round((spec.priceAdjustment || 0) * 100),
                isDefault: spec.isDefault || false,
              }
            })
          }
        }

        // Create Product-Addon relations
        if (product.addonIds && product.addonIds.length > 0) {
          for (const addonId of product.addonIds) {
            await tx.productAddon.create({
              data: {
                productId: product.id,
                addonId,
              }
            }).catch(() => {}) // Ignore if already exists
          }
        }
      }
    })

    return res.json({
      code: 200,
      data: {
        storeName: store?.name || 'My Store',
        categories: categories.length,
        products: products.length,
        specs: specs.length,
        addons: addons.length,
      }
    })
  } catch (err: any) {
    console.error('Sync full error:', err)
    return res.status(500).json({ code: 500, message: err.message || 'Sync failed' })
  }
})

// GET /api/sync/status
// Check if store is set up (has data)
router.get('/status', async (req: Request, res: Response) => {
  try {
    const storeCount = await prisma.store.count()
    res.json({
      code: 200,
      data: {
        isSetUp: storeCount > 0,
        storeCount,
      }
    })
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

export default router
