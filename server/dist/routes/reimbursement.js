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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reimbursementRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
// @ts-ignore - multer types not available
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middlewares/auth");
const ReimbursementService = __importStar(require("../services/ReimbursementService"));
const router = (0, express_1.Router)();
exports.reimbursementRouter = router;
// Configure multer for file uploads
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/reimbursements/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only image files (jpeg, jpg, png) and PDF are allowed'));
    }
});
// Validation schemas
const applyReimbursementSchema = zod_1.z.object({
    type: zod_1.z.enum(['transportation', 'meals', 'communication', 'medical', 'other']),
    amount: zod_1.z.number().min(1),
    description: zod_1.z.string().min(1),
    receiptUrls: zod_1.z.array(zod_1.z.string()).optional()
});
// Ensure upload directory exists
const fs_1 = __importDefault(require("fs"));
const uploadDir = 'uploads/reimbursements/';
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
// ============================================
// Staff/Cashier APIs
// ============================================
// POST /api/reimbursement/apply - Apply for reimbursement
router.post('/apply', auth_1.authenticate, async (req, res) => {
    try {
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const validated = applyReimbursementSchema.parse(req.body);
        const reimbursement = await ReimbursementService.applyReimbursement({
            staffId: staff.id,
            storeId: staff.storeId,
            type: validated.type,
            amount: validated.amount,
            description: validated.description,
            receiptUrls: validated.receiptUrls
        });
        res.status(201).json({
            code: 201,
            message: 'Reimbursement application submitted',
            data: reimbursement,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Apply reimbursement error:', error);
        res.status(400).json({
            code: 400,
            message: error.message || 'Failed to apply for reimbursement',
            timestamp: new Date().toISOString()
        });
    }
});
// GET /api/reimbursement/my - Get my reimbursement records
router.get('/my', auth_1.authenticate, async (req, res) => {
    try {
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const { status, startDate, endDate } = req.query;
        const reimbursements = await ReimbursementService.getStaffReimbursements(staff.id, {
            status: status,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        });
        res.json({
            code: 200,
            data: reimbursements,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get my reimbursements error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get reimbursements' });
    }
});
// PUT /api/reimbursement/cancel/:id - Cancel my reimbursement application
router.put('/cancel/:id', auth_1.authenticate, async (req, res) => {
    try {
        const staff = await database_1.default.staff.findFirst({
            where: { userId: req.user.id }
        });
        if (!staff) {
            return res.status(404).json({ code: 404, message: 'Staff profile not found' });
        }
        const reimbursement = await ReimbursementService.cancelReimbursement(req.params.id, staff.id);
        res.json({
            code: 200,
            message: 'Reimbursement cancelled',
            data: reimbursement,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Cancel reimbursement error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to cancel reimbursement' });
    }
});
// POST /api/reimbursement/upload - Upload receipt images
router.post('/upload', auth_1.authenticate, upload.array('receipts', 5), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ code: 400, message: 'No files uploaded' });
        }
        const receiptUrls = files.map(file => `/uploads/reimbursements/${file.filename}`);
        res.json({
            code: 200,
            message: 'Files uploaded successfully',
            data: { receiptUrls },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to upload files' });
    }
});
// ============================================
// Admin/Manager APIs
// ============================================
// GET /api/reimbursement/list - Get all reimbursement applications
router.get('/list', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { storeId, status, staffId, startDate, endDate } = req.query;
        let targetStoreId = storeId;
        if (!targetStoreId) {
            if (req.user.role === 'staff' || req.user.role === 'cashier') {
                targetStoreId = req.user.storeId;
            }
        }
        const reimbursements = await ReimbursementService.getStoreReimbursements(targetStoreId, {
            status: status,
            staffId: staffId,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined
        });
        res.json({
            code: 200,
            data: reimbursements,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get reimbursements error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get reimbursements' });
    }
});
// GET /api/reimbursement/:id - Get reimbursement detail
router.get('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const reimbursement = await ReimbursementService.getReimbursementById(req.params.id);
        if (!reimbursement) {
            return res.status(404).json({ code: 404, message: 'Reimbursement not found' });
        }
        // Check access permission
        if (req.user.role !== 'admin' && req.user.role !== 'manager') {
            const staff = await database_1.default.staff.findFirst({
                where: { userId: req.user.id }
            });
            if (!staff || reimbursement.staffId !== staff.id) {
                return res.status(403).json({ code: 403, message: 'Not authorized' });
            }
        }
        res.json({
            code: 200,
            data: reimbursement,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get reimbursement error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get reimbursement' });
    }
});
// PUT /api/reimbursement/approve/:id - Approve reimbursement
router.put('/approve/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const reimbursement = await ReimbursementService.approveReimbursement(req.params.id, req.user.id);
        res.json({
            code: 200,
            message: 'Reimbursement approved',
            data: reimbursement,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Approve reimbursement error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to approve reimbursement' });
    }
});
// PUT /api/reimbursement/reject/:id - Reject reimbursement
router.put('/reject/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { reason } = req.body;
        const reimbursement = await ReimbursementService.rejectReimbursement(req.params.id, req.user.id, reason || '');
        res.json({
            code: 200,
            message: 'Reimbursement rejected',
            data: reimbursement,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Reject reimbursement error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to reject reimbursement' });
    }
});
// PUT /api/reimbursement/mark-paid/:id - Mark as paid
router.put('/mark-paid/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const reimbursement = await ReimbursementService.markAsPaid(req.params.id, req.user.id);
        res.json({
            code: 200,
            message: 'Reimbursement marked as paid',
            data: reimbursement,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Mark paid error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Failed to mark as paid' });
    }
});
//# sourceMappingURL=reimbursement.js.map