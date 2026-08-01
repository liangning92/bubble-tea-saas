"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hardwareRouter = void 0;
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.hardwareRouter = router;
// In-memory store for detected printers (persisted via POS client)
// This gets updated when POS client detects printers
let detectedPrinters = [];
let lastDetectionTime = null;
/**
 * GET /api/hardware/printers
 * Returns list of detected printers from POS client
 */
router.get('/printers', async (req, res) => {
    try {
        res.json({
            success: true,
            printers: detectedPrinters,
            lastDetection: lastDetectionTime,
            message: detectedPrinters.length > 0
                ? `${detectedPrinters.length} printer(s) detected`
                : 'No printers detected. Click "Detect Printers" on POS terminal.'
        });
    }
    catch (error) {
        console.error('[Hardware] Error getting printers:', error);
        res.status(500).json({ success: false, error: 'Failed to get printers' });
    }
});
/**
 * POST /api/hardware/printers
 * POS client posts detected printers list
 */
router.post('/printers', async (req, res) => {
    try {
        const { printers, storeId } = req.body;
        if (!Array.isArray(printers)) {
            res.status(400).json({ success: false, error: 'printers must be an array' });
            return;
        }
        detectedPrinters = printers;
        lastDetectionTime = new Date();
        res.json({
            success: true,
            printers: detectedPrinters,
            lastDetection: lastDetectionTime
        });
    }
    catch (error) {
        console.error('[Hardware] Error saving printers:', error);
        res.status(500).json({ success: false, error: 'Failed to save printers' });
    }
});
/**
 * POST /api/hardware/detect
 * Admin triggers printer detection on POS client
 * POS client polls this endpoint and responds with detected printers
 */
router.post('/detect', async (req, res) => {
    try {
        const { storeId } = req.body;
        // Store detection request - POS client will poll this
        // For now, just acknowledge the request
        res.json({
            success: true,
            message: 'Detection requested. POS client will respond shortly.',
            requestedAt: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('[Hardware] Error requesting detection:', error);
        res.status(500).json({ success: false, error: 'Failed to request detection' });
    }
});
/**
 * GET /api/hardware/detect
 * Check detection request status
 */
router.get('/detect', async (req, res) => {
    res.json({
        success: true,
        lastDetection: lastDetectionTime,
        printerCount: detectedPrinters.length
    });
});
/**
 * POST /api/hardware/test-print
 * Trigger a test print from POS client
 */
router.post('/test-print', async (req, res) => {
    try {
        const { printerName, storeId } = req.body;
        // Store test print request - POS client will poll this
        res.json({
            success: true,
            message: 'Test print requested. POS client will process shortly.',
            printerName,
            requestedAt: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('[Hardware] Error requesting test print:', error);
        res.status(500).json({ success: false, error: 'Failed to request test print' });
    }
});
/**
 * POST /api/hardware/test-drawer
 * Trigger a test cash drawer open from POS client
 */
router.post('/test-drawer', async (req, res) => {
    try {
        const { printerName, storeId } = req.body;
        res.json({
            success: true,
            message: 'Cash drawer test requested. POS client will process shortly.',
            printerName,
            requestedAt: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('[Hardware] Error requesting drawer test:', error);
        res.status(500).json({ success: false, error: 'Failed to request drawer test' });
    }
});
//# sourceMappingURL=hardware.js.map