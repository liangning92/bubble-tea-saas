"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = validateBody;
exports.validateQuery = validateQuery;
function validateBody(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.body);
            if (!result.success) {
                return res.status(400).json({
                    code: 400,
                    message: 'Validation failed',
                    errors: result.error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            req.body = result.data;
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
function validateQuery(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.query);
            if (!result.success) {
                return res.status(400).json({
                    code: 400,
                    message: 'Validation failed',
                    errors: result.error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            req.query = result.data;
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
//# sourceMappingURL=validation.js.map