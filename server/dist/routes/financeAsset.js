"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.financeAssetRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const FixedAssetService = __importStar(require("../services/FixedAssetService"));
const router = (0, express_1.Router)();
exports.financeAssetRouter = router;
// GET /api/finance/assets
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { status } = req.query;
        const assets = await FixedAssetService.getFixedAssets(storeId, {
            status: status
        });
        res.json({ code: 200, data: { list: assets } });
    }
    catch (error) {
        console.error('Get assets error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get assets' });
    }
});
// GET /api/finance/assets/schedule
router.get('/schedule', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const schedule = await FixedAssetService.getDepreciationSchedule(storeId);
        res.json({ code: 200, data: schedule });
    }
    catch (error) {
        console.error('Get depreciation schedule error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get depreciation schedule' });
    }
});
// GET /api/finance/assets/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const asset = await FixedAssetService.getFixedAsset(req.params.id);
        if (!asset) {
            res.status(404).json({ code: 404, message: 'Asset not found' });
            return;
        }
        res.json({ code: 200, data: asset });
    }
    catch (error) {
        console.error('Get asset error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get asset' });
    }
});
// POST /api/finance/assets
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const asset = await FixedAssetService.createFixedAsset(req.body);
        res.status(201).json({ code: 201, data: asset });
    }
    catch (error) {
        console.error('Create asset error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create asset' });
    }
});
// PUT /api/finance/assets/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const asset = await FixedAssetService.updateFixedAsset(req.params.id, req.body);
        res.json({ code: 200, data: asset });
    }
    catch (error) {
        console.error('Update asset error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update asset' });
    }
});
// DELETE /api/finance/assets/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await FixedAssetService.deleteFixedAsset(req.params.id);
        res.json({ code: 200, message: 'Asset deleted' });
    }
    catch (error) {
        console.error('Delete asset error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete asset' });
    }
});
// POST /api/finance/assets/:id/dispose - Dispose asset with sale value
router.post('/:id/dispose', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { saleValue, disposalDate, note } = req.body;
        if (saleValue === undefined || saleValue < 0) {
            res.status(400).json({ code: 400, message: 'Sale value must be a non-negative number' });
            return;
        }
        const result = await FixedAssetService.disposeFixedAsset({
            assetId: req.params.id,
            saleValue,
            disposalDate: disposalDate ? new Date(disposalDate) : new Date(),
            note,
            disposedBy: req.user.staffId || req.user.id
        });
        res.json({
            code: 200,
            message: 'Asset disposed successfully',
            data: result
        });
    }
    catch (error) {
        console.error('Dispose asset error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to dispose asset' });
    }
});
//# sourceMappingURL=financeAsset.js.map