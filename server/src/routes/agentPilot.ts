import express, { Express } from 'express'
import { AgentPilotHost, AGENT_PILOT_METADATA_PATH, AGENT_PILOT_AS_METADATA_PATH, AGENT_PILOT_MODEL_PATH } from '../services/agentTasks/host'

/** Fixed explicit task metadata protocol, not an arbitrary OpenAI messages proxy.
 * The reverse proxy must preserve the canonical Host. Forwarded headers grant no trust.
 */
export function mountAgentPilot(app: Express, host: AgentPilotHost) {
  const paths = ['/mcp/agent-tasks', AGENT_PILOT_METADATA_PATH, AGENT_PILOT_AS_METADATA_PATH, AGENT_PILOT_MODEL_PATH]
  app.all(paths, (req, res, next) => {
    if (host.status().state === 'disabled' || host.status().code === 'AGENT_PILOT_STARTUP_INVALID') return res.status(503).json({ error: 'AGENT_TASK_PILOT_UNAVAILABLE' })
    const hosts = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'host')
    if (hosts.length !== 1 || !['api.aicube.online', 'api.aicube.online:443'].includes((req.headers.host || '').toLowerCase())) return res.sendStatus(403)
    next()
  }, express.json({ limit: 131072, strict: true }), async (req, res) => {
    try {
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) if (value !== undefined && !['forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'content-length'].includes(name.toLowerCase())) headers.set(name, Array.isArray(value) ? value.join(',') : value)
      const url = new URL(req.originalUrl, 'https://api.aicube.online')
      if (url.origin !== 'https://api.aicube.online' || !paths.includes(url.pathname)) return res.sendStatus(404)
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : req.body === undefined ? '' : JSON.stringify(req.body)
      if (body && Buffer.byteLength(body) > 131072) return res.sendStatus(413)
      const response = await host.fetch(new Request(url, { method: req.method, headers, ...(body !== undefined ? { body } : {}) }))
      response.headers.forEach((value, name) => res.setHeader(name, value))
      res.status(response.status).send(Buffer.from(await response.arrayBuffer()))
    } catch { res.status(500).json({ error: 'AGENT_PILOT_HTTP_REJECTED' }) }
  })
  app.use(paths, (error: any, _req: any, res: any, _next: any) => {
    res.status(error?.status === 413 ? 413 : 400).json({ error: 'AGENT_PILOT_BODY_REJECTED' })
  })
}
