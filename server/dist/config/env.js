"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
    jwt: {
        secret: (() => {
            const secret = process.env.JWT_SECRET;
            if (!secret && process.env.NODE_ENV === 'production') {
                throw new Error('JWT_SECRET environment variable is required in production');
            }
            return secret || 'dev-only-secret-do-not-use-in-production';
        })(),
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },
    corsOrigin: (() => {
        const origin = process.env.CORS_ORIGIN;
        if (!origin && process.env.NODE_ENV === 'production') {
            throw new Error('CORS_ORIGIN environment variable is required in production');
        }
        return origin || 'http://localhost:5173,http://localhost:3000';
    })(),
    indonesia: {
        timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta',
        currency: process.env.DEFAULT_CURRENCY || 'IDR',
        locale: process.env.DEFAULT_LOCALE || 'id',
        ppnRate: parseFloat(process.env.PPN_RATE || '0.11')
    }
};
//# sourceMappingURL=env.js.map