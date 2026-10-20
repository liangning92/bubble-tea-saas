import prisma from '../config/database'
import { packagingInspection } from '../services/PackagingInspectionService'

/** Opt-in separate process. API startup never imports or starts this worker. */
export async function runPackagingInspectionWorker(service = packagingInspection(), db: any = prisma, intervalMs = 30000) {
  const storeId = process.env.PACKAGING_INSPECTION_STORE_ID
  if (process.env.PACKAGING_INSPECTION_RUN !== '1' || !storeId || storeId.length > 128) throw new Error('INSPECTION_EXPLICIT_SINGLE_STORE_START_REQUIRED')
  const controller = new AbortController(), stop = () => controller.abort()
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
  console.log('PACKAGING_INSPECTION_WORKER_STARTED')
  try {
    while (!controller.signal.aborted) {
      try {
        const state = await service.runBatch(storeId)
        console.log(JSON.stringify({ event: 'inspection_scan', checkedAt: state.checkedAt, states: state.states, error: state.error }))
      } catch { console.error('PACKAGING_INSPECTION_BATCH_FAILED') }
      if (!controller.signal.aborted) await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve() }
        const timer = setTimeout(done, intervalMs); controller.signal.addEventListener('abort', done, { once: true })
      })
    }
  } finally {
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop)
    await db.$disconnect()
    console.log('PACKAGING_INSPECTION_WORKER_STOPPED')
  }
}
if (require.main === module) runPackagingInspectionWorker().catch(() => { console.error('PACKAGING_INSPECTION_START_FAILED'); process.exitCode = 1 })
