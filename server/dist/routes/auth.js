"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const database_1 = __importDefault(require("../config/database"));
const env_1 = require("../config/env");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../utils/validation");
const router = (0, express_1.Router)();
exports.authRouter = router;
// Rate limiter for auth endpoints - prevent brute force attacks
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: { error: 'Too many login attempts, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});
// Validation schemas
const registerSchema = zod_1.z.object({
    phone: zod_1.z.string().min(10).max(15),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().min(1).max(50),
    storeId: zod_1.z.string().optional(),
    role: zod_1.z.enum(['admin', 'manager', 'staff', 'cashier']).default('staff')
});
const loginSchema = zod_1.z.object({
    phone: zod_1.z.string(),
    password: zod_1.z.string()
});
// POST /api/auth/register
router.post('/register', authLimiter, (0, validation_1.validateBody)(registerSchema), async (req, res) => {
    try {
        const { phone, password, name, storeId, role } = req.body;
        // Check if user exists
        const existing = await database_1.default.user.findUnique({ where: { phone } });
        if (existing) {
            return res.status(400).json({
                code: 400,
                message: 'Phone number already registered'
            });
        }
        // Hash password
        const hashed = await bcryptjs_1.default.hash(password, 10);
        // Create user first
        const user = await database_1.default.user.create({
            data: {
                phone,
                password: hashed,
                role,
                storeId
            }
        });
        // Create staff profile if storeId provided
        let staffData = null;
        if (storeId) {
            const staff = await database_1.default.staff.create({
                data: {
                    userId: user.id,
                    storeId,
                    name,
                    employeeNumber: `EMP${Date.now().toString().slice(-6)}`,
                    position: role === 'cashier' ? '收银员' : '店员'
                }
            });
            staffData = {
                id: staff.id,
                name: staff.name,
                employeeNumber: staff.employeeNumber,
                position: staff.position
            };
        }
        // Generate token - include staffId if user has a staff profile
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            phone: user.phone,
            role: String(user.role),
            storeId: user.storeId || '',
            staffId: staffData?.id || ''
        }, env_1.config.jwt.secret, { expiresIn: env_1.config.jwt.expiresIn });
        res.status(201).json({
            code: 201,
            message: 'Registration successful',
            data: {
                token,
                user: {
                    id: user.id,
                    phone: user.phone,
                    role: user.role,
                    storeId: user.storeId,
                    staff: staffData
                }
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ code: 500, message: 'Registration failed' });
    }
});
// POST /api/auth/login
router.post('/login', authLimiter, (0, validation_1.validateBody)(loginSchema), async (req, res) => {
    try {
        const { phone, password } = req.body;
        // Find user
        const user = await database_1.default.user.findUnique({
            where: { phone },
            include: { staff: true }
        });
        if (!user) {
            return res.status(401).json({
                code: 401,
                message: 'Invalid phone or password'
            });
        }
        // Check password
        const valid = await bcryptjs_1.default.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({
                code: 401,
                message: 'Invalid phone or password'
            });
        }
        // Generate token - include staffId if user has a staff profile
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            phone: user.phone,
            role: String(user.role),
            storeId: user.storeId || '',
            staffId: user.staff?.id || ''
        }, env_1.config.jwt.secret, { expiresIn: env_1.config.jwt.expiresIn });
        res.json({
            code: 200,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    phone: user.phone,
                    role: user.role,
                    storeId: user.storeId,
                    staff: user.staff ? {
                        id: user.staff.id,
                        name: user.staff.name,
                        employeeNumber: user.staff.employeeNumber,
                        position: user.staff.position
                    } : null
                }
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ code: 500, message: 'Login failed' });
    }
});
// GET /api/auth/me
router.get('/me', auth_1.authenticate, async (req, res) => {
    try {
        const user = await database_1.default.user.findUnique({
            where: { id: req.user.id },
            include: { staff: true, store: true }
        });
        if (!user) {
            return res.status(404).json({ code: 404, message: 'User not found' });
        }
        res.json({
            code: 200,
            data: {
                id: user.id,
                phone: user.phone,
                role: user.role,
                storeId: user.storeId,
                store: user.store ? { id: user.store.id, name: user.store.name } : null,
                staff: user.staff ? {
                    id: user.staff.id,
                    name: user.staff.name,
                    employeeNumber: user.staff.employeeNumber,
                    position: user.staff.position
                } : null
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get user info' });
    }
});
// PUT /api/auth/password
router.put('/password', auth_1.authenticate, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await database_1.default.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return res.status(404).json({ code: 404, message: 'User not found' });
        }
        const valid = await bcryptjs_1.default.compare(oldPassword, user.password);
        if (!valid) {
            return res.status(400).json({ code: 400, message: 'Incorrect old password' });
        }
        const hashed = await bcryptjs_1.default.hash(newPassword, 10);
        await database_1.default.user.update({
            where: { id: user.id },
            data: { password: hashed }
        });
        res.json({
            code: 200,
            message: 'Password updated successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Password update error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update password' });
    }
});
//# sourceMappingURL=auth.js.map