import request from 'supertest'
import { app } from '../index'
import { prisma } from './setup'

describe('Inventory API', () => {
  let authToken: string
  let storeId: string
  let inventoryId: string

  beforeAll(async () => {
    // Create test data
    const tenant = await prisma.tenant.create({ data: { name: 'Inventory Test Tenant' } })
    const store = await prisma.store.create({
      data: { tenantId: tenant.id, name: 'Inventory Test Store' }
    })
    storeId = store.id

    // Create user
    const hashedPassword = await require('bcryptjs').hash('password123', 10)
    const user = await prisma.user.create({
      data: {
        phone: '081234568300',
        password: hashedPassword,
        role: 'admin',
        storeId: storeId
      }
    })

    // Create inventory item
    const inventory = await prisma.inventory.create({
      data: {
        storeId: storeId,
        name: '茶叶',
        category: '茶叶',
        unit: 'kg',
        currentStock: 50,
        avgCost: 150000,
        safetyStock: 10
      }
    })
    inventoryId = inventory.id

    // Get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '081234568300', password: 'password123' })

    authToken = loginRes.body.data.token
  })

  describe('GET /api/inventory', () => {
    it('should return inventory list', async () => {
      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('list')
      expect(res.body.data.list.length).toBeGreaterThan(0)
    })

    it('should identify low stock items', async () => {
      // Set stock below safety level
      await prisma.inventory.update({
        where: { id: inventoryId },
        data: { currentStock: 5 }
      })

      const res = await request(app)
        .get('/api/inventory?lowStock=true')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.list.some((i: any) => i.id === inventoryId)).toBe(true)
    })
  })

  describe('POST /api/inventory/stock-in', () => {
    it('should record stock in', async () => {
      const res = await request(app)
        .post('/api/inventory/stock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          inventoryId: inventoryId,
          quantity: 10,
          unitCost: 160000,
          supplier: 'Test Supplier'
        })

      expect(res.status).toBe(200)
      expect(res.body.data.currentStock).toBeGreaterThan(5)
    })
  })

  describe('POST /api/inventory/stock-out', () => {
    it('should record stock out', async () => {
      const res = await request(app)
        .post('/api/inventory/stock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          inventoryId: inventoryId,
          quantity: 5,
          reason: 'sold'
        })

      expect(res.status).toBe(200)
    })

    it('should reject if insufficient stock', async () => {
      const res = await request(app)
        .post('/api/inventory/stock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          inventoryId: inventoryId,
          quantity: 99999,
          reason: 'adjust'
        })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('Insufficient')
    })
  })
})