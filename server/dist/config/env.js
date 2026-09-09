"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// Only load .env in development mode, not production
if (process.env.NODE_ENV !== 'production') {
    dotenv_1.default.config();
}
exports.config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
    jwt: {
        secret: (() => {
            const secret = process.env.JWT_SECRET;
            if (!secret) {
                // Desktop packaged app: fork() doesn't pass JWT_SECRET, use dev fallback
                // This is safe because POS→server communication is local (127.0.0.1)
                console.warn('[env] JWT_SECRET not set, using dev fallback (safe for local desktop app)');
                return 'dev-only-secret-do-not-use-in-production';
            }
            return secret;
        })(),
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