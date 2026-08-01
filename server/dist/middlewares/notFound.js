"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = notFoundHandler;
function notFoundHandler(req, res) {
    res.status(404).json({
        code: 404,
        message: `Route ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString()
    });
}
//# sourceMappingURL=notFound.js.map