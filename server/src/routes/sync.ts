import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 5000,  // 5s max wait
    timeout: 10000   // 10s max query
  }
})

// CLOUD API base URL
const CLOUD_API = 'https://api.aicube.online'

// POST /api/sync/connect
// Body: { phone: string, password: string }
// Returns: { storeId, storeName, tenantId, token, phone, passwordHash }
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
    const cloudUser = loginData.data.user
    const storeId = cloudUser?.storeId as string
    const passwordHash = loginData.data.passwordHash as string | undefined

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
        phone,          // needed to create local User
        passwordHash,   // bcrypt hash from cloud, needed for local User
      }
    })
  } catch (err: any) {
    return res.status(500).json({ code: 500, message: err.message || 'Connection failed' })
  }
})

// POST /api/sync/full
// Body: { storeId, token, phone, passwordHash }
// Fetches all data from cloud and writes to local SQLite
// Also creates local User record so login works after wizard
router.post('/full', async (req: Request, res: Response) => {
  try {
    const { storeId, token, phone, passwordHash } = req.body
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

    // SQLite FK constraints cause issues with delete order,
    // so disable FK checks before clearing and re-enable after
    let fkDisabled = false
    try {
      await prisma.$executeRaw`PRAGMA foreign_keys = OFF`
      fkDisabled = true

      const syncResult = await prisma.$transaction(async (tx) => {
        // Clear existing data first (in case of re-sync)
        // Order matters: children before parents, then junction tables
        await tx.spec.deleteMany()
        await tx.productAddon.deleteMany()
        await tx.product.deleteMany()
        await tx.addon.deleteMany()
        await tx.category.deleteMany()
        await tx.config.deleteMany()
        await tx.staff.deleteMany()
        await tx.user.deleteMany()
        await tx.store.deleteMany()
        await tx.tenant.deleteMany()

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

        // Create local User record so login works after wizard
        // phone and passwordHash come from /connect response
        if (phone && passwordHash) {
          await tx.user.create({
            data: {
              phone,
              password: passwordHash,   // bcrypt hash from cloud
              role: 'admin',
              storeId,
            }
          }).catch(() => {})
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
          }).catch(() => {})
        }

        // Create Addons
        for (const addon of addons) {
          await tx.addon.create({
            data: {
              id: addon.id,
              storeId,
              name: addon.name,
              price: Math.round((addon.price || 0)),
              priceAdjustment: Math.round((addon.priceAdjustment || 0)),
              isFree: addon.isFree || false,
            }
          }).catch(() => {})
        }

        // Create Products with nested Specs and Addon relations
        let specCount = 0
        let addonRelationCount = 0

        for (const product of products) {
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

          // Create Specs nested inside product
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

        return { specCount, addonRelationCount }
      })

      return res.json({
        code: 200,
        data: {
          storeName: store.name || 'My Store',
          categories: categories.length,
          products: products.length,
          specs: syncResult.specCount,
          addons: syncResult.addonRelationCount,
        }
      })
    } finally {
      if (fkDisabled) {
        await prisma.$executeRaw`PRAGMA foreign_keys = ON`.catch(() => {})
      }
    }
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
