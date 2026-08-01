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
exports.productRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const ProductService = __importStar(require("../services/ProductService"));
const router = (0, express_1.Router)();
exports.productRouter = router;
// Validation schemas
const createProductSchema = zod_1.z.object({
    storeId: zod_1.z.string(),
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    categoryId: zod_1.z.string(),
    image: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    specs: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        price: zod_1.z.number().int().min(0)
    })).optional(),
    addons: zod_1.z.array(zod_1.z.object({
        addonId: zod_1.z.string(),
        price: zod_1.z.number().int().optional()
    })).optional(),
    bomItems: zod_1.z.array(zod_1.z.object({
        inventoryId: zod_1.z.string(),
        quantity: zod_1.z.number().positive()
    })).optional(),
    channelPrices: zod_1.z.array(zod_1.z.object({
        channelId: zod_1.z.string(),
        priceAdjustment: zod_1.z.number(),
        enabled: zod_1.z.boolean()
    })).optional()
});
const updateProductSchema = createProductSchema.partial();
const batchStatusSchema = zod_1.z.object({
    productIds: zod_1.z.array(zod_1.z.string()),
    status: zod_1.z.string()
});
// GET /api/products
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const { storeId, categoryId, status, search, includeDeleted } = req.query;
        const products = await ProductService.getProducts({
            storeId: storeId || req.user.storeId,
            categoryId: categoryId,
            status: status,
            search: search,
            includeDeleted: includeDeleted === 'true'
        });
        res.json({
            code: 200,
            data: { list: products },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get products' });
    }
});
// GET /api/products/pos - Products for POS (simplified format)
router.get('/pos', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.query.storeId || req.user.storeId;
        const products = await ProductService.getProductsForPOS(storeId);
        res.json({
            code: 200,
            data: { list: products },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get POS products error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get POS products' });
    }
});
// GET /api/products/pos/version - Check if products have changed (lightweight check)
router.get('/pos/version', auth_1.authenticate, async (req, res) => {
    try {
        const storeId = req.query.storeId || req.user.storeId;
        const latestProduct = await ProductService.getLatestProductUpdate(storeId);
        res.json({
            code: 200,
            data: {
                latestUpdate: latestProduct?.updatedAt?.toISOString() || null,
                productCount: latestProduct?.count || 0
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get products version error:', error);
        res.status(500).json({ code: 500, message: 'Failed to check products version' });
    }
});
// GET /api/products/barcode/:barcode - Get product by barcode
router.get('/barcode/:barcode', auth_1.authenticate, async (req, res) => {
    try {
        const { barcode } = req.params;
        const storeId = req.query.storeId || req.user.storeId;
        const product = await ProductService.getProductByBarcode(barcode, storeId);
        if (!product) {
            return res.status(404).json({ code: 404, message: 'Product not found' });
        }
        res.json({
            code: 200,
            data: product,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get product by barcode error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get product by barcode' });
    }
});
// GET /api/products/:id
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const product = await ProductService.getProductById(id);
        if (!product) {
            return res.status(404).json({ code: 404, message: 'Product not found' });
        }
        res.json({
            code: 200,
            data: product,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get product' });
    }
});
// GET /api/products/:id/cost - Get product cost detail (admin/manager only)
router.get('/:id/cost', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const costDetail = await ProductService.getProductCostDetail(id);
        if (!costDetail) {
            return res.status(404).json({ code: 404, message: 'Product not found' });
        }
        res.json({
            code: 200,
            data: costDetail,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get product cost error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get product cost' });
    }
});
// POST /api/products
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(createProductSchema), async (req, res) => {
    try {
        const product = await ProductService.createProduct(req.body);
        res.status(201).json({
            code: 201,
            message: 'Product created',
            data: product,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Create product error:', error.message || error);
        console.error('Stack:', error.stack);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create product' });
    }
});
// PUT /api/products/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const product = await ProductService.updateProduct(id, req.body);
        res.json({
            code: 200,
            message: 'Product updated',
            data: product,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update product error:', error.message || error);
        res.status(500).json({
            code: 500,
            message: error.message || 'Failed to update product',
            error: error.message
        });
    }
});
// DELETE /api/products/:id (soft delete)
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await ProductService.deleteProduct(id);
        res.json({
            code: 200,
            message: 'Product deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete product' });
    }
});
// PUT /api/products/:id/status - Update product status
router.put('/:id/status', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await ProductService.updateProduct(id, { status });
        res.json({
            code: 200,
            message: 'Product status updated',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update product status error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update product status' });
    }
});
// POST /api/products/:id/restore - Restore deleted product
router.post('/:id/restore', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const product = await ProductService.restoreProduct(id);
        res.json({
            code: 200,
            message: 'Product restored',
            data: product,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Restore product error:', error);
        res.status(500).json({ code: 500, message: 'Failed to restore product' });
    }
});
// POST /api/products/batch-status - Batch update status
router.post('/batch-status', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(batchStatusSchema), async (req, res) => {
    try {
        const { productIds, status } = req.body;
        await ProductService.batchUpdateStatus(productIds, status);
        res.json({
            code: 200,
            message: `Updated ${productIds.length} products`,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Batch update error:', error);
        res.status(500).json({ code: 500, message: 'Failed to batch update' });
    }
});
// POST /api/products/recalculate-costs - Recalculate all products cost
router.post('/recalculate-costs', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const results = await ProductService.recalculateAllCosts(storeId);
        res.json({
            code: 200,
            message: `Recalculated ${results.length} products`,
            data: results,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Recalculate costs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to recalculate costs' });
    }
});
// PUT /api/products/:id/bom - Update product BOM (recipe)
const bomUpdateSchema = zod_1.z.object({
    bomItems: zod_1.z.array(zod_1.z.object({
        inventoryId: zod_1.z.string(),
        quantity: zod_1.z.number().min(0)
    }))
});
router.put('/:id/bom', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), (0, validation_1.validateBody)(bomUpdateSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { bomItems } = req.body;
        const result = await ProductService.updateProductBom(id, bomItems);
        res.json({
            code: 200,
            message: 'Product BOM updated',
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update product BOM error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update product BOM' });
    }
});
//# sourceMappingURL=product.js.map