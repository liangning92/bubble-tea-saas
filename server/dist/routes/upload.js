"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = void 0;
const express_1 = require("express");
// @ts-ignore - multer types not available
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
exports.uploadRouter = router;
// Ensure upload directories exist
const dirs = ['uploads/products', 'uploads/receipts', 'uploads/attachments', 'uploads/avatars', 'uploads/dualScreen'];
dirs.forEach(dir => {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
});
// Configure multer for different file types
const createStorage = (subDir) => multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, `uploads/${subDir}/`);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const filename = `${(0, uuid_1.v4)()}${ext}`;
        cb(null, filename);
    }
});
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf'
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP and PDF are allowed.'));
    }
};
// Video filter for dualScreen uploads
const videoFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/ogg'
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, MP4, WebM and OGG are allowed.'));
    }
};
const limits = {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5
};
// Upload middleware factories
const uploadProduct = (0, multer_1.default)({
    storage: createStorage('products'),
    fileFilter,
    limits
});
const uploadReceipt = (0, multer_1.default)({
    storage: createStorage('receipts'),
    fileFilter,
    limits
});
const uploadAttachment = (0, multer_1.default)({
    storage: createStorage('attachments'),
    fileFilter,
    limits: { ...limits, files: 10 }
});
const uploadAvatar = (0, multer_1.default)({
    storage: createStorage('avatars'),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only images are allowed for avatars'));
        }
    },
    limits: { ...limits, files: 1 }
});
const uploadDualScreen = (0, multer_1.default)({
    storage: createStorage('dualScreen'),
    fileFilter: videoFilter,
    limits: { fileSize: 50 * 1024 * 1024, files: 10 } // 50MB max, 10 files
});
// POST /api/upload/product - Upload product image
router.post('/product', auth_1.authenticate, uploadProduct.array('images', 5), (req, res) => {
    try {
        const files = req.files;
        const urls = files.map(file => `/uploads/products/${file.filename}`);
        res.json({
            code: 200,
            message: 'Images uploaded successfully',
            data: { urls, filenames: files.map(f => f.filename) },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Upload product image error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Upload failed' });
    }
});
// POST /api/upload/receipt - Upload receipt image
router.post('/receipt', auth_1.authenticate, uploadReceipt.array('receipts', 5), (req, res) => {
    try {
        const files = req.files;
        const urls = files.map(file => `/uploads/receipts/${file.filename}`);
        res.json({
            code: 200,
            message: 'Receipts uploaded successfully',
            data: { urls, filenames: files.map(f => f.filename) },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Upload receipt error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Upload failed' });
    }
});
// POST /api/upload/attachment - Upload general attachment
router.post('/attachment', auth_1.authenticate, uploadAttachment.array('files', 10), (req, res) => {
    try {
        const files = req.files;
        const urls = files.map(file => `/uploads/attachments/${file.filename}`);
        res.json({
            code: 200,
            message: 'Files uploaded successfully',
            data: { urls, filenames: files.map(f => f.filename) },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Upload attachment error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Upload failed' });
    }
});
// POST /api/upload/avatar - Upload avatar image
router.post('/avatar', auth_1.authenticate, uploadAvatar.single('avatar'), (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ code: 400, message: 'No file uploaded' });
        }
        const url = `/uploads/avatars/${file.filename}`;
        res.json({
            code: 200,
            message: 'Avatar uploaded successfully',
            data: { url, filename: file.filename },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Upload avatar error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Upload failed' });
    }
});
// POST /api/upload/dualScreen - Upload dual screen images/videos
router.post('/dualScreen', auth_1.authenticate, uploadDualScreen.array('files', 10), (req, res) => {
    try {
        const files = req.files;
        const urls = files.map(file => `/uploads/dualScreen/${file.filename}`);
        const fileInfos = files.map(file => ({
            url: `/uploads/dualScreen/${file.filename}`,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            isVideo: file.mimetype.startsWith('video/')
        }));
        res.json({
            code: 200,
            message: 'Files uploaded successfully',
            data: { urls, files: fileInfos },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Upload dualScreen error:', error);
        res.status(400).json({ code: 400, message: error.message || 'Upload failed' });
    }
});
// DELETE /api/upload/:type/:filename - Delete uploaded file
router.delete('/:type/:filename', auth_1.authenticate, (req, res) => {
    try {
        const { type, filename } = req.params;
        const allowedTypes = ['products', 'receipts', 'attachments', 'avatars', 'dualScreen'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({ code: 400, message: 'Invalid file type' });
        }
        const filepath = path_1.default.join('uploads', type, filename);
        if (!fs_1.default.existsSync(filepath)) {
            return res.status(404).json({ code: 404, message: 'File not found' });
        }
        fs_1.default.unlinkSync(filepath);
        res.json({
            code: 200,
            message: 'File deleted successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ code: 500, message: 'Delete failed' });
    }
});
//# sourceMappingURL=upload.js.map