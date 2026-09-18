"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeRouter = void 0;
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const HygieneService_1 = require("../services/HygieneService");
const router = (0, express_1.Router)();
exports.storeRouter = router;
// POST /api/stores - Create a new store with tenant (Admin only)
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { name, address, phone } = req.body;
        // Create tenant first
        const tenant = await database_1.default.tenant.create({
            data: {
                name: name || 'My Store'
            }
        });
        // Create store with tenant
        const store = await database_1.default.store.create({
            data: {
                tenantId: tenant.id,
                name: name || 'My Store',
                address: address || '',
                phone: phone || ''
            }
        });
        // Initialize default receipt template for new store
        await (0, HygieneService_1.seedDefaultReceiptTemplate)(store.id).catch((err) => {
            console.error('Failed to seed default receipt template:', err);
        });
        res.status(201).json({
            code: 201,
            message: 'Store created successfully',
            data: store
        });
    }
    catch (error) {
        console.error('Create store error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create store' });
    }
});
// GET /api/stores/:id - Get store by ID (Admin/Manager)
router.get('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const store = await database_1.default.store.findUnique({
            where: { id: req.params.id }
        });
        if (!store) {
            return res.status(404).json({ code: 404, message: 'Store not found' });
        }
        res.json({
            code: 200,
            data: store
        });
    }
    catch (error) {
        console.error('Get store error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get store' });
    }
});
//# sourceMappingURL=store.js.map