import request from 'supertest'
import { app } from '../index'
import { prisma } from './setup'

describe('Auth API', () => {
  let storeId: string
  let authToken: string

  beforeAll(async () => {
    // Create test store
    const tenant = await prisma.tenant.create({
      data: { name: 'Test Tenant' }
    })
    const store = await prisma.store.create({
      data: {
        tenantId: tenant.id,
        name: 'Test Store'
      }
    })
    storeId = store.id
  })

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          phone: '081234567999',
          password: 'password123',
          name: 'Test User',
          storeId: storeId,
          role: 'cashier'
        })

      expect(res.status).toBe(201)
      expect(res.body.code).toBe(201)
      expect(res.body.data).toHaveProperty('token')
      expect(res.body.data.user).toHaveProperty('phone', '081234567999')
    })

    it('should reject duplicate phone', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          phone: '081234567999',
          password: 'password123',
          name: 'Test User',
          storeId: storeId,
          role: 'cashier'
        })

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          phone: '081234567999',
          password: 'password123',
          name: 'Test User',
          storeId: storeId,
          role: 'cashier'
        })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('already registered')
    })
  })

  describe('POST /api/auth/login', () => {
    beforeAll(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          phone: '081234568000',
          password: 'password123',
          name: 'Login Test',
          storeId: storeId,
          role: 'cashier'
        })
    })

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          phone: '081234568000',
          password: 'password123'
        })

      expect(res.status).toBe(200)
      expect(res.body.code).toBe(200)
      expect(res.body.data).toHaveProperty('token')
      authToken = res.body.data.token
    })

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          phone: '081234568000',
          password: 'wrongpassword'
        })

      expect(res.status).toBe(401)
      expect(res.body.message).toContain('Invalid')
    })

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          phone: '089999999999',
          password: 'password123'
        })

      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/auth/me', () => {
    it('should return user info with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('phone')
    })

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/auth/me')
      expect(res.status).toBe(401)
    })

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')

      expect(res.status).toBe(401)
    })
  })
})