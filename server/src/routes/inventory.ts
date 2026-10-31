import {materialRecipeUsage} from '../services/MaterialRecipeUsageService'
import { operationDateSchema } from '../utils/operationDate'
import { operationRecords, operationQuerySchema } from '../services/InventoryOperationRecordsService'
import {stockOutPhoto} from '../services/teamAgentBridge/employeePhotos'
import { inventoryEvidenceHandler } from '../services/InventoryEvidenceHttp'
import { getManualCorrection, correctManualStock } from '../services/ManualStockCorrectionService'
import { todayStockOuts,registeredStockOutReport,stockOutReportSchema } from '../services/TodayStockOutService'
import {refreshInventoryAlerts,handleInventoryAlert} from '../services/InventoryAlertCenterService'
import {setBatchExpiry} from '../services/InventoryBatchService'
import {employeeConsumption,getConsumptionAlerts} from '../services/EmployeeConsumptionService'
import prisma from '../config/database'
import { requireResourceStore } from '../middlewares/resourceStore'
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { getStoreId } from '../utils/storeHelper'
import { validateBody, describeNativeQuery } from '../utils/validation'
import * as InventoryService from '../services/InventoryService'
import { getInventoryAlertConfig, saveInventoryAlertConfig, DEFAULT_INVENTORY_ALERT_CONFIG } from '../services/InventoryAlertConfigService'

const router = Router()

const resourceAccess = requireResourceStore(req => prisma.inventory.findUnique({ where: { id: req.params.id }, select: { storeId: true } }))

// Explicitly scoped, immutable download; export permissions are declared in the route manifest.
router.get('/evidence-export', authenticate, inventoryEvidenceHandler(prisma))

// Validation schemas
const stockInSchema = z.object({
  occurredOn: operationDateSchema.optional(),
  inventoryId: z.string(),
  storeId: z.string().optional(),
  expiryDate:z.string().optional(),
  manufacturingDate:z.string().optional(),
  operationId: z.string().uuid().optional(),
  quantity: z.number().finite().positive(),
  inputUnit: z.string().min(1).max(30).optional(),
  unitCost: z.number().int().optional(),
  note: z.string().optional(),
  staffId: z.string().optional(),
  supplierId: z.string().optional()
})

const stockOutSchema = z.object({
  occurredOn: operationDateSchema.optional(),
  inventoryId: z.string(),
  storeId: z.string().optional(),
  operationId: z.string().uuid().optional(),
  quantity: z.number().finite().positive(),
  inputUnit: z.string().min(1).max(30).optional(),
  reason: z.enum(['withdrawal', 'loss', 'expired', 'other', 'sold', 'adjust', 'transfer']),
  note: z.string().optional(),
  staffId: z.string().optional(),
  orderId: z.string().optional()
}).refine(v => v.reason !== 'other' || !!v.note?.trim(), { message: 'OUT_REASON_REQUIRED' })

const adjustSchema = z.object({
  newStock: z.number().min(0),
  reason: z.string(),
  staffId: z.string().optional()
})

const createInventorySchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  category: z.string(),
  type: z.enum(['raw_material','semi_finished','finished_goods']).optional(),
  processRecipeId: z.string().nullable().optional(),
  unit: z.string(),
  currentStock: z.number().int().optional(),
  avgCost: z.number().int().optional(),
  minStock: z.number().optional(),
  maxStock: z.number().optional(),
  safetyStock: z.number().optional(),
  shelfLife: z.number().int().optional(),
  concentrateRatio: z.number().optional()
})

const updateInventorySchema = createInventorySchema.partial().extend({packaging:z.object({unit:z.string().min(1).max(30),quantity:z.number().finite().positive(),baseUnit:z.string()}).nullable().optional()})

// GET /api/inventory
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, categoryId, search, lowStock } = req.query

    const items = await InventoryService.getInventory({
      storeId: getStoreId(req),
      categoryId: categoryId as string,
      search: search as string,
      lowStock: lowStock === 'true'
    })

    res.json({
      code: 200,
      data: { list: items },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory' })
  }
})

router.get('/logs/stock-out/:logId/photos/:fileId',authenticate,async(req:AuthRequest,res)=>{
 try{const photo=await stockOutPhoto(prisma,getStoreId(req),req.params.logId,req.params.fileId);res.set({'Cache-Control':'private, no-store','Content-Type':photo.type,'X-Content-Type-Options':'nosniff'});res.send(photo.bytes)}
 catch(error:any){res.status(error.status||error.statusCode||404).json({code:404,message:'INVENTORY_PHOTO_NOT_FOUND'})}
})

router.get('/operation-records', authenticate, async (req: AuthRequest, res) => {
  const query = operationQuerySchema.safeParse(req.query)
  if (!query.success) return res.status(400).json({code:400,message:'INVALID_RECORD_QUERY'})
  const storeId = getStoreId(req)
  if (!storeId) return res.status(403).json({code:403,message:'STORE_REQUIRED'})
  res.set('Cache-Control','no-store')
  try { res.json({code:200,data:await operationRecords(storeId,query.data)}) }
  catch (error) { console.error('Operation records query failed',error); res.status(500).json({code:500,message:'RECORD_QUERY_FAILED'}) }
})

// GET /api/inventory/logs - Get all inventory logs (combined stock-in, stock-out, and adjustments)
router.get('/logs', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const { inventoryId, type, reason, category, search, startDate, endDate, limit } = req.query as any
    const take = limit ? parseInt(limit as string) : 200

    let logs: any[] = []

    const filter = {
      storeId,
      inventoryId: inventoryId as string | undefined,
      category: category as string | undefined,
      search: search as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      take
    }

    if (!type || type === 'stock_in') {
      const stockInLogs = await InventoryService.getStockInLogs(filter)
      logs = logs.concat(stockInLogs.map((l: any) => ({ ...l, type: 'stock_in' })))
    }

    if (!type || type === 'stock_out') {
      const stockOutLogs = await InventoryService.getStockOutLogs({ ...filter, reason: reason as string | undefined })
      logs = logs.concat(stockOutLogs.map((l: any) => ({ ...l, type: 'stock_out' })))
    }

    logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    res.json({
      code: 200,
      data: { list: logs },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Get inventory logs error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get inventory logs' })
  }
})

// Corrections are restricted to a real administrator, never an employee-app session.
const correctionAdmin = (req: AuthRequest, res: any, next: any) => req.user?.role === 'admin' && !req.user.employeeApp ? next() : res.status(403).json({code:403,message:'MANUAL_CORRECTION_ADMIN_ONLY'})
const correctionParams = z.object({type:z.enum(['stock_in','stock_out']),id:z.string().min(1).max(100)})
const correctionBody = z.object({requestId:z.string().uuid(),expectedVersion:z.string().min(1).max(100),action:z.enum(['correct','cancel','revalue']),reason:z.string().trim().min(1).max(1000),legacyCostMode:z.enum(['recorded','current_average']).optional(),replacement:z.object({inventoryId:z.string().min(1),quantity:z.number().finite().positive(),totalAmount:z.number().int().min(0).max(2147483647),note:z.string().max(2000)}).optional()}).strict()
router.get('/manual-logs/:type/:id/corrections',authenticate,correctionAdmin,async(req:AuthRequest,res)=>{
 try {const params=correctionParams.parse(req.params);res.json({code:200,data:await getManualCorrection(getStoreId(req),params.type,params.id)})}
 catch(error:any){res.status(error.statusCode||400).json({code:error.statusCode||400,message:error.message})}
})
router.post('/manual-logs/:type/:id/corrections',authenticate,correctionAdmin,validateBody(correctionBody),async(req:AuthRequest,res)=>{
 try {const params=correctionParams.parse(req.params);res.json({code:200,data:await correctManualStock(getStoreId(req),params.type,params.id,req.user!.staffId||req.user!.id,req.user!.id,req.body)})}
 catch(error:any){res.status(error.statusCode||409).json({code:error.statusCode||409,message:error.message})}
})

// POST /api/inventory/stock-in
router.post('/stock-in', authenticate, authorize('admin', 'manager', 'staff'), validateBody(stockInSchema), async (req: AuthRequest, res) => {
  try {
    if (req.body.storeId && req.body.storeId !== req.user!.storeId) return res.status(403).json({ code: 403, message: 'Store access denied' })
    const item = await InventoryService.stockIn({
      ...req.body,
      storeId: req.user!.storeId,
      staffId: req.user!.staffId || req.user!.id
    })

    res.status(201).json({
      code: 201,
      message: 'Stock in successful',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    const status=error.message==='Inventory not found'?404:/CONCURRENT|IDEMPOTENCY/.test(error.message)?409:400
    res.status(status).json({code:status,message:error.message||'Failed to stock in'})
  }
})

// POST /api/inventory/stock-out
router.post('/stock-out', authenticate, authorize('admin', 'manager', 'staff'), validateBody(stockOutSchema), async (req: AuthRequest, res) => {
  try {
    if (req.body.storeId && req.body.storeId !== req.user!.storeId) return res.status(403).json({ code: 403, message: 'Store access denied' })
    if (['sold','adjust','transfer'].includes(req.body.reason)) return res.status(400).json({code:400,message:'USE_MANUAL_OUT_PURPOSE'})
    const item = await InventoryService.stockOut({
      ...req.body,
      storeId: req.user!.storeId,
      staffId: req.user!.staffId || req.user!.id
    })

    res.json({
      code: 200,
      message: 'Stock out successful',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    const status=error.message==='Inventory not found'?404:/CONCURRENT|IDEMPOTENCY|Insufficient/.test(error.message)?409:400
    res.status(status).json({code:status,message:error.message||'Failed to stock out'})
  }
})

// PUT /api/inventory/:id/adjust
router.put('/:id/adjust', authenticate, resourceAccess, authorize('admin', 'manager'), validateBody(adjustSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const item = await InventoryService.adjustInventory(
      id,
      req.body.newStock,
      req.body.reason,
      req.user!.staffId || req.user!.id
    )

    res.json({
      code: 200,
      message: 'Inventory adjusted',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Adjust inventory error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to adjust inventory' })
  }
})

// GET /api/inventory/alerts/low-stock
router.get('/alerts/low-stock', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const alerts = await InventoryService.getLowStockAlerts(storeId)

    res.json({
      code: 200,
      data: { list: alerts },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get low stock alerts error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get low stock alerts' })
  }
})

// GET /api/inventory/stats
router.get('/stats/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const stats = await InventoryService.getInventoryStats(storeId)

    res.json({
      code: 200,
      data: stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory stats error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory stats' })
  }
})

// GET /api/inventory/logs/stock-in
router.get('/logs/stock-in', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const inventoryId = req.query.inventoryId as string
    const logs = await InventoryService.getStockInLogs(storeId, inventoryId)

    res.json({
      code: 200,
      data: { list: logs },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get stock in logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get stock in logs' })
  }
})

// Employee requests remain bound to their authenticated store via getStoreId.
router.get('/logs/today-stock-out', authenticate, describeNativeQuery(z.object({}).describe('All physical stock-out registrations for today in the store business timezone, grouped by material, with operators, notes and time. No history limit or date parameters. Excludes automatic sales consumption and count corrections. Use this for today\'s registered warehouse withdrawals.')), async (req: AuthRequest, res) => {
  res.set('Cache-Control', 'no-store')
  try { res.json({ code: 200, data: await todayStockOuts(getStoreId(req)), timestamp: new Date().toISOString() }) }
  catch (error) { console.error('Get today stock outs error:', error); res.status(500).json({ code: 500, message: 'Failed to load today stock outs' }) }
})

router.get('/logs/stock-out-report',authenticate,describeNativeQuery(stockOutReportSchema),async(req:AuthRequest,res)=>{
 res.set('Cache-Control','no-store')
 try{const {storeId,...query}=req.query;res.json({code:200,data:await registeredStockOutReport(getStoreId(req),query)})}
 catch(error:any){res.status(400).json({code:400,message:error.message})}
})

// GET /api/inventory/logs/stock-out
router.get('/logs/stock-out', authenticate, describeNativeQuery(z.object({inventoryId:z.string().optional()}).describe('Recent stock-out history (up to 200 records), optionally filtered by inventoryId; no date filter. Not a complete daily report. For today\'s physical registrations use GET /api/inventory/logs/today-stock-out.')), async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const inventoryId = req.query.inventoryId as string
    const logs = await InventoryService.getStockOutLogs(storeId, inventoryId)

    res.json({
      code: 200,
      data: { list: logs },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get stock out logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get stock out logs' })
  }
})

// POST /api/inventory
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createInventorySchema), async (req: AuthRequest, res) => {
  try {
    const item = await InventoryService.createInventory(req.body)

    res.status(201).json({
      code: 201,
      message: 'Inventory created',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Create inventory error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create inventory' })
  }
})

// DELETE /api/inventory/:id
router.delete('/:id', authenticate, resourceAccess, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await InventoryService.deleteInventory(id)

    res.json({
      code: 200,
      message: 'Inventory deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Delete inventory error:', error)
    const status=error.message==='MANUAL_CORRECTION_HISTORY_RETAIN_MATERIAL'?409:500
    res.status(status).json({ code: status, message: error.message || 'Failed to delete inventory' })
  }
})

// GET /api/inventory/batches
router.get('/batches', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const inventoryId = req.query.inventoryId as string
    const batches = await InventoryService.getBatches(storeId, inventoryId)
    res.json({ code: 200, data: { list: batches }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get batches error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get batches' })
  }
})

// GET /api/inventory/batches/expiring
router.get('/batches/expiring', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const days = parseInt(req.query.days as string) || 7
    const batches = await InventoryService.getExpiringBatches(storeId, days)
    res.json({ code: 200, data: { list: batches }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get expiring batches error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get expiring batches' })
  }
})

// ============================================
// 库存异常预警 - 理论消耗 vs 实际消耗对比
// ============================================

router.get('/alert-center',authenticate,authorize('admin','manager'),async(req:AuthRequest,res)=>{
 try{res.json({code:200,data:await refreshInventoryAlerts(getStoreId(req))})}catch(error:any){res.status(500).json({code:500,message:'ALERTS_LOAD_FAILED'})}
})
router.post('/alert-center/:id/handle',authenticate,authorize('admin','manager'),validateBody(z.object({note:z.string().trim().min(1).max(1000)})),async(req:AuthRequest,res)=>{
 try{res.json({code:200,data:await handleInventoryAlert(getStoreId(req),req.params.id,req.user!.staffId||req.user!.id,req.body.note)})}catch(error:any){res.status(409).json({code:409,message:error.message})}
})
router.put('/alert-center/expiry',authenticate,authorize('admin','manager'),validateBody(z.object({inventoryId:z.string(),batchId:z.string().optional(),expiryDate:z.string().trim().min(1),manufacturingDate:z.string().optional()})),async(req:AuthRequest,res)=>{
 try{res.json({code:200,data:await setBatchExpiry(getStoreId(req),req.body.inventoryId,req.body.batchId,req.body.expiryDate,req.body.manufacturingDate)})}catch(error:any){res.status(409).json({code:409,message:error.message})}
})

router.get('/recipe-usage',authenticate,authorize('admin','manager'),async(req:AuthRequest,res)=>{
 const parsed=z.object({inventoryId:z.string().min(1),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).safeParse(req.query)
 if(!parsed.success)return res.status(400).json({code:400,message:'INVALID_USAGE_QUERY'})
 try{res.json({code:200,data:await materialRecipeUsage({storeId:getStoreId(req),inventoryId:parsed.data.inventoryId!,startDate:parsed.data.startDate!,endDate:parsed.data.endDate!})})}
 catch(error:any){res.status(error.message==='USAGE_MATERIAL_NOT_FOUND'?404:400).json({code:400,message:error.message})}
})

router.get('/employee-consumption',authenticate,authorize('admin','manager'),describeNativeQuery(z.object({startDate:z.string(),endDate:z.string()}).describe('Employee consumption analysis for an explicit date range. Both startDate and endDate (YYYY-MM-DD) are required. Separate from physical stock-out registrations.')),async(req:AuthRequest,res)=>{
 try{if(typeof req.query.startDate!=='string'||typeof req.query.endDate!=='string')return res.status(400).json({code:400,message:'ANALYSIS_DATES_REQUIRED'});res.json({code:200,data:await employeeConsumption({storeId:getStoreId(req),startDate:req.query.startDate,endDate:req.query.endDate})})}
 catch(error:any){res.status(400).json({code:400,message:error.message})}
})
router.get('/consumption-alerts',authenticate,authorize('admin','manager'),async(req:AuthRequest,res)=>{
 try{const list=await getConsumptionAlerts(getStoreId(req));res.json({code:200,data:{list,count:list.length}})}catch(error:any){res.status(500).json({code:500,message:'ALERTS_LOAD_FAILED'})}
})

// GET /api/inventory/consumption-analysis
router.get('/consumption-analysis', authenticate, authorize('admin', 'manager'), describeNativeQuery(z.object({startDate:z.string(),endDate:z.string(),varianceThreshold:z.string().optional(),category:z.string().optional(),latest:z.enum(['true','false']).optional()}).describe('Recipe and sales consumption analysis for an explicit date range. Both startDate and endDate (YYYY-MM-DD) are required. Separate from physical stock-out registrations.')), async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const { startDate, endDate, varianceThreshold, category } = req.query

    if (!startDate || !endDate) {
      return res.status(400).json({ code: 400, message: 'startDate and endDate are required' })
    }

    const alertConfig = await getInventoryAlertConfig(storeId)
    const analysis = await InventoryService.getConsumptionAnalysis({
      storeId,
      startDate: startDate as string,
      endDate: endDate as string,
      varianceThreshold: varianceThreshold ? parseFloat(varianceThreshold as string) : alertConfig.varianceWarningPercent,
      latest: req.query.latest === 'true',
      varianceCriticalThreshold: alertConfig.varianceCriticalPercent,
      category: category as string
    })

    res.json({
      code: 200,
      data: { list: analysis },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get consumption analysis error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get consumption analysis' })
  }
})

// GET /api/inventory/anomaly-summary
router.get('/anomaly-summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const { startDate, endDate, varianceThreshold, category } = req.query

    if (!startDate || !endDate) {
      return res.status(400).json({ code: 400, message: 'startDate and endDate are required' })
    }

    const alertConfig = await getInventoryAlertConfig(storeId)
    const summary = await InventoryService.getAnomalySummary({
      storeId,
      startDate: startDate as string,
      endDate: endDate as string,
      varianceThreshold: varianceThreshold ? parseFloat(varianceThreshold as string) : alertConfig.varianceWarningPercent,
      latest: req.query.latest === 'true',
      varianceCriticalThreshold: alertConfig.varianceCriticalPercent,
      category: category as string
    })

    res.json({
      code: 200,
      data: summary,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get anomaly summary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get anomaly summary' })
  }
})

// GET /api/inventory/alert-config
router.get('/alert-config', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const config = await getInventoryAlertConfig(storeId)
    res.json({
      code: 200,
      data: config,
      defaults: DEFAULT_INVENTORY_ALERT_CONFIG,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory alert config error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory alert config' })
  }
})

// PUT /api/inventory/alert-config
router.put('/alert-config', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const configData = req.body

    const config = await saveInventoryAlertConfig(storeId, configData)
    res.json({
      code: 200,
      message: 'Inventory alert config saved',
      data: config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Save inventory alert config error:', error)
    res.status(400).json({ code: 400, message: 'Invalid inventory alert configuration' })
  }
})

// PUT /api/inventory/:id
router.put('/:id', authenticate, resourceAccess, authorize('admin', 'manager'), validateBody(updateInventorySchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const item = await InventoryService.updateInventory(id, req.body)

    res.json({
      code: 200,
      message: 'Inventory updated',
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Update inventory error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update inventory' })
  }
})

// GET /api/inventory/:id
router.get('/:id', authenticate, resourceAccess, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const item = await InventoryService.getInventoryById(id)

    if (!item) {
      return res.status(404).json({ code: 404, message: 'Inventory not found' })
    }

    res.json({
      code: 200,
      data: item,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory item error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory item' })
  }
})

export { router as inventoryRouter }
