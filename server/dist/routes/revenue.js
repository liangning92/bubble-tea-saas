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
exports.revenueRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const RevenueService = __importStar(require("../services/RevenueService"));
const date_fns_1 = require("date-fns");
const router = (0, express_1.Router)();
exports.revenueRouter = router;
// GET /api/revenue/by-channel?period=today|week|month|custom&startDate=&endDate=
router.get('/by-channel', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { period, startDate, endDate } = req.query;
        let start;
        let end = (0, date_fns_1.endOfDay)(new Date());
        if (period === 'today') {
            start = (0, date_fns_1.startOfDay)(new Date());
            end = (0, date_fns_1.endOfDay)(new Date());
        }
        else if (period === 'week') {
            start = (0, date_fns_1.startOfWeek)(new Date());
            end = (0, date_fns_1.endOfWeek)(new Date());
        }
        else if (period === 'month') {
            start = (0, date_fns_1.startOfMonth)(new Date());
            end = (0, date_fns_1.endOfMonth)(new Date());
        }
        else if (period === 'custom' && startDate && endDate) {
            start = (0, date_fns_1.startOfDay)(new Date(startDate));
            end = (0, date_fns_1.endOfDay)(new Date(endDate));
        }
        else {
            // Default to today
            start = (0, date_fns_1.startOfDay)(new Date());
            end = (0, date_fns_1.endOfDay)(new Date());
        }
        const data = await RevenueService.getRevenueByChannel(storeId, start, end);
        res.json({ code: 200, data });
    }
    catch (error) {
        console.error('Get revenue by channel error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get revenue' });
    }
});
// GET /api/revenue/summary?period=today|week|month|custom&startDate=&endDate=
router.get('/summary', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { period, startDate, endDate, comparePeriod } = req.query;
        let currentStart;
        let currentEnd = (0, date_fns_1.endOfDay)(new Date());
        if (period === 'today') {
            currentStart = (0, date_fns_1.startOfDay)(new Date());
            currentEnd = (0, date_fns_1.endOfDay)(new Date());
        }
        else if (period === 'week') {
            currentStart = (0, date_fns_1.startOfWeek)(new Date());
            currentEnd = (0, date_fns_1.endOfWeek)(new Date());
        }
        else if (period === 'month') {
            currentStart = (0, date_fns_1.startOfMonth)(new Date());
            currentEnd = (0, date_fns_1.endOfMonth)(new Date());
        }
        else if (period === 'custom' && startDate && endDate) {
            currentStart = (0, date_fns_1.startOfDay)(new Date(startDate));
            currentEnd = (0, date_fns_1.endOfDay)(new Date(endDate));
        }
        else {
            currentStart = (0, date_fns_1.startOfMonth)(new Date());
            currentEnd = (0, date_fns_1.endOfMonth)(new Date());
        }
        // Previous period for comparison
        let previousStart;
        let previousEnd;
        if (period === 'today') {
            previousStart = (0, date_fns_1.startOfDay)((0, date_fns_1.subDays)(currentStart, 1));
            previousEnd = (0, date_fns_1.endOfDay)((0, date_fns_1.subDays)(currentEnd, 1));
        }
        else if (period === 'week') {
            previousStart = (0, date_fns_1.startOfWeek)((0, date_fns_1.subWeeks)(currentStart, 1));
            previousEnd = (0, date_fns_1.endOfWeek)((0, date_fns_1.subWeeks)(currentEnd, 1));
        }
        else if (period === 'month' || !period || period === 'custom') {
            previousStart = (0, date_fns_1.subMonths)(currentStart, 1);
            previousEnd = (0, date_fns_1.subMonths)(currentEnd, 1);
        }
        else {
            previousStart = (0, date_fns_1.subMonths)(currentStart, 1);
            previousEnd = (0, date_fns_1.subMonths)(currentEnd, 1);
        }
        const comparison = await RevenueService.compareRevenue(storeId, currentStart, currentEnd, previousStart, previousEnd);
        res.json({ code: 200, data: comparison });
    }
    catch (error) {
        console.error('Get revenue summary error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get revenue summary' });
    }
});
// GET /api/revenue/daily?startDate=&endDate=
router.get('/daily', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate } = req.query;
        const start = startDate ? (0, date_fns_1.startOfDay)(new Date(startDate)) : (0, date_fns_1.startOfMonth)(new Date());
        const end = endDate ? (0, date_fns_1.endOfDay)(new Date(endDate)) : (0, date_fns_1.endOfDay)(new Date());
        const daily = await RevenueService.getDailyRevenue(storeId, start, end);
        res.json({ code: 200, data: daily });
    }
    catch (error) {
        console.error('Get daily revenue error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get daily revenue' });
    }
});
//# sourceMappingURL=revenue.js.map