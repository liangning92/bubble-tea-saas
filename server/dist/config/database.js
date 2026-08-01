"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
exports.prisma = global.prisma || new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    transactionOptions: {
        maxWait: 10000, // 10s max time to wait for a transaction slot
        timeout: 30000 // 30s max time for transaction to complete
    }
});
if (process.env.NODE_ENV !== 'production') {
    global.prisma = exports.prisma;
}
exports.default = exports.prisma;
//# sourceMappingURL=database.js.map