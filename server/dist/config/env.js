"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
// Only load .env in development mode, not production
if (process.env.NODE_ENV !== 'production') {
    dotenv_1.default.config();
}
const jwtSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32)) {
    throw new Error('JWT_SECRET must be configured in production with at least 32 bytes');
}
exports.config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
    jwt: {
        secret: jwtSecret || (0, crypto_1.randomBytes)(32).toString('hex'),
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },
    corsOrigin: (() => {
        const origin = process.env.CORS_ORIGIN;
        if (!origin) {
            // Desktop packaged app: fork() doesn't pass CORS_ORIGIN, use localhost fallback
            console.warn('[env] CORS_ORIGIN not set, using localhost fallback (safe for local desktop app)');
            return 'http://localhost:5173,http://localhost:3000';
        }
        return origin;
    })(),
    indonesia: {
        timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Jakarta',
        currency: process.env.DEFAULT_CURRENCY || 'IDR',
        locale: process.env.DEFAULT_LOCALE || 'id',
        ppnRate: parseFloat(process.env.PPN_RATE || '0.11')
    }
};
//# sourceMappingURL=env.js.map