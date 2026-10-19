// A manual/test pulse requires durable server evidence first. A failed outcome
// upload must never cause another pulse: delivery remains unknown, not retryable.
export async function auditedDrawer(
  audit: (event: any) => Promise<unknown>,
  send: () => Promise<{ success?: boolean; error?: string } | undefined>,
  metadata: { source: 'manual' | 'test' | 'admin_test'; reason: string; [key: string]: unknown },
  operationId: string,
) {
  const event = { action: 'cash_drawer', entityId: operationId, description: 'Cash drawer command', severity: 'warning' as const }
  await audit({ ...event, metadata: { ...metadata, operationId, status: 'requested', physicalState: 'unknown' } })
  let result: { success?: boolean; error?: string } | undefined
  try { result = await send() } catch { result = { success: false, error: 'DELIVERY_UNCONFIRMED' } }
  try { await audit({ ...event, metadata: { ...metadata, operationId, status: result?.success ? 'sent' : 'unconfirmed', physicalState: 'unknown' } }) }
  catch { return { ...result, auditPending: true } }
  return { ...result, auditPending: false }
}
