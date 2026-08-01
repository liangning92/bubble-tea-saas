"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.register = register;
exports.getCurrentUser = getCurrentUser;
exports.changePassword = changePassword;
exports.resetPassword = resetPassword;
exports.refreshToken = refreshToken;
const database_1 = __importDefault(require("../config/database"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
// Login
async function login(data) {
    const { phone, password } = data;
    // Find user
    const user = await database_1.default.user.findUnique({
        where: { phone },
        include: {
            staff: {
                include: { store: true }
            }
        }
    });
    if (!user) {
        throw new Error('Invalid phone or password');
    }
    // Verify password
    const valid = await bcryptjs_1.default.compare(password, user.password);
    if (!valid) {
        throw new Error('Invalid phone or password');
    }
    // Check if staff is active
    if (user.staff && user.staff.status !== 'active') {
        throw new Error('Account is deactivated');
    }
    // Generate JWT
    const token = jsonwebtoken_1.default.sign({
        id: user.id,
        phone: user.phone,
        role: user.role,
        storeId: user.staff?.storeId || '',
        staffId: user.staff?.id || ''
    }, env_1.config.jwt.secret, { expiresIn: env_1.config.jwt.expiresIn });
    return {
        token,
        user: {
            id: user.id,
            phone: user.phone,
            name: user.staff?.name || user.phone,
            role: user.role,
            storeId: user.staff?.storeId || '',
            staff: user.staff ? {
                id: user.staff.id,
                name: user.staff.name,
                position: user.staff.position
            } : null
        }
    };
}
// Register
async function register(data) {
    const { phone, password, name, storeId, role = 'cashier' } = data;
    // Check if phone exists
    const existing = await database_1.default.user.findUnique({
        where: { phone }
    });
    if (existing) {
        throw new Error('Phone number already registered');
    }
    // Hash password
    const hashedPassword = await bcryptjs_1.default.hash(password, 10);
    // Create user and staff in transaction
    const result = await database_1.default.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                phone,
                password: hashedPassword,
                role
            }
        });
        const staff = await tx.staff.create({
            data: {
                userId: user.id,
                storeId,
                name,
                employeeNumber: `EMP${Date.now().toString().slice(-6)}`,
                position: role === 'admin' ? 'Manager' : 'Cashier',
                status: 'active'
            }
        });
        return { user, staff };
    });
    // Generate token
    const token = jsonwebtoken_1.default.sign({
        id: result.user.id,
        phone: result.user.phone,
        role: result.user.role,
        storeId,
        staffId: result.staff.id
    }, env_1.config.jwt.secret, { expiresIn: env_1.config.jwt.expiresIn });
    return {
        token,
        user: {
            id: result.user.id,
            phone: result.user.phone,
            name: result.staff.name,
            role: result.user.role,
            storeId,
            staff: {
                id: result.staff.id,
                name: result.staff.name,
                position: result.staff.position
            }
        }
    };
}
// Get current user
async function getCurrentUser(userId) {
    const user = await database_1.default.user.findUnique({
        where: { id: userId },
        include: {
            staff: {
                include: { store: true }
            }
        }
    });
    if (!user) {
        throw new Error('User not found');
    }
    return {
        id: user.id,
        phone: user.phone,
        name: user.staff?.name || user.phone,
        role: user.role,
        storeId: user.staff?.storeId || '',
        staff: user.staff ? {
            id: user.staff.id,
            name: user.staff.name,
            position: user.staff.position
        } : null
    };
}
// Change password
async function changePassword(userId, oldPassword, newPassword) {
    const user = await database_1.default.user.findUnique({
        where: { id: userId }
    });
    if (!user) {
        throw new Error('User not found');
    }
    // Verify old password
    const valid = await bcryptjs_1.default.compare(oldPassword, user.password);
    if (!valid) {
        throw new Error('Current password is incorrect');
    }
    // Hash new password
    const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
    await database_1.default.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
    });
    return { success: true };
}
// Reset password (admin function)
async function resetPassword(userId, newPassword) {
    const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
    await database_1.default.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
    });
    return { success: true };
}
// Refresh token
async function refreshToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwt.secret);
        const user = await database_1.default.user.findUnique({
            where: { id: decoded.id },
            include: { staff: true }
        });
        if (!user) {
            throw new Error('User not found');
        }
        // Generate new token
        const newToken = jsonwebtoken_1.default.sign({
            id: user.id,
            phone: user.phone,
            role: user.role,
            storeId: user.staff?.storeId || '',
            staffId: user.staff?.id || ''
        }, env_1.config.jwt.secret, { expiresIn: env_1.config.jwt.expiresIn });
        return { token: newToken };
    }
    catch (error) {
        throw new Error('Invalid token');
    }
}
//# sourceMappingURL=AuthService.js.map