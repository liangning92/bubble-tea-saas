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
exports.marketingAnalyticsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const MarketingAnalyticsService = __importStar(require("../services/MarketingAnalyticsService"));
const router = (0, express_1.Router)();
exports.marketingAnalyticsRouter = router;
// GET /api/marketing/analytics/roi
router.get('/roi', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        // Always use user's storeId for security
        const storeId = req.user.storeId;
        const { startDate, endDate } = req.query;
        const roi = await MarketingAnalyticsService.getMarketingROI(storeId, { startDate, endDate });
        res.json({ code: 200, data: roi, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get marketing ROI error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get marketing ROI' });
    }
});
// GET /api/marketing/analytics/campaigns/:id
router.get('/campaigns/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const analytics = await MarketingAnalyticsService.getCampaignAnalytics(req.params.id, { startDate, endDate });
        res.json({ code: 200, data: analytics, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get campaign analytics error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get campaign analytics' });
    }
});
// GET /api/marketing/analytics/summary
router.get('/summary', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const summary = await MarketingAnalyticsService.getMarketingSummary(storeId);
        res.json({ code: 200, data: summary, timestamp: new Date().toISOString() });
    }
    catch (error) {
        console.error('Get marketing summary error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get marketing summary' });
    }
});
//# sourceMappingURL=marketingAnalytics.js.map