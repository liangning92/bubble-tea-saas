import { Router, Response } from 'express'
import { authenticate, AuthRequest, canAccessStore } from '../middlewares/auth'

const router = Router()
router.use(authenticate)

function requestedStore(req: AuthRequest, res: Response, storeId?: string): string | null {
  const target = storeId || req.user?.storeId || ''
  if (!req.user || (target && !canAccessStore(req.user, target))) {
    res.status(403).json({ success: false, error: 'Access denied: Store mismatch' })
    return null
  }
  return target
}

// In-memory store for detected printers (persisted via POS client)
// This gets updated when POS client detects printers
let detectedPrinters: string[] = []
let lastDetectionTime: Date | null = null
const storePrintersMap: Record<string, { printers: string[]; lastDetection: Date }> = {}

/**
 * GET /api/hardware/printers
 * Returns list of detected printers from POS client
 */
router.get('/printers', async (req: AuthRequest, res: Response) => {
  try {
    const storeId = requestedStore(req, res, req.query.storeId as string)
    if (storeId === null) return
    const storeData = storeId ? storePrintersMap[storeId] : null
    const printers = storeData ? storeData.printers : (req.user?.role === 'admin' && !storeId ? detectedPrinters : [])
    const lastDetection = storeData ? storeData.lastDetection : lastDetectionTime

    res.json({
      success: true,
      printers,
      lastDetection,
      message: printers.length > 0 
        ? `${printers.length} printer(s) detected`
        : 'No printers detected. Printers will be detected automatically when POS terminal connects.'
    })
  } catch (error) {
    console.error('[Hardware] Error getting printers:', error)
    res.status(500).json({ success: false, error: 'Failed to get printers' })
  }
})

/**
 * POST /api/hardware/printers
 * POS client posts detected printers list
 */
router.post('/printers', async (req: AuthRequest, res: Response) => {
  try {
    const { printers, storeId } = req.body
    
    if (!Array.isArray(printers) || printers.length > 100 || printers.some((name: unknown) => typeof name !== 'string' || name.length > 200)) {
      res.status(400).json({ success: false, error: 'printers must be an array' })
      return
    }
    
    const targetStoreId = requestedStore(req, res, storeId)
    if (targetStoreId === null) return
    detectedPrinters = printers
    lastDetectionTime = new Date()

    if (targetStoreId) {
      storePrintersMap[targetStoreId] = {
        printers,
        lastDetection: lastDetectionTime
      }
    }
    
    res.json({
      success: true,
      printers: detectedPrinters,
      lastDetection: lastDetectionTime
    })
  } catch (error) {
    console.error('[Hardware] Error saving printers:', error)
    res.status(500).json({ success: false, error: 'Failed to save printers' })
  }
})

/**
 * POST /api/hardware/detect
 * Admin triggers printer detection on POS client
 * POS client polls this endpoint and responds with detected printers
 */
router.post('/detect', async (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.body
    if (requestedStore(req, res, storeId) === null) return
    
    // Store detection request - POS client will poll this
    // For now, just acknowledge the request
    res.json({
      success: true,
      message: 'Detection requested. POS client will respond shortly.',
      requestedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Hardware] Error requesting detection:', error)
    res.status(500).json({ success: false, error: 'Failed to request detection' })
  }
})

/**
 * GET /api/hardware/detect
 * Check detection request status
 */
router.get('/detect', async (req: AuthRequest, res: Response) => {
  if (requestedStore(req, res, req.query.storeId as string) === null) return
  res.json({
    success: true,
    lastDetection: lastDetectionTime,
    printerCount: detectedPrinters.length
  })
})

/**
 * POST /api/hardware/test-print
 * Trigger a test print from POS client
 */
router.post('/test-print', async (req: AuthRequest, res: Response) => {
  try {
    const { printerName, storeId } = req.body
    if (requestedStore(req, res, storeId) === null) return
    
    // Store test print request - POS client will poll this
    res.json({
      success: true,
      message: 'Test print requested. POS client will process shortly.',
      printerName,
      requestedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Hardware] Error requesting test print:', error)
    res.status(500).json({ success: false, error: 'Failed to request test print' })
  }
})

/**
 * POST /api/hardware/test-drawer
 * Trigger a test cash drawer open from POS client
 */
router.post('/test-drawer', async (req: AuthRequest, res: Response) => {
  try {
    const { printerName, storeId } = req.body
    if (requestedStore(req, res, storeId) === null) return
    
    res.json({
      success: true,
      message: 'Cash drawer test requested. POS client will process shortly.',
      printerName,
      requestedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Hardware] Error requesting drawer test:', error)
    res.status(500).json({ success: false, error: 'Failed to request drawer test' })
  }
})

export { router as hardwareRouter }
