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
exports.supplierRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const SupplierService = __importStar(require("../services/SupplierService"));
const storeHelper_1 = require("../utils/storeHelper");
const router = (0, express_1.Router)();
exports.supplierRouter = router;
// Validation schemas
const createSupplierSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1),
    contactPerson: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    address: zod_1.z.string().optional(),
    note: zod_1.z.string().optional()
});
// GET /api/suppliers
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId, search, isActive } = req.query;
        const suppliers = await SupplierService.getSuppliers({
            storeId: (0, storeHelper_1.getStoreId)(req),
            search: search,
            isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
        });
        res.json({
            code: 200,
            data: { list: suppliers },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get suppliers error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get suppliers' });
    }
});
// GET /api/suppliers/dropdown
router.get('/dropdown', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = (0, storeHelper_1.getStoreId)(req);
        const suppliers = await SupplierService.getSuppliersForDropdown(storeId);
        res.json({
            code: 200,
            data: { list: suppliers },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get suppliers dropdown error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get suppliers' });
    }
});
// GET /api/suppliers/:id
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const supplier = await SupplierService.getSupplierById(id);
        if (!supplier) {
            return res.status(404).json({ code: 404, message: 'Supplier not found' });
        }
        res.json({
            code: 200,
            data: supplier,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get supplier error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get supplier' });
    }
});
// GET /api/suppliers/:id/stats
router.get('/:id/stats', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const stats = await SupplierService.getSupplierStats(id);
        res.json({
            code: 200,
            data: stats,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get supplier stats error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get supplier stats' });
    }
});
// POST /api/suppliers
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createSupplierSchema), async (req, res) => {
    try {
        const supplier = await SupplierService.createSupplier(req.body);
        res.status(201).json({
            code: 201,
            message: 'Supplier created',
            data: supplier,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create supplier error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create supplier' });
    }
});
// PUT /api/suppliers/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const supplier = await SupplierService.updateSupplier(id, req.body);
        res.json({
            code: 200,
            message: 'Supplier updated',
            data: supplier,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update supplier error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update supplier' });
    }
});
// DELETE /api/suppliers/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await SupplierService.deleteSupplier(id);
        res.json({
            code: 200,
            message: 'Supplier deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete supplier error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete supplier' });
    }
});
//# sourceMappingURL=supplier.js.map