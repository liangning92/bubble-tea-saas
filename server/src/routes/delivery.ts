import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { getPlatformConnections } from '../services/delivery/PlatformAdapter'

const router = Router()
router.use(authenticate, authorize('admin', 'manager'))

// Read-only connection status. Unconnected providers never create orders.
router.get('/platforms', (req: AuthRequest, res) => {
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : req.user!.storeId
  if (!storeId) return res.status(400).json({ code: 400, message: 'Store is required' })
  return res.json({ code: 200, data: { platforms: getPlatformConnections({ storeId }) } })
})

export { router as deliveryRouter }
