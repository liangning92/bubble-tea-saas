import { getInsights } from '../services/ProductInsightsService'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as ProductManagementService from '../services/ProductManagementService'

const router = Router()

const insightsHandler = (detail = false, preferences = false) => async (req: AuthRequest, res: any) => {
  try {
    const days = Number(req.query.days || 30)
    if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({code:400,message:'INVALID_DAYS'})
    const data = await getInsights(req.user!.storeId,{days,categoryId:req.query.categoryId as string,channelId:req.query.channelId as string},{detail,productId:preferences?req.params.productId:undefined,page:Number(req.query.page)||1,search:req.query.search as string,sort:req.query.sort as string,direction:req.query.direction as string})
    res.json({code:200,data})
  } catch(error:any) {res.status(error.message==='PRODUCT_NOT_FOUND'?404:500).json({code:error.message==='PRODUCT_NOT_FOUND'?404:500,message:error.message==='PRODUCT_NOT_FOUND'?'PRODUCT_NOT_FOUND':'PRODUCT_INSIGHTS_FAILED'})}
}
router.get('/insights',authenticate,authorize('admin','manager'),insightsHandler())
router.get('/insights/details',authenticate,authorize('admin','manager'),insightsHandler(true))
router.get('/insights/preferences/:productId',authenticate,authorize('admin','manager'),insightsHandler(false,true))

// ==================== PROCESS RECIPES ====================

// GET /api/product-analysis/recipes
router.get('/recipes', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const result = await ProductManagementService.getProcessRecipes(storeId)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get recipes error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get recipes' })
  }
})

// POST /api/product-analysis/recipes
router.post('/recipes', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const result = await ProductManagementService.createProcessRecipe({
      ...req.body,
      storeId: req.user!.storeId
    })

    res.status(201).json({
      code: 201,
      message: 'Recipe created',
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create recipe error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create recipe' })
  }
})

// GET /api/product-analysis/recipes/:id/cost
router.get('/recipes/:id/cost', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const result = await ProductManagementService.calculateRecipeCost(id)

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Calculate recipe cost error:', error)
    res.status(500).json({ code: 500, message: 'Failed to calculate recipe cost' })
  }
})

// ==================== PRODUCT MIX ====================

// GET /api/product-analysis/mix
router.get('/mix', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const days = parseInt(req.query.days as string) || 30
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const endDate = new Date()

    const result = await ProductManagementService.getProductMixAnalysis(storeId, startDate, endDate)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get product mix error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get product mix' })
  }
})

// ==================== ABC ANALYSIS ====================

// GET /api/product-analysis/abc
router.get('/abc', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const days = parseInt(req.query.days as string) || 30
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const endDate = new Date()

    const result = await ProductManagementService.getABCAnalysis(storeId, startDate, endDate)

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get ABC analysis error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get ABC analysis' })
  }
})

// ==================== MENU ENGINEERING MATRIX ====================

// GET /api/product-analysis/matrix
router.get('/matrix', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const days = parseInt(req.query.days as string) || 30
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const endDate = new Date()

    const result = await ProductManagementService.getMenuEngineeringMatrix(storeId, startDate, endDate)

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get matrix analysis error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get matrix analysis' })
  }
})

// ==================== PRODUCT SCORE ====================

router.get('/trend', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const days = Math.min(366, Math.max(1, parseInt(req.query.days as string) || 30))
    const endDate = new Date()
    const startDate = new Date(endDate)
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1))
    startDate.setUTCHours(0, 0, 0, 0)
    const result = await ProductManagementService.getProductSalesTrend(req.user!.storeId, startDate, endDate)
    res.json({ code: 200, data: { list: result }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get product sales trend error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get product sales trend' })
  }
})

// GET /api/product-analysis/score/:productId
router.get('/score/:productId', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { productId } = req.params
    const days = parseInt(req.query.days as string) || 30

    const result = await ProductManagementService.getProductPerformanceScore(productId, days)

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get product score error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get product score' })
  }
})

export { router as productAnalysisRouter }
