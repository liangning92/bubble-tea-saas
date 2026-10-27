import { exportInventoryEvidence, EvidenceExportError } from './InventoryEvidenceExport'

/** Persist audit before releasing bytes. No stock/order/recipe writes. */
export function inventoryEvidenceHandler(db: any) {
  return async (req: any, res: any) => {
    const audit = async (action: string, detail: any) => {
      if (!req.user?.storeId) return
      await db.financeAuditLog.create({ data: { storeId: req.user.storeId, userId: req.user.id,
        action: 'export', entityType: 'inventory_evidence', entityId: detail.exportId ?? 'request',
        description: action, newValue: JSON.stringify(detail) } })
    }
    try {
      const result = await exportInventoryEvidence(db, req.user, req.query)
      await audit('inventory_evidence_download', { exportId: result.exportId, contentHash: result.contentHash, query: result.data.query,
        evidenceStatus: result.data.evidenceStatus, generatedAt: result.generatedAt, movementCount: result.data.movements.length })
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="inventory-evidence-${result.contentHash}.json"`)
      // Scope and cost filtering occur before hashing. Avoid automatic res.json
      // redaction invalidating the signed content representation afterwards.
      res.send(JSON.stringify(result))
    } catch (error: any) {
      const status = error instanceof EvidenceExportError ? error.status : error?.name === 'ZodError' ? 400 : 500
      try { await audit('inventory_evidence_failed', { status, reason: status === 500 ? 'CAPTURE_OR_AUDIT_FAILED' : error.message }) }
      catch { return res.status(503).json({ code: 503, message: 'EVIDENCE_EXPORT_AUDIT_UNAVAILABLE' }) }
      res.status(status).json({ code: status, message: status === 500 ? 'EVIDENCE_EXPORT_FAILED' : error.message })
    }
  }
}
