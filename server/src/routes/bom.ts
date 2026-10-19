import {getStoreId} from '../utils/storeHelper'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as bomService from '../services/BomService'

const router = Router()
router.use(authenticate,authorize('admin'))

// GET /api/bom/products - 获取所有产品的BOM成本分析
router.get('/products', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const products = await bomService.getProductsWithBomCost(storeId)
    res.json({ code: 200, data: { list: products } })
  } catch (error: any) {
    const status=error instanceof bomService.BomScopeError?error.status:500
    res.status(status).json({code:status,message:error.message})
  }
})

// GET /api/bom/products/:id - 获取单个产品的BOM明细
router.get('/products/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const product = await bomService.getProductBomDetail(req.params.id,getStoreId(req))
    if (!product) return res.status(404).json({ code: 404, message: 'Product not found' })
    res.json({ code: 200, data: product })
  } catch (error: any) {
    const status=error instanceof bomService.BomScopeError?error.status:500
    res.status(status).json({code:status,message:error.message})
  }
})

// GET /api/bom/materials/usage - 获取原料使用预测
router.get('/materials/usage', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const { days } = req.query
    const usage = await bomService.getMaterialUsageForecast(storeId, days ? parseInt(days as string) : 30)
    res.json({ code: 200, data: usage })
  } catch (error: any) {
    const status=error instanceof bomService.BomScopeError?error.status:500
    res.status(status).json({code:status,message:error.message})
  }
})

// GET /api/bom/materials/low-stock-alert - 库存预警（基于预测消耗）
router.get('/materials/low-stock-alert', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const { days } = req.query
    const alerts = await bomService.getLowStockAlerts(storeId, days ? parseInt(days as string) : 7)
    res.json({ code: 200, data: alerts })
  } catch (error: any) {
    const status=error instanceof bomService.BomScopeError?error.status:500
    res.status(status).json({code:status,message:error.message})
  }
})

// GET /api/bom/recipes/:productId/cost - 计算单个产品成本
router.get('/recipes/:productId/cost', authenticate, async (req: AuthRequest, res) => {
  try {
    const cost = await bomService.calculateProductCost(req.params.productId,getStoreId(req))
    res.json({ code: 200, data: { cost } })
  } catch (error: any) {
    const status=error instanceof bomService.BomScopeError?error.status:500
    res.status(status).json({code:status,message:error.message})
  }
})

// GET /api/bom/inventory/:inventoryId/breakdown - 获取原料成本分解
router.get('/inventory/:inventoryId/breakdown', authenticate, async (req: AuthRequest, res) => {
  try {
    const { quantity } = req.query
    const qty = quantity ? parseFloat(quantity as string) : 1
    const breakdown = await bomService.getInventoryCostBreakdown(req.params.inventoryId, qty, typeof req.query.unit === 'string' ? req.query.unit : undefined,getStoreId(req))
    res.json({ code: 200, data: breakdown })
  } catch (error: any) {
    const status=error instanceof bomService.BomScopeError?error.status:500
    res.status(status).json({code:status,message:error.message})
  }
})

export { router as bomRouter }