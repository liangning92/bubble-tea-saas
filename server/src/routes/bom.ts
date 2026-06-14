import { Router } from 'express'
import { authenticate, AuthRequest } from '../middlewares/auth'
import * as bomService from '../services/BomService'

const router = Router()

// GET /api/bom/products - 获取所有产品的BOM成本分析
router.get('/products', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const products = await bomService.getProductsWithBomCost(storeId)
    res.json({ code: 200, data: { list: products } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/bom/products/:id - 获取单个产品的BOM明细
router.get('/products/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const product = await bomService.getProductBomDetail(req.params.id)
    if (!product) return res.status(404).json({ code: 404, message: 'Product not found' })
    res.json({ code: 200, data: product })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/bom/materials/usage - 获取原料使用预测
router.get('/materials/usage', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { days } = req.query
    const usage = await bomService.getMaterialUsageForecast(storeId, days ? parseInt(days as string) : 30)
    res.json({ code: 200, data: usage })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/bom/materials/low-stock-alert - 库存预警（基于预测消耗）
router.get('/materials/low-stock-alert', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { days } = req.query
    const alerts = await bomService.getLowStockAlerts(storeId, days ? parseInt(days as string) : 7)
    res.json({ code: 200, data: alerts })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/bom/recipes/:productId/cost - 计算单个产品成本
router.get('/recipes/:productId/cost', authenticate, async (req: AuthRequest, res) => {
  try {
    const cost = await bomService.calculateProductCost(req.params.productId)
    res.json({ code: 200, data: { cost } })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

// GET /api/bom/inventory/:inventoryId/breakdown - 获取原料成本分解
router.get('/inventory/:inventoryId/breakdown', authenticate, async (req: AuthRequest, res) => {
  try {
    const { quantity } = req.query
    const qty = quantity ? parseFloat(quantity as string) : 1
    const breakdown = await bomService.getInventoryCostBreakdown(req.params.inventoryId, qty)
    res.json({ code: 200, data: breakdown })
  } catch (error: any) {
    res.status(500).json({ code: 500, message: error.message })
  }
})

export { router as bomRouter }