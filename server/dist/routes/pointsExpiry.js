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
exports.pointsExpiryRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const PointsExpiryService = __importStar(require("../services/PointsExpiryService"));
const router = (0, express_1.Router)();
exports.pointsExpiryRouter = router;
const createRuleSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    enabled: zod_1.z.boolean().optional().default(true),
    expiryMonths: zod_1.z.number().int().positive().optional().default(12),
    minPointsToExpire: zod_1.z.number().int().optional().default(100),
    notificationDays: zod_1.z.number().int().optional().default(14)
});
// GET /api/marketing/points-expiry-rules
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.query.storeId || req.user.storeId;
        const rule = await PointsExpiryService.getPointsExpiryRule(storeId);
        res.json({ code: 200, data: rule, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get points expiry rule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get points expiry rule' });
    }
});
// POST /api/marketing/points-expiry-rules
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), (0, validation_1.validateBody)(createRuleSchema), async (req, res) => {
    try {
        const rule = await PointsExpiryService.upsertPointsExpiryRule(req.body);
        res.status(201).json({ code: 201, message: 'Points expiry rule saved', data: rule, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Create points expiry rule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to save points expiry rule' });
    }
});
// PUT /api/marketing/points-expiry-rules/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const rule = await PointsExpiryService.updatePointsExpiryRule(req.params.id, req.body);
        res.json({ code: 200, message: 'Points expiry rule updated', data: rule, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Update points expiry rule error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update points expiry rule' });
    }
});
// POST /api/marketing/points-expiry-rules/process
router.post('/process', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.body.storeId || req.user.storeId;
        const result = await PointsExpiryService.processPointsExpiry(storeId);
        res.json({ code: 200, message: 'Points expiry processed', data: result, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Process points expiry error:', error);
        res.status(500).json({ code: 500, message: 'Failed to process points expiry' });
    }
});
//# sourceMappingURL=pointsExpiry.js.map