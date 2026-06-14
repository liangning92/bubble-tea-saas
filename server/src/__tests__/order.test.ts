import request from 'supertest'
import { app } from '../index'
import { prisma } from './setup'

describe('Order API', () => {
  let authToken: string
  let storeId: string
  let staffId: string
  let productId: string
  let specId: string

  beforeAll(async () => {
    // Create test data
    const tenant = await prisma.tenant.create({ data: { name: 'Order Test Tenant' } })
    const store = await prisma.store.create({
      data: { tenantId: tenant.id, name: 'Order Test Store' }
    })
    storeId = store.id

    // Create user and staff
    const hashedPassword = await require('bcryptjs').hash('password123', 10)
    const user = await prisma.user.create({
      data: {
        phone: '081234568200',
        password: hashedPassword,
        role: 'cashier',
        storeId: storeId
      }
    })

    const staff = await prisma.staff.create({
      data: {
        userId: user.id,
        storeId: storeId,
        name: 'Order Test Staff',
        employeeNumber: 'ORD001'
      }
    })
    staffId = staff.id

    // Create category and product
    const category = await prisma.category.create({
      data: { storeId: storeId, name: '奶茶', sortOrder: 1 }
    })
    const product = await prisma.product.create({
      data: {
        storeId: storeId,
        categoryId: category.id,
        name: 'Order Test Product',
        status: 'active'
      }
    })
    productId = product.id

    const spec = await prisma.spec.create({
      data: {
        productId: productId,
        name: '中杯',
        price: 18000,
        isDefault: true
      }
    })
    specId = spec.id

    // Get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '081234568200', password: 'password123' })

    authToken = loginRes.body.data.token
  })

  describe('POST /api/orders', () => {
    it('should create a new order', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId: storeId,
          staffId: staffId,
          items: [
            {
              productId: productId,
              productName: 'Order Test Product',
              specId: specId,
              specName: '中杯',
              quantity: 1,
              unitPrice: 18000,
              addons: []
            }
          ],
          paymentMethod: 'cash'
        })

      expect(res.status).toBe(201)
      expect(res.body.data).toHaveProperty('orderNumber')
      expect(res.body.data.finalAmount).toBeGreaterThan(0)
      expect(res.body.data).toHaveProperty('ppnAmount')
    })

    it('should reject empty items', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId: storeId,
          staffId: staffId,
          items: [],
          paymentMethod: 'cash'
        })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/orders', () => {
    it('should return order list', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('list')
      expect(res.body.data.list.length).toBeGreaterThan(0)
    })
  })
})