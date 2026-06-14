import request from 'supertest'
import { app } from '../index'
import { prisma } from './setup'

describe('Product API', () => {
  let authToken: string
  let storeId: string
  let categoryId: string

  beforeAll(async () => {
    // Create test data
    const tenant = await prisma.tenant.create({ data: { name: 'Product Test Tenant' } })
    const store = await prisma.store.create({
      data: { tenantId: tenant.id, name: 'Product Test Store' }
    })
    storeId = store.id

    // Create user and get token
    const hashedPassword = await require('bcryptjs').hash('password123', 10)
    const user = await prisma.user.create({
      data: {
        phone: '081234568100',
        password: hashedPassword,
        role: 'admin',
        storeId: storeId
      }
    })

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: '081234568100', password: 'password123' })

    authToken = loginRes.body.data.token

    // Create category
    const category = await prisma.category.create({
      data: { storeId: storeId, name: '奶茶', sortOrder: 1 }
    })
    categoryId = category.id
  })

  describe('POST /api/products', () => {
    it('should create a new product', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId: storeId,
          categoryId: categoryId,
          name: '珍珠奶茶',
          description: '经典奶茶',
          status: 'active',
          specs: [
            { name: '中杯', price: 18000 },
            { name: '大杯', price: 22000, priceAdjustment: 4000 }
          ]
        })

      expect(res.status).toBe(201)
      expect(res.body.data).toHaveProperty('name', '珍珠奶茶')
      expect(res.body.data.specs).toHaveLength(2)
    })

    it('should reject invalid data', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          storeId: storeId,
          name: 'Test'
          // missing categoryId and specs
        })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/products', () => {
    it('should return product list', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('list')
      expect(Array.isArray(res.body.data.list)).toBe(true)
      expect(res.body.data).toHaveProperty('pagination')
    })

    it('should filter by category', async () => {
      const res = await request(app)
        .get(`/api/products?categoryId=${categoryId}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.list.length).toBeGreaterThan(0)
    })
  })

  describe('PUT /api/products/:id/status', () => {
    let productId: string

    beforeAll(async () => {
      const product = await prisma.product.create({
        data: {
          storeId: storeId,
          categoryId: categoryId,
          name: 'Status Test Product',
          status: 'active'
        }
      })
      productId = product.id
    })

    it('should update product status', async () => {
      const res = await request(app)
        .put(`/api/products/${productId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'inactive' })

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('inactive')
    })
  })
})