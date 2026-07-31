import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

// CLOUD API base URL
const CLOUD_API = 'https://api.aicube.online'

// POST /api/sync/connect
// Body: { phone: string, password: string }
// Returns: { storeId, storeName, tenantId, token } or error
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body
    if (!phone || !password) {
      return res.status(400).json({ code: 400, message: 'Phone and password required' })
    }

    // Step 1: Call cloud API to login
    const loginRes = await fetch(`${CLOUD_API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    })
    const loginData = await loginRes.json() as any

    // Cloud returns: { code, data: { token, user: { storeId } } }
    if (!loginRes.ok || !loginData?.data?.token) {
      return res.status(401).json({ code: 401, message: loginData?.message || 'Invalid credentials' })
    }

    const token = loginData.data.token as string
    const storeId = loginData.data.user?.storeId as string

    if (!storeId) {
      return res.status(401).json({ code: 401, message: 'Account not linked to any store' })
    }

    // Step 2: Get store details (storeName, tenantId)
    const storeRes = await fetch(`${CLOUD_API}/api/stores/${storeId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const storeInfo = storeRes.ok ? (await storeRes.json()) as any : null
    const store = storeInfo?.data || {}

    return res.json({
      code: 200,
      data: {
        storeId,
        storeName: store.name || 'My Store',
        tenantId: store.tenantId || 'default-tenant',
        token,
      }
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

    // Fetch all data (products/pos includes nested specs and addons)
    const [storeRes, categoriesRes, productsRes, addonsRes] = await Promise.all([
      fetch(`${CLOUD_API}/api/stores/${storeId}`, { headers }).catch(() => null),
      fetch(`${CLOUD_API}/api/categories?storeId=${storeId}`, { headers }).catch(() => null),
      fetch(`${CLOUD_API}/api/products/pos?storeId=${storeId}`, { headers }).catch(() => null),
      fetch(`${CLOUD_API}/api/addons?storeId=${storeId}`, { headers }).catch(() => null),
    ])

    const storeData = storeRes ? await storeRes.json() : null
    const categoriesData = categoriesRes ? await categoriesRes.json() : { data: [] }
    const productsData = productsRes ? await productsRes.json() : { data: { list: [] } }
    const addonsData = addonsRes ? await addonsRes.json() : { data: [] }

    const store = storeData?.data || {}
    // products/pos returns { data: { list: [...] } }
    const products = (productsData.data?.list || []) as any[]
    const categories = (categoriesData.data || []) as any[]
    const addons = (addonsData.data || []) as any[]

    // Write to local database in a transaction
    await prisma.$transaction(async (tx) => {
      // Clear existing data first (in case of re-sync)
      await tx.spec.deleteMany()
      await tx.productAddon.deleteMany()
      await tx.product.deleteMany()
      await tx.addon.deleteMany()
      await tx.category.deleteMany()
      await tx.config.deleteMany()
      await tx.store.deleteMany()
      await tx.tenant.deleteMany()
      await tx.user.deleteMany()

      // Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          id: store.tenantId || 'default-tenant',
          name: store.tenantName || store.name || 'My Store',
        }
      })

      // Create Store
      await tx.store.create({
        data: {
          id: storeId,
          tenantId: tenant.id,
          name: store.name || 'My Store',
          address: store.address || '',
          phone: store.phone || '',
        }
      })

      // Create Categories (schema: id, storeId, name, code?, sortOrder)
      for (const cat of categories) {
        await tx.category.create({
          data: {
            id: cat.id,
            storeId,
            name: cat.name,
            code: cat.code || cat.name?.substring(0, 3).toUpperCase() || 'MISC',
            sortOrder: cat.sortOrder || 0,
          }
        }).catch(() => {}) // Ignore if cloud returns duplicate category names
      }

      // Create Addons (schema: id, storeId, name, price(Int cents), priceAdjustment(Int), isFree)
      for (const addon of addons) {
        await tx.addon.create({
          data: {
            id: addon.id,
            storeId,
            name: addon.name,
            price: Math.round((addon.price || 0)),           // already in cents from cloud
            priceAdjustment: Math.round((addon.priceAdjustment || 0)),
            isFree: addon.isFree || false,
          }
        }).catch(() => {})
      }

      // Create Products with nested Specs and Addon relations
      let specCount = 0
      let addonRelationCount = 0

      for (const product of products) {
        // Generate unique product code
        const productCode = product.code || product.sku || `PROD-${product.id?.substring(0, 8).toUpperCase()}`

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
            costPrice: Math.round((product.costPrice || 0)),
            sortOrder: product.sortOrder || 0,
            tags: typeof product.tags === 'string' ? product.tags : JSON.stringify(product.tags || []),
          }
        }).catch(() => {})

        // Create Specs nested inside product (cloud returns specs array per product)
        // Cloud schema: { id, name, price, isDefault }
        // Local schema: { id, productId, name, price(Int), priceAdjustment(Int), isDefault }
        if (product.specs && Array.isArray(product.specs)) {
          for (const spec of product.specs) {
            await tx.spec.create({
              data: {
                id: spec.id,
                productId: product.id,
                name: spec.name,
                price: Math.round((spec.price || 0)),
                priceAdjustment: Math.round((spec.priceAdjustment || 0)),
                isDefault: spec.isDefault || false,
              }
            }).catch(() => {})
            specCount++
          }
        }

        // Create Product-Addon relations
        // Cloud returns addons array: [{ id, name, price, isFree }]
        if (product.addons && Array.isArray(product.addons)) {
          for (const pa of product.addons) {
            await tx.productAddon.create({
              data: {
                productId: product.id,
                addonId: pa.id,
                priceOverride: pa.price != null ? Math.round(pa.price) : null,
              }
            }).catch(() => {})
            addonRelationCount++
          }
        }
      }

      // Store counts for response
      ;(tx as any)._syncCounts = { specCount, addonRelationCount }
    })

    const counts = (prisma as any)._syncCounts || {}

    return res.json({
      code: 200,
      data: {
        storeName: store.name || 'My Store',
        categories: categories.length,
        products: products.length,
        specs: counts.specCount || 0,
        addons: counts.addonRelationCount || 0,
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
