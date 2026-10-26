import { useEffect, useRef, useState } from 'react'
import type { TeamClient } from '../../../../shared/TeamCommunication'
import { teamAgentCopy } from './teamAgentCopy'

const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50 transition-colors'
const field = 'mt-1 w-full min-w-0 rounded-lg border bg-white p-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export interface ModulePermission {
  read: boolean
  write: boolean
}

export interface AgentPermissions {
  marketing: ModulePermission
  products: ModulePermission
  inventory: ModulePermission
  orders: ModulePermission
  members: ModulePermission
  finance: ModulePermission
  staff: ModulePermission
  hygiene: ModulePermission
  channels: ModulePermission
}

export interface AgentSettingsData {
  version: number
  enabled: boolean
  agentName: string
  agentOrigin: string
  pdcaPilotEnabled: boolean
  employeeBridgeEnabled: boolean
  allChannelsAllowed: boolean
  memoryEnabled: boolean
  learningEnabled: boolean
  photoRecognitionEnabled: boolean
  expiresAt: string | null
  taskTimeoutMinutes: number
  requireHumanReview: boolean
  permissions: AgentPermissions
}

interface CapabilityItem {
  id: string
  name: string
  description: string
  tools: string[]
  active: boolean
}

interface SystemStateData {
  pilotState: 'running' | 'disabled' | 'failed'
  employeeBridgeConfigured: boolean
  runtimeAvailable: boolean
  hostOrigin: string
  capabilities: CapabilityItem[]
}

interface CheckResult {
  status: 'ready' | 'standby' | 'disabled'
  reachable: boolean
  latencyMs: number
  checkedAt: string
  details: string
}

const moduleKeys = [
  'products',
  'inventory',
  'orders',
  'members',
  'marketing',
  'finance',
  'staff',
  'hygiene',
  'channels'
] as const

type ModuleKey = (typeof moduleKeys)[number]

const highRiskModules: ModuleKey[] = ['finance', 'orders', 'inventory']

export function TeamAgentSettings({
  client,
  language
}: {
  client: Pick<TeamClient, 'request' | 'current'>
  language: string
}) {
  const c = teamAgentCopy(language)
  const [base, setBase] = useState<AgentSettingsData | null>(null)
  const [draft, setDraft] = useState<AgentSettingsData | null>(null)
  const [systemState, setSystemState] = useState<SystemStateData | null>(null)
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const alive = useRef(true)
  const epoch = useRef(0)

  const current = () => alive.current && client.current()
  const dirty = !!base && !!draft && JSON.stringify(base) !== JSON.stringify(draft)

  async function load() {
    const reqId = ++epoch.current
    setLoading(true)
    setError('')
    try {
      const resp = await client.request('get', '/team/ai/agent-settings')
      if (current() && reqId === epoch.current) {
        setBase(resp.settings)
        setDraft(resp.settings)
        setSystemState(resp.systemState)
      }
    } catch {
      if (current() && reqId === epoch.current) setError(c.loadError)
    } finally {
      if (current() && reqId === epoch.current) setLoading(false)
    }
  }

  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
      epoch.current++
    }
  }, [client])

  function updateDraft(patch: Partial<AgentSettingsData>) {
    if (!draft) return
    setDraft({ ...draft, ...patch })
    setError('')
    setNotice('')
  }

  function updatePermission(mod: ModuleKey, type: 'read' | 'write', val: boolean) {
    if (!draft) return
    const curMod = draft.permissions?.[mod] || { read: false, write: false }
    const nextPerms = {
      ...draft.permissions,
      [mod]: {
        ...curMod,
        [type]: val
      }
    }
    updateDraft({ permissions: nextPerms })
  }

  async function handleSave() {
    if (!draft || !base || busy || checking) return
    const reqId = ++epoch.current
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const saved = await client.request('put', '/team/ai/agent-settings', draft)
      if (current() && reqId === epoch.current) {
        setBase(saved)
        setDraft(saved)
        setNotice(c.saved)
      }
    } catch (e: any) {
      if (current() && reqId === epoch.current) {
        const msg = e?.response?.data?.message
        setError(msg === 'TEAM_VERSION_CONFLICT' ? c.conflictError : c.saveError)
      }
    } finally {
      if (current() && reqId === epoch.current) setBusy(false)
    }
  }

  async function handleCheck() {
    if (busy || checking) return
    const reqId = ++epoch.current
    setChecking(true)
    setError('')
    setNotice('')
    try {
      const res = await client.request('post', '/team/ai/agent-check', {})
      if (current() && reqId === epoch.current) {
        setCheckResult(res)
      }
    } catch {
      if (current() && reqId === epoch.current) {
        setError(c.checkFailed)
      }
    } finally {
      if (current() && reqId === epoch.current) setChecking(false)
    }
  }

  if (loading && !draft) {
    return <div role="status" className="rounded-xl border bg-white p-6 text-sm text-gray-500">{c.checking}</div>
  }

  if (!draft || !base) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <p role="alert" className="text-sm text-red-600">{error || c.loadError}</p>
        <button className={`${button} mt-3`} onClick={() => void load()}>{c.refreshButton}</button>
      </div>
    )
  }

  const agentActive = draft.enabled
  const statusBadge = checking ? (
    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{c.checking}</span>
  ) : (checkResult?.status === 'ready'||!checkResult&&systemState?.runtimeAvailable&&agentActive) ? (
    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">{c.ready}</span>
  ) : checkResult?.status === 'standby' ? (
    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">{c.standby}</span>
  ) : agentActive ? (
    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{c.standby}</span>
  ) : (
    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">{c.disabled}</span>
  )

  return (
    <div className="space-y-5" data-testid="team-agent-settings">
      {/* 头部状态与诊断面板 */}
      <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="agent-settings-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="agent-settings-header" className="text-base font-semibold text-gray-900">{c.title}</h3>
            <p className="mt-1 text-xs text-gray-500">{c.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge}
            <span className={`rounded-full px-3 py-1 text-xs ${dirty ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
              {dirty ? c.dirtyWarning : `${c.saveButton.slice(0, 2)} v${base.version}`}
            </span>
          </div>
        </div>

        {/* 诊断信息区域 */}
        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-gray-500">{c.statusCardTitle}</p>
              <p className="mt-1 text-sm font-semibold text-gray-800">
                {checkResult ? checkResult.details : (agentActive ? (systemState?.runtimeAvailable?c.ready:c.unreachable) : c.disabled)}
              </p>
              {checkResult?.checkedAt && (
                <time className="mt-1 block text-xs text-gray-400">
                  {new Date(checkResult.checkedAt).toLocaleTimeString(language)} · {c.latency}: {checkResult.latencyMs}ms
                </time>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`${button} bg-white hover:bg-gray-50`}
                disabled={busy || checking}
                onClick={() => void handleCheck()}
              >
                {checking ? c.checking : c.checkButton}
              </button>
              <button
                type="button"
                className={`${button} bg-white hover:bg-gray-50`}
                disabled={busy || checking}
                onClick={() => void load()}
              >
                {c.refreshButton}
              </button>
            </div>
          </div>
          {systemState && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-200/60 pt-2.5 text-xs text-gray-500">
              <span>{c.runtime}: <strong className="font-medium text-gray-700">{systemState.runtimeAvailable ? c.ready : c.unreachable}</strong></span>
              <span>PDCA Pilot: <strong className="font-medium text-gray-700">{systemState.pilotState === 'running' ? c.configured : c.disabled}</strong></span>
              <span>{c.employeeGateway}: <strong className="font-medium text-gray-700">{systemState.employeeBridgeConfigured ? c.configured : c.unreachable}</strong></span>
              <span>{c.agentOrigin}: <code className="rounded bg-gray-200/70 px-1 py-0.5 text-gray-700">{systemState.hostOrigin}</code></span>
            </div>
          )}
        </div>
      </section>

      {/* 1. 基础配置 */}
      <section className="rounded-xl border bg-white p-4 sm:p-6">
        <h4 className="font-semibold text-gray-900">{c.basicSection}</h4>
        <div className="mt-4 space-y-4">
          <label className="flex items-start gap-3 rounded-lg border bg-gray-50/50 p-3.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={draft.enabled}
              disabled={busy || checking}
              onChange={e => updateDraft({ enabled: e.target.checked })}
            />
            <div>
              <span className="text-sm font-medium text-gray-900">{c.enableSwitch}</span>
              <p className="mt-0.5 text-xs text-gray-500">{c.enableHelp}</p>
            </div>
          </label>

          {/* 全频道沟通开关 */}
          <label className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-primary text-primary focus:ring-primary"
              checked={draft.allChannelsAllowed}
              disabled={busy || checking || !draft.enabled}
              onChange={e => updateDraft({ allChannelsAllowed: e.target.checked })}
            />
            <div>
              <span className="text-sm font-semibold text-gray-900">{c.allChannelsTitle}</span>
              <p className="mt-0.5 text-xs text-gray-600 leading-relaxed">{c.allChannelsDesc}</p>
            </div>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-lg bg-gray-50 p-3 sm:col-span-2">
              <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={draft.photoRecognitionEnabled!==false} disabled={busy||checking} onChange={e=>updateDraft({photoRecognitionEnabled:e.target.checked})}/><span><strong className="font-medium">{c.photosEnabled}</strong><span className="mt-1 block text-xs text-gray-600">{c.photosHelp}</span></span></label>
              <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={draft.memoryEnabled!==false} disabled={busy||checking} onChange={e=>updateDraft({memoryEnabled:e.target.checked})}/><span><strong className="font-medium">{c.memoryEnabled}</strong><span className="mt-1 block text-xs text-gray-600">{c.memoryHelp}</span></span></label>
              <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={draft.learningEnabled!==false} disabled={busy||checking||draft.memoryEnabled===false} onChange={e=>updateDraft({learningEnabled:e.target.checked})}/><span><strong className="font-medium">{c.learningEnabled}</strong><span className="mt-1 block text-xs text-gray-600">{c.learningHelp}</span></span></label>
            </div>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-gray-700">{c.authorizationExpiry}</span>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={!draft.expiresAt} disabled={busy||checking} onChange={e=>updateDraft({expiresAt:e.target.checked?null:new Date(Date.now()+86400000).toISOString()})}/>{c.noExpiry}</label>
                {draft.expiresAt&&<input aria-label={c.authorizationExpiry} className={field} type="datetime-local" disabled={busy||checking} value={new Date(Date.parse(draft.expiresAt)-new Date(draft.expiresAt).getTimezoneOffset()*60000).toISOString().slice(0,16)} onChange={e=>{if(e.target.value)updateDraft({expiresAt:new Date(e.target.value).toISOString()})}}/>}
              </div>
              <span className="mt-1 block text-xs text-gray-500">{c.expiryHelp}</span>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{c.agentName}</span>
              <input
                className={field}
                value={draft.agentName}
                placeholder={c.agentNamePlaceholder}
                disabled={busy || checking}
                onChange={e => updateDraft({ agentName: e.target.value })}
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-700">{c.timeout}</span>
              <input
                className={field}
                type="number"
                min={1}
                max={1440}
                value={draft.taskTimeoutMinutes}
                disabled={busy || checking}
                onChange={e => updateDraft({ taskTimeoutMinutes: Math.max(1, Math.min(1440, Number(e.target.value) || 10)) })}
              />
              <span className="mt-1 block text-xs text-gray-500">{c.timeoutHelp}</span>
            </label>

            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-gray-700">{c.agentOrigin}</span>
              <input
                className={field}
                value={draft.agentOrigin}
                disabled={busy || checking}
                onChange={e => updateDraft({ agentOrigin: e.target.value })}
              />
              <span className="mt-1 block text-xs text-gray-500">{c.agentOriginHelp}</span>
            </label>
          </div>
        </div>
      </section>

      {/* 2. 权限设置矩阵（参考员工权限） */}
      <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="agent-permissions-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 id="agent-permissions-title" className="font-semibold text-gray-900">{c.permissionsSection}</h4>
            <p className="mt-0.5 text-xs text-gray-500">{c.permissionsSubtitle}</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{c.customPermissions}</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50/80 text-xs font-medium text-gray-600">
              <tr>
                <th className="px-4 py-3">{c.moduleName}</th>
                <th className="px-4 py-3 text-center w-36">{c.readPermission}</th>
                <th className="px-4 py-3 text-center w-36">{c.writePermission}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {moduleKeys.map(key => {
                const info = c.modules[key]
                const perm = draft.permissions?.[key] || { read: false, write: false }
                const isHighRisk = highRiskModules.includes(key)

                return (
                  <tr key={key} className="transition-colors hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{info.name}</span>
                        {isHighRisk && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200/50">
                            {c.riskHigh}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 leading-normal">{info.desc}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          checked={perm.read}
                          disabled={busy || checking || !draft.enabled}
                          onChange={e => updatePermission(key, 'read', e.target.checked)}
                        />
                        <span className="text-xs text-gray-700">{c.readPermission}</span>
                      </label>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className={`h-4 w-4 rounded border-gray-300 focus:ring-primary ${isHighRisk ? 'text-amber-600' : 'text-primary'}`}
                          checked={perm.write}
                          disabled={busy || checking || !draft.enabled}
                          onChange={e => updatePermission(key, 'write', e.target.checked)}
                        />
                        <span className="text-xs text-gray-700">{c.writePermission}</span>
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. 业务能力场景 */}
      <section className="rounded-xl border bg-white p-4 sm:p-6">
        <h4 className="font-semibold text-gray-900">{c.capabilitiesSection}</h4>
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={draft.pdcaPilotEnabled}
              disabled={busy || checking || !draft.enabled}
              onChange={e => updateDraft({ pdcaPilotEnabled: e.target.checked })}
            />
            <div className="min-w-0">
              <span className="text-sm font-semibold text-gray-900">{c.pdcaTitle}</span>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">{c.pdcaDesc}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['store_task_get', 'store_task_claim', 'store_task_read_stock_evidence', 'store_task_report'].map(tool => (
                  <span key={tool} className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600">{tool}</span>
                ))}
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={draft.employeeBridgeEnabled}
              disabled={busy || checking || !draft.enabled}
              onChange={e => updateDraft({ employeeBridgeEnabled: e.target.checked })}
            />
            <div className="min-w-0">
              <span className="text-sm font-semibold text-gray-900">{c.employeeBridgeTitle}</span>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">{c.employeeBridgeDesc}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['store_team_directory', 'store_team_channels', 'store_team_messages', 'store_team_send'].map(tool => (
                  <span key={tool} className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600">{tool}</span>
                ))}
              </div>
            </div>
          </label>
        </div>
      </section>

      {/* 4. 安全合规底线 */}
      <section className="rounded-xl border bg-white p-4 sm:p-6">
        <h4 className="font-semibold text-gray-900">{c.boundariesSection}</h4>
        <div className="mt-3 rounded-lg bg-gray-50 p-3.5 flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">{c.humanReview}</p>
            <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">{c.humanReviewDesc}</p>
          </div>
          <span className="shrink-0 rounded bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-200/50">
            {c.humanReview}
          </span>
        </div>
      </section>

      {/* 底部保存条 */}
      <div className="sticky bottom-0 z-10 rounded-xl border bg-white p-4 shadow-sm">
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="mb-3 text-sm text-green-600">{notice}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-gray-600">
            {busy ? c.saving : dirty ? c.dirtyWarning : `${c.saved} (v${base.version})`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || checking || !dirty}
              onClick={() => {
                setDraft(base)
                setError('')
                setNotice('')
              }}
            >
              {c.discard}
            </button>
            <button
              type="button"
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              disabled={busy || checking || !dirty}
              onClick={() => void handleSave()}
            >
              {busy ? c.saving : c.saveButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
