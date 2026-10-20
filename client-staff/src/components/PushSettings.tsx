import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { connectPushDevice, disconnectPushDevice, localTestReceipt, pushDeviceClient, pushIdentity, readLocalPushDevice, type LocalPushDevice, type PushDeviceCheck, type PushDeviceConfig } from '../services/pushDevice'
import { pushDeviceCopy } from './pushDeviceCopy'

interface State { identity: string; local?: LocalPushDevice; server?: PushDeviceCheck; config?: PushDeviceConfig; loading: boolean; error: string }
export function PushSettings() {
  const { i18n } = useTranslation(), w = pushDeviceCopy(i18n.language), { user, token } = useAuthStore(), [params] = useSearchParams()
  const identity = `${user?.id}:${user?.storeId}:${token || ''}`, client = useMemo(() => pushDeviceClient(identity), [identity])
  const [state, setState] = useState<State>({ identity, loading: true, error: '' }), [busy, setBusy] = useState(false)
  const requests = useRef(new Set<AbortController>()), sequence = useRef(0), working = useRef(false), testRequest = useRef<string | null>(null), pollUntil = useRef(0)
  const paramTest = params.get('pushTest') || undefined, targetTest = useRef(paramTest)
  const view = state.identity === identity ? state : { identity, loading: true, error: '' }
  const local = view.local, saved = view.server, test = saved?.test
  const current = () => client.current() && pushIdentity() === identity
  const controller = () => { const c = new AbortController(); requests.current.add(c); return c }
  const inspect = useCallback(async () => {
    const ticket = ++sequence.current, c = new AbortController(); requests.current.add(c)
    let observedDevice: LocalPushDevice | undefined
    try {
      if (!client.current()) return
      setState(previous => ({ ...previous, identity, loading: true, error: '' }))
      const device = await readLocalPushDevice(); observedDevice = device
      const config = await client.config(c.signal)
      let server = await client.check(device.subscriptionId, c.signal, targetTest.current)
      if (device.subscriptionId && server.test && device.supported) {
        const receipt = await localTestReceipt(server.test.id)
        for (const phase of ['displayed', 'opened'] as const) {
          if (receipt?.[phase === 'displayed' ? 'displayedAt' : 'openedAt'] && !server.test[phase === 'displayed' ? 'deviceReportedDisplayedAt' : 'deviceReportedOpenedAt'])
            await client.receipt(device.subscriptionId, server.test.id, phase, c.signal)
        }
        if (receipt) server = await client.check(device.subscriptionId, c.signal, targetTest.current)
      }
      if (client.current() && !c.signal.aborted && ticket === sequence.current) {
        setState({ identity, local: device, config, server, loading: false, error: '' })
        // Kept only for the legacy logout's per-device cleanup; never trusted as readiness.
        if (device.subscriptionId && server.subscription.state === 'ready') sessionStorage.setItem('employee-push-id', device.subscriptionId)
      }
    } catch {
      if (client.current() && !c.signal.aborted && ticket === sequence.current) setState({ identity, local: observedDevice, loading: false, error: 'failed' })
    } finally { requests.current.delete(c) }
  }, [client, identity])
  useEffect(() => { targetTest.current = paramTest; if (client.current()) void inspect() }, [paramTest, client, inspect])
  useEffect(() => {
    testRequest.current = null; pollUntil.current = 0; targetTest.current = params.get('pushTest') || undefined
    setBusy(false); working.current = false; void inspect()
    const resume = () => { if (!working.current && document.visibilityState === 'visible') void inspect() }
    const timer = window.setInterval(() => { if (Date.now() < pollUntil.current) resume() }, 2000)
    window.addEventListener('focus', resume); window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume)
    return () => {
      sequence.current++; for (const c of requests.current) c.abort(); requests.current.clear()
      clearInterval(timer); window.removeEventListener('focus', resume); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume)
    }
  }, [inspect])
  async function act(operation: (c: AbortController) => Promise<void>) {
    if (working.current || !current()) return
    working.current = true; setBusy(true); const c = controller()
    try { await operation(c); if (current() && !c.signal.aborted) await inspect() }
    catch (e: any) {
      if (current() && !c.signal.aborted) setState(previous => ({ ...previous, ...(e.message === 'denied' && previous.local ? { local: { ...previous.local, permission: Notification.permission } } : {}), error: e?.response?.data?.message || e.message || 'failed' }))
    } finally { requests.current.delete(c); if (current()) { working.current = false; setBusy(false) } }
  }
  function enable() {
    if (working.current || !current()) return
    // Permission prompt remains inside the employee's own click gesture.
    const permission = local?.permission === 'default' ? Notification.requestPermission() : Promise.resolve(local?.permission)
    void act(async c => {
      if (await permission !== 'granted') throw Error('denied')
      if (!current() || c.signal.aborted) return
      const config = await client.config(c.signal)
      if (!config.configured || !config.publicKey) throw Error('PUSH_NOT_CONFIGURED')
      const subscription = await connectPushDevice(config.publicKey, () => current() && !c.signal.aborted, saved?.subscription.state === 'inactive')
      if (!current() || c.signal.aborted) return
      await client.save(subscription.toJSON(), c.signal)
    })
  }
  const ready = !!local?.supported && local.secure && local.online && local.permission === 'granted' && saved?.configured && saved.subscription.state === 'ready' && local.applicationKey === view.config?.publicKey?.replace(/=+$/, '')
  const message = view.error === 'PUSH_TEST_COOLDOWN' ? w.cooldown : view.error === 'PUSH_NOT_CONFIGURED' ? w.noConfig : view.error === 'denied' ? w.deniedHelp
    : view.error === 'PUSH_DEVICE_RECONNECT' ? w.inactive : view.error === 'unknown' ? w.unknown : view.error ? w.failed : ''
  const problem = !local ? '' : !local.secure ? w.notSecure : !local.online ? w.offline : local.ios && !local.installed ? w.installIOS
    : !local.supported ? w.notSupported : local.permission === 'denied' ? w.deniedHelp : !saved ? w.failed : !saved.configured ? w.noConfig
      : local.subscriptionId && local.applicationKey !== view.config?.publicKey?.replace(/=+$/, '') ? w.inactive : saved.subscription.state === 'inactive' || saved.subscription.state === 'stale' ? w.inactive : saved.subscription.state !== 'ready' ? w.unregistered : ''
  return <section className="p-4 bg-white rounded-xl space-y-3 text-sm" aria-labelledby="push-device-title" data-testid="push-device-settings">
    <h2 className="font-bold text-base" id="push-device-title">{w.title}</h2>
    <p>{w.reportDevice}</p>
    {view.loading && <p role="status">{w.checking}</p>}
    {local && <dl className="grid grid-cols-1 gap-2" data-testid="push-device-checks">
      {[[w.secure, local.secure ? w.yes : w.no], [w.permission, local.permission === 'granted' ? w.granted : local.permission === 'denied' ? w.denied : w.defaultPermission],
        [w.browser, local.supported ? w.yes : w.no], [w.app, local.installed ? w.installed : w.notInstalled], [w.server, ready ? test ? w.connectedWithTest : w.connected : w.no]].map(([label, value]) => <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b pb-2" key={label}><dt>{label}</dt><dd className="font-medium">{value}</dd></div>)}
    </dl>}
    {problem && <p role="status" className="rounded-lg bg-amber-50 p-3">{problem}</p>}
    {message && <p role="alert" className="rounded-lg bg-red-50 p-3">{message}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || view.loading} className="rounded-lg border px-3 py-3 disabled:opacity-50" onClick={() => void inspect()}>{w.check}</button>
      {local && !ready && <button type="button" onClick={enable} disabled={busy || view.loading || !view.config?.configured || !local.secure || !local.online || !local.supported || local.permission === 'denied' || local.ios && !local.installed} className="rounded-lg bg-primary px-3 py-3 text-white disabled:opacity-50">{local.subscriptionId ? w.reconnect : w.enable}</button>}
      {ready && <button type="button" disabled={busy || view.loading} className="rounded-lg bg-primary px-3 py-3 text-white disabled:opacity-50" onClick={() => void act(async c => {
        const requestId = testRequest.current || crypto.randomUUID(); testRequest.current = requestId
        try { const result = await client.test(local!.subscriptionId!, requestId, c.signal); targetTest.current = result.id; testRequest.current = null; pollUntil.current = Date.now() + 60000 }
        catch (e: any) { if (e?.response?.status) throw e; throw Error('unknown') }
      })}>{w.test}</button>}
      {local?.subscriptionId && <button type="button" disabled={busy || view.loading} className="rounded-lg border px-3 py-3 disabled:opacity-50" onClick={() => void act(async c => {
        await client.remove(local.subscriptionId!, c.signal)
        if (!current() || c.signal.aborted) return
        await disconnectPushDevice(() => current() && !c.signal.aborted); if (current() && !c.signal.aborted) sessionStorage.removeItem('employee-push-id')
      })}>{w.disable}</button>}
    </div>
    {test && <div className="space-y-2 rounded-lg border p-3" data-testid="push-test-status" aria-live="polite">
      {[[w.saved, test.createdAt], [w.accepted, test.serviceAcceptedAt], [w.displayed, test.deviceReportedDisplayedAt], [w.opened, test.deviceReportedOpenedAt]].map(([label, value]) => <p key={label}>{label}: <strong>{value ? new Date(value).toLocaleString(i18n.language) : w.waiting}</strong></p>)}
      {!test.serviceAcceptedAt && <p>{test.status === 'cancelled' ? w.expiredTest : test.push === 'failed' ? w.failedDelivery : ['unavailable', 'not_confirmed'].includes(test.push) ? w.notConfirmed : w.queued}</p>}
    </div>}
    <p className="text-gray-600">{w.evidence}</p><p>{w.fallback}</p><Link className="inline-block underline py-2" to="/inbox">{w.inbox} →</Link>
    <details className="space-y-2"><summary className="cursor-pointer py-2">{w.help}</summary><h3 className="font-bold">{w.iphone}</h3><p>{w.installIOS}</p><p>{w.permissionIOS}</p><h3 className="font-bold">{w.android}</h3><p>{w.installAndroid}</p><p>{w.permissionAndroid}</p><p>{w.testHelp}</p><h3 className="font-bold">{w.notSeen}</h3><p>{w.recovery}</p></details>
  </section>
}
