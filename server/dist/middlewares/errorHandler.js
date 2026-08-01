"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, next) {
    console.error('Error:', err);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    res.status(statusCode).json({
        code: statusCode,
        message,
        errors: err.errors || undefined,
        timestamp: new Date().toISOString(),
        path: req.path
    });
}
//# sourceMappingURL=errorHandler.js.map