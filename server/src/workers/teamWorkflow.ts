import prisma from '../config/database'
import { teamWorkflow } from '../services/TeamWorkflowService'

/** Explicit separate process; never imported by API startup. No cross-store scan. */
export async function runTeamWorkflowWorker() {
  const storeId = process.env.TEAM_WORKFLOW_STORE_ID
  if (process.env.TEAM_WORKFLOW_RUN !== '1' || !storeId || storeId.length > 128) throw new Error('TEAM_WORKFLOW_EXPLICIT_SINGLE_STORE_START_REQUIRED')
  const workflow = teamWorkflow(), controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
  try {
    while (!controller.signal.aborted) {
      try { await workflow.runBatch(storeId) }
      catch { console.error('TEAM_WORKFLOW_BATCH_FAILED') } // No employee text, credentials or provider responses.
      if (!controller.signal.aborted) await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve() }
        const timer = setTimeout(done, 2000); controller.signal.addEventListener('abort', done, { once: true })
      })
    }
  } finally {
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop)
    await prisma.$disconnect()
  }
}
if (require.main === module) runTeamWorkflowWorker().catch(() => { console.error('TEAM_WORKFLOW_START_FAILED'); process.exitCode = 1 })
