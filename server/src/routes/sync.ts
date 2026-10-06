import { clearOrdinarySyncedConfigs } from '../services/TrainingLibraryStore'
import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { config } from '../config/env'
import { authenticate, AuthRequest, canAccessStore } from '../middlewares/auth'
import { z } from 'zod'

const router = Router()
const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 5000,  // 5s max wait
    timeout: 10000   // 10s max query
  }
})

// CLOUD API base URL
const CLOUD_API = 'https://api.aicube.online'

const syncConnectLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })
const consumedSyncTickets = new Map<string, number>()

// POST /api/sync/connect
// Body: { phone: string, password: string }
// Returns a short-lived local ticket after cloud credentials are verified.
router.post('/connect', syncConnectLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = z.object({
      phone: z.string().min(10).max(15),
      password: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 72)
    }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ code: 400, message: 'Invalid credentials request' })
    const { phone, password } = parsed.data

    // Step 1: Call cloud API to login
    const loginRes = await fetch(`${CLOUD_API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
      signal: AbortSignal.timeout(10000)
    })
    const loginData = await loginRes.json() as any

    // Cloud returns: { code, data: { token, user: { storeId } } }
    if (!loginRes.ok || !loginData?.data?.token) {
      return res.status(401).json({ code: 401, message: loginData?.message || 'Invalid credentials' })
    }

    const token = loginData.data.token as string
    const cloudUser = loginData.data.user
    const storeId = cloudUser?.storeId as string

    if (!storeId) {
      return res.status(401).json({ code: 401, message: 'Account not linked to any store' })
    }

    // Step 2: Get store details (storeName, tenantId)
    const storeRes = await fetch(`${CLOUD_API}/api/stores/${storeId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000)
    })
    if (!storeRes.ok) return res.status(403).json({ code: 403, message: 'Account cannot access its store' })
    const storeInfo = storeRes.ok ? (await storeRes.json()) as any : null
    const store = storeInfo?.data || {}
    if (store.id !== storeId) return res.status(403).json({ code: 403, message: 'Store authorization failed' })

    const syncTicket = jwt.sign({
      purpose: 'pos-full-sync',
      jti: randomUUID(),
      storeId,
      cloudToken: token
    }, config.jwt.secret, { expiresIn: '5m' })

    return res.json({
      code: 200,
      data: {
        storeId,
        storeName: store.name || 'My Store',
        tenantId: store.tenantId || 'default-tenant',
        syncTicket,
      }
    })
  } catch (err: any) {
    return res.status(500).json({ code: 500, message: err.message || 'Connection failed' })
  }
})

// POST /api/sync/full
// Body: { syncTicket }
// Fetches all data from cloud and writes to local SQLite
router.post('/full', async (req: Request, res: Response) => {
  try {
    const { syncTicket } = req.body
    if (typeof syncTicket !== 'string') {
      return res.status(400).json({ code: 400, message: 'Sync ticket required' })
    }
    let ticket: any
    try {
      ticket = jwt.verify(syncTicket, config.jwt.secret)
    } catch {
      return res.status(401).json({ code: 401, message: 'Invalid or expired sync ticket' })
    }
    if (ticket.purpose !== 'pos-full-sync' || !ticket.jti || !ticket.storeId || !ticket.cloudToken) {
      return res.status(401).json({ code: 401, message: 'Invalid sync ticket' })
    }
    const now = Math.floor(Date.now() / 1000)
    for (const [jti, expiresAt] of consumedSyncTickets) {
      if (expiresAt <= now) consumedSyncTickets.delete(jti)
    }
    if (consumedSyncTickets.has(ticket.jti)) {
      return res.status(409).json({ code: 409, message: 'Sync ticket has already been used' })
    }
    if (typeof ticket.exp !== 'number' || ticket.exp <= now) {
      return res.status(401).json({ code: 401, message: 'Invalid or expired sync ticket' })
    }
    consumedSyncTickets.set(ticket.jti, ticket.exp)
    const storeId = ticket.storeId as string
    const token = ticket.cloudToken as string

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }

    // Fetch all data (products/pos includes nested specs and addons)
    const [storeRes, categoriesRes, productsRes, addonsRes] = await Promise.all([
      fetch(`${CLOUD_API}/api/stores/${storeId}`, { headers }),
      fetch(`${CLOUD_API}/api/categories?storeId=${encodeURIComponent(storeId)}`, { headers }),
      fetch(`${CLOUD_API}/api/products/pos?storeId=${encodeURIComponent(storeId)}`, { headers }),
      fetch(`${CLOUD_API}/api/addons?storeId=${encodeURIComponent(storeId)}`, { headers }),
    ])
    if (![storeRes, categoriesRes, productsRes, addonsRes].every(response => response.ok)) {
      return res.status(502).json({ code: 502, message: 'Could not fetch complete store data; local data was not changed' })
    }

    const storeData = storeRes ? await storeRes.json() as any : null
    const categoriesData = categoriesRes ? await categoriesRes.json() as any : { data: [] }
    const productsData = productsRes ? await productsRes.json() as any : { data: { list: [] } }
    const addonsData = addonsRes ? await addonsRes.json() as any : { data: [] }

    const store = storeData?.data || {}
    if (store.id !== storeId) {
      return res.status(502).json({ code: 502, message: 'Cloud returned a different store; local data was not changed' })
    }
    const existingOtherStore = await prisma.store.findFirst({ where: { id: { not: storeId } }, select: { id: true } })
    if (existingOtherStore) {
      return res.status(409).json({ code: 409, message: 'This POS database is already linked to another store' })
    }
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
        await clearOrdinarySyncedConfigs(tx)

        // Create Tenant
        const tenantId = store.tenantId || 'default-tenant'
        await tx.tenant.upsert({
          where: { id: tenantId },
          create: { id: tenantId, name: store.tenantName || store.name || 'My Store' },
          update: { name: store.tenantName || store.name || 'My Store' }
        })

        // Create Store
        await tx.store.upsert({
          where: { id: storeId },
          create: {
            id: storeId,
            tenantId,
            name: store.name || 'My Store',
            address: store.address || '',
            phone: store.phone || '',
          },
          update: { tenantId, name: store.name || 'My Store', address: store.address || '', phone: store.phone || '' }
        })

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
      }
    })
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

// POST /api/sync/order
// Receives an order from local POS and upserts into cloud DB.
// Called by local server after creating an order locally.
// Uses order ID as unique key so duplicate syncs are idempotent.
router.post('/order', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { order } = req.body
    if (!order?.id || !order?.storeId) {
      return res.status(400).json({ code: 400, message: 'order.id and order.storeId required' })
    }
    if (!req.user || !canAccessStore(req.user, order.storeId)) {
      return res.status(403).json({ code: 403, message: 'Access denied: Store mismatch' })
    }

    // Upsert order - idempotent, safe to retry
    await prisma.$transaction(async (tx) => {
      // Delete existing items for this order (clean slate for items)
      await tx.orderItem.deleteMany({ where: { orderId: order.id } }).catch(() => {})

      // Upsert the order
      await tx.order.upsert({
        where: { id: order.id },
        create: {
          id: order.id,
          storeId: order.storeId,
          channelId: order.channelId || null,
          staffId: order.staffId,
          memberId: order.memberId || null,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          discountAmount: order.discountAmount || 0,
          finalAmount: order.finalAmount,
          customerCount: order.customerCount || 1,
          status: order.status || 'completed',
          paymentMethod: order.paymentMethod,
          taxCategory: order.taxCategory || 'taxable',
          platformOrderId: order.platformOrderId || null,
          tableNumber: order.tableNumber || null,
          callerPhone: order.callerPhone || null,
          driverPickupTime: order.driverPickupTime ? new Date(order.driverPickupTime) : null,
          purchaseOrderNo: order.purchaseOrderNo || null,
          socialRef: order.socialRef || null,
          note: order.note || null,
          createdAt: order.createdAt ? new Date(order.createdAt) : new Date(),
          items: {
            create: (order.items || []).map((item: any) => ({
              id: item.id,
              productId: item.productId,
              productName: item.productName,
              specId: item.specId,
              specName: item.specName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              addons: typeof item.addons === 'string' ? item.addons : JSON.stringify(item.addons || '[]'),
              bomCost: item.bomCost || 0,
            }))
          },
        },
        update: {
          totalAmount: order.totalAmount,
          discountAmount: order.discountAmount || 0,
          finalAmount: order.finalAmount,
          status: order.status,
          paymentMethod: order.paymentMethod,
          items: {
            deleteMany: {},
            create: (order.items || []).map((item: any) => ({
              id: item.id,
              productId: item.productId,
              productName: item.productName,
              specId: item.specId,
              specName: item.specName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              addons: typeof item.addons === 'string' ? item.addons : JSON.stringify(item.addons || '[]'),
              bomCost: item.bomCost || 0,
            }))
          },
        },
      })
    })

    return res.json({ code: 200, message: 'Order synced to cloud' })
  } catch (err: any) {
    console.error('[sync/order] Error:', err)
    return res.status(500).json({ code: 500, message: err.message || 'Order sync failed' })
  }
})

export default router
