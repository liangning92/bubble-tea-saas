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
  operationProfile?: 'custom' | 'store_operations'
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
  runtimeKind?:'hermes_native_api'
  pilotState: 'running' | 'disabled' | 'failed' | 'expired' | 'invalid' | 'unavailable'
  pdcaPilot?: { state: 'valid' | 'expired' | 'disabled' | 'invalid' | 'unavailable'; renewalRequired: boolean; startedAt?: string; expiresAt?: string }
  employeeBridgeConfigured: boolean
  runtimeAvailable: boolean
  hostOrigin: string
  latestExecution?: {phase:string;turn:number;inputs:number;responses:number;tools:number;faultCode:string|null;updatedAt:string}|null
  capabilities: CapabilityItem[]
}

interface CheckResult {
  status: 'ready' | 'standby' | 'disabled'
  reachable: boolean
  latencyMs: number
  checkedAt: string
  details: string
}

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
        setError(msg === 'TEAM_VERSION_CONFLICT' ? c.conflictError : msg === 'TEAM_AGENT_RESYNC_BUSY' ? c.resyncBusy : c.saveError)
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

  const nativeCopy=language==='zh'?{authority:'按当前账户权限执行',authorityHelp:'Hermes 使用后台现有功能、校验和账户权限。技能、文件、记忆与子 Agent 由原生运行时管理，不再逐项开通业务工具。不同账户、会话和受众的资料保持隔离。',capabilities:'Hermes 原生运行能力',capabilityHelp:'所有原生工具通过 Hermes 自身发现；需要额外凭据或费用的服务不会自动开通。日常工作自主执行；支付、超预算和员工处罚需要店主批准。'}:language==='id'?{authority:'Mengikuti izin akun yang meminta',authorityHelp:'Hermes memakai fungsi, validasi, dan izin akun di sistem toko. Keterampilan, berkas, memori, dan subagen dikelola oleh runtime asli, tanpa izin alat bisnis satu per satu. Data akun, percakapan, dan penerima tetap terpisah.',capabilities:'Kemampuan asli Hermes',capabilityHelp:'Hermes menemukan alat aslinya sendiri. Layanan yang memerlukan kredensial atau biaya tambahan tidak diaktifkan otomatis. Pekerjaan harian berjalan mandiri; pembayaran, biaya di luar anggaran, dan sanksi karyawan memerlukan persetujuan pemilik.'}:{authority:'Uses the requesting account’s permissions',authorityHelp:'Hermes uses the store’s existing functions, validation and account permissions. The native runtime manages skills, files, memory and subagents without separate business-tool switches. Accounts, conversations and audiences remain isolated.',capabilities:'Native Hermes capabilities',capabilityHelp:'Hermes discovers its own native tools. Services requiring additional credentials or fees are not activated automatically. Daily work runs independently; payments, over-budget spending and employee penalties require owner approval.'}
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

        {systemState?.latestExecution && (
          <p className="mt-3 break-words text-xs text-gray-600" data-testid="agent-execution-diagnostic">
            {c.recentExecution}: {systemState.latestExecution.phase}{systemState.runtimeKind!=='hermes_native_api'&&<> · {c.modelRounds}: {systemState.latestExecution.inputs}/{systemState.latestExecution.responses} · {c.businessTools}: {systemState.latestExecution.tools}</>}
            {systemState.latestExecution.faultCode && <span className="block text-red-700">{systemState.latestExecution.faultCode}</span>}
          </p>
        )}

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
              <span>{c.employeeGateway}: <strong className="font-medium text-gray-700">{systemState.employeeBridgeConfigured ? c.configured : c.unreachable}</strong></span>
              <span>{c.agentOrigin}: <code className="rounded bg-gray-200/70 px-1 py-0.5 text-gray-700">{systemState.hostOrigin}</code></span>
            </div>
          )}
          <details className="mt-4 rounded-lg border bg-white p-3.5 text-sm" data-testid="pdca-pilot-status"><summary className="cursor-pointer text-gray-600">{language.startsWith('zh') ? '历史 PDCA 试点诊断（不控制原生 Hermes）' : language.startsWith('id') ? 'Diagnostik pilot PDCA lama (tidak mengontrol Hermes asli)' : 'Legacy PDCA pilot diagnostics (does not control native Hermes)'}</summary><div className="mt-3" role="status">
            <h4 className="font-semibold text-gray-900">{c.pdcaStatus}</h4>
            <p className="mt-1 text-gray-800">{({ valid: c.pdcaValid, expired: c.pdcaExpired, disabled: c.pdcaDisabled, invalid: c.pdcaInvalid, unavailable: c.pdcaUnavailable })[systemState?.pdcaPilot?.state || 'unavailable']}</p>
            {systemState?.pdcaPilot?.startedAt && systemState.pdcaPilot.expiresAt && (
              <p className="mt-2 break-words text-xs text-gray-600">{c.pdcaPeriod}: {new Date(systemState.pdcaPilot.startedAt).toLocaleString(language === 'zh' ? 'zh-CN' : language === 'id' ? 'id-ID' : 'en-US', { timeZone: 'Asia/Jakarta' })} → {new Date(systemState.pdcaPilot.expiresAt).toLocaleString(language === 'zh' ? 'zh-CN' : language === 'id' ? 'id-ID' : 'en-US', { timeZone: 'Asia/Jakarta' })}</p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-gray-600">{systemState?.pdcaPilot?.renewalRequired ? c.pdcaRenewalHelp : c.pdcaStatusHelp}</p>
          </div></details>
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

          <div className="grid gap-4 sm:grid-cols-2">
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

            {systemState?.runtimeKind!=='hermes_native_api' && <label className="block text-sm">
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
            </label>}

            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-gray-700">{c.agentOrigin}</span>
              <input
                className={field}
                value={systemState?.hostOrigin||draft.agentOrigin}
                readOnly
                disabled
              />
              <span className="mt-1 block text-xs text-gray-500">{c.agentOriginHelp}</span>
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="agent-permissions-title">
        <h4 id="agent-permissions-title" className="font-semibold text-gray-900">{nativeCopy.authority}</h4>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{nativeCopy.authorityHelp}</p>
      </section>
      <section className="rounded-xl border bg-white p-4 sm:p-6">
        <h4 className="font-semibold text-gray-900">{nativeCopy.capabilities}</h4>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{nativeCopy.capabilityHelp}</p>
      </section>

      {/* 4. 安全合规底线 */}
      <section className="rounded-xl border bg-white p-4 sm:p-6">
        <h4 className="font-semibold text-gray-900">{c.boundariesSection}</h4>
        <div className="mt-3 rounded-lg bg-gray-50 p-3.5 flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">{c.humanReview}</p>
            <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">{nativeCopy.capabilityHelp}</p>
          </div>

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
          <div className="flex flex-wrap gap-2">
            {!dirty && (
              <button type="button" className={button} disabled={busy || checking} onClick={() => void handleSave()}>
                {c.resyncButton}
              </button>
            )}
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
