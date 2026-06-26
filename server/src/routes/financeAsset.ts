import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import * as FixedAssetService from '../services/FixedAssetService'

const router = Router()

// GET /api/finance/assets
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { status } = req.query

    const assets = await FixedAssetService.getFixedAssets(storeId, {
      status: status as string
    })

    res.json({ code: 200, data: { list: assets } })
  } catch (error: any) {
    console.error('Get assets error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get assets' })
  }
})

// GET /api/finance/assets/schedule
router.get('/schedule', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const schedule = await FixedAssetService.getDepreciationSchedule(storeId)
    res.json({ code: 200, data: schedule })
  } catch (error: any) {
    console.error('Get depreciation schedule error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get depreciation schedule' })
  }
})

// GET /api/finance/assets/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const asset = await FixedAssetService.getFixedAsset(req.params.id)
    if (!asset) {
      res.status(404).json({ code: 404, message: 'Asset not found' })
      return
    }
    res.json({ code: 200, data: asset })
  } catch (error: any) {
    console.error('Get asset error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get asset' })
  }
})

// POST /api/finance/assets
router.post('/', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const asset = await FixedAssetService.createFixedAsset(req.body)
    res.status(201).json({ code: 201, data: asset })
  } catch (error: any) {
    console.error('Create asset error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create asset' })
  }
})

// PUT /api/finance/assets/:id
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const asset = await FixedAssetService.updateFixedAsset(req.params.id, req.body)
    res.json({ code: 200, data: asset })
  } catch (error: any) {
    console.error('Update asset error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update asset' })
  }
})

// DELETE /api/finance/assets/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await FixedAssetService.deleteFixedAsset(req.params.id)
    res.json({ code: 200, message: 'Asset deleted' })
  } catch (error: any) {
    console.error('Delete asset error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete asset' })
  }
})

// POST /api/finance/assets/:id/dispose - Dispose asset with sale value
router.post('/:id/dispose', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { saleValue, disposalDate, note } = req.body

    if (saleValue === undefined || saleValue < 0) {
      res.status(400).json({ code: 400, message: 'Sale value must be a non-negative number' })
      return
    }

    const result = await FixedAssetService.disposeFixedAsset({
      assetId: req.params.id,
      saleValue,
      disposalDate: disposalDate ? new Date(disposalDate) : new Date(),
      note,
      disposedBy: req.user!.staffId || req.user!.id
    })

    res.json({
      code: 200,
      message: 'Asset disposed successfully',
      data: result
    })
  } catch (error: any) {
    console.error('Dispose asset error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to dispose asset' })
  }
})

export { router as financeAssetRouter }