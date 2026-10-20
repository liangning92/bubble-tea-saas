import {useState, useEffect, useRef} from 'react'
import {useTranslation} from 'react-i18next'
import {Download, RefreshCw, Check, AlertCircle, X, FolderOpen} from 'lucide-react'
import {isNewerUpdate} from '../utils/updateVersion'
import {useOrderStore} from '../stores/orderStore'

const DISMISSED = 'pos.update.dismissed'
export function UpdateNotification({className = ''}: {className?: string}) {
  const {t} = useTranslation()
  const [status, setStatus] = useState('idle')
  const [info, setInfo] = useState<any>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string|null>(null)
  const [visible, setVisible] = useState(false)
  const [currentVersion, setCurrentVersion] = useState('')
  const manual = useRef(false)
  const installAfterDownload = useRef(false)
  const current = useRef('')
  const activeStatus = useRef('idle')
  const restoreState = useRef<(() => Promise<void>) | null>(null)
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    const manualCheck = () => { manual.current = true; setError(null); setStatus('checking'); setVisible(true) }
    window.addEventListener('pos-update-check-requested', manualCheck)
    let disposed = false
    void api.getAppVersion().then(version => {if (!disposed) {current.current = version; setCurrentVersion(version)}}).catch(() => {})
    const applyStatus = (next: string, value?: any) => {
      if (next === 'checking') {if (manual.current) {setStatus(next); setVisible(true)}; return}
      const installed = value?.currentVersion || current.current
      if (next === 'available' || next === 'downloaded') {
        if (!isNewerUpdate(value?.version, installed)) return
        try {
          const dismissed = JSON.parse(localStorage.getItem(DISMISSED) || '{}')
          if (next === 'available' && dismissed.version === value.version && dismissed.until > Date.now() && !manual.current) return
        } catch {}
        if (value?.installRequested) installAfterDownload.current = true
        activeStatus.current = next; setInfo(value); setStatus(next); setError(null); setVisible(true)
      } else if (next === 'up-to-date') {activeStatus.current = next; setStatus(next); setVisible(false); setInfo(null)}
      else {activeStatus.current = next; setStatus(next); if (next === 'downloading' || next === 'preparing' || next === 'installing') setVisible(true)}
      if (next === 'available' || next === 'downloaded' || next === 'up-to-date') manual.current = false
    }
    const offStatus = api.onUpdateStatus(applyStatus)
    const offProgress = api.onUpdateProgress((value: any) => setProgress(value.percent || 0))
    const offError = api.onUpdateError((message: string) => {
      installAfterDownload.current = false
      useOrderStore.getState().setIsInstallingUpdate(false)
      setStatus('error'); setError(message)
      activeStatus.current = 'error'; setVisible(true)
      manual.current = false
    })
    const readState = async () => {
      if (!api.getUpdateState) return
      try {
        const state = await api.getUpdateState()
        if (disposed || !state || state.status === 'idle') return
        setProgress(state.progress || 0)
        if (state.status === 'error') {
          activeStatus.current = 'error'; setStatus('error'); setError(state.error || t('pos.updateError')); setVisible(true)
          useOrderStore.getState().setIsInstallingUpdate(false)
        } else applyStatus(state.status, {...state.info, currentVersion:state.currentVersion})
      } catch { /* Older clients retain their event-based interface. */ }
    }
    restoreState.current = readState
    void readState()
    const poll = setInterval(() => {
      if (['downloading','preparing'].includes(activeStatus.current)) void readState()
    }, 2000)
    const restoreWhenVisible = () => {if (document.visibilityState === 'visible') void readState()}
    document.addEventListener('visibilitychange', restoreWhenVisible)
    return () => {clearInterval(poll); restoreState.current = null; document.removeEventListener('visibilitychange', restoreWhenVisible); window.removeEventListener('pos-update-check-requested', manualCheck); disposed = true; offStatus?.(); offProgress?.(); offError?.()}
  }, [])
  useEffect(() => {
    if (status !== 'downloaded') return
    // An explicit Download and install request proceeds as soon as the verified
    // backup is ready. Background downloads still wait for an idle cashier.
    let lastActivity = Date.now()
    const touch = () => {lastActivity = Date.now()}
    window.addEventListener('pointerdown', touch)
    window.addEventListener('keydown', touch)
    const attempt = () => {
      const state = useOrderStore.getState()
      if ((!installAfterDownload.current && Date.now() - lastActivity < 60000) ||
          state.isCheckingOut || state.isInstallingUpdate ||
          !window.dispatchEvent(new Event('pos-before-update', {cancelable:true}))) return
      void run('install')
    }
    const timer = setInterval(attempt, 1000)
    attempt()
    return () => {clearInterval(timer);window.removeEventListener('pointerdown', touch);window.removeEventListener('keydown', touch)}
  }, [status])
  const run = async (action: 'check'|'download'|'show'|'install') => {
    const api = window.electronAPI
    if (!api) return
    manual.current = true; setError(null)
    try {
      if(action==='install') {
        const state=useOrderStore.getState()
        if(state.isInstallingUpdate)return
        if(state.isCheckingOut || !window.dispatchEvent(new Event('pos-before-update',{cancelable:true})))throw Error(t('updateFlow.busy'))
        state.setIsInstallingUpdate(true)
        activeStatus.current = 'installing'
        setStatus('installing')
        const {db}=await import('../db/offline')
        const snapshot=await db.transaction('r',db.tables,async()=>({format:'POSOffline-upgrade-v1',capturedAt:new Date().toISOString(),schemaVersion:db.verno,orders:await db.orders.toArray(),syncQueue:await db.syncQueue.toArray(),config:await db.config.toArray(),products:await db.products.toArray()}))
        if((await api.installUpdate(snapshot))!==true) {
          installAfterDownload.current = false
          state.setIsInstallingUpdate(false);activeStatus.current = 'error';setError(value => value || t('pos.updateError'));setStatus('error');setVisible(true);manual.current=false
          return
        }
      }
      if (action === 'check') {setStatus('checking'); await api.checkForUpdates()}
      if (action === 'download') {
        installAfterDownload.current = true
        activeStatus.current = 'downloading'
        setStatus('downloading'); setProgress(0); setVisible(true)
        const result = await api.downloadUpdate()
        if (result === false) throw Error(t('pos.updateError'))
        await restoreState.current?.()
      }
      if (action === 'show') {
        if (!(await api.showUpdateInstaller()).success) throw Error(t('updateFlow.fileMissing'))
        manual.current = false
      }
    } catch (err: any) {installAfterDownload.current = false;useOrderStore.getState().setIsInstallingUpdate(false);manual.current = false; setError(err.message); setStatus('error'); setVisible(true)}
  }
  const close = () => {
    if (installAfterDownload.current || status === 'installing') return
    if (info?.version && status === 'available') {
      try {localStorage.setItem(DISMISSED, JSON.stringify({version: info.version, until: Date.now() + 86400000}))} catch {}
    }
    setVisible(false)
  }
  if (!window.electronAPI || !visible) return null
  return <div className={`fixed top-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm ${className}`}><div className="bg-white rounded-xl shadow-2xl border p-4">
    <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-gray-900">{t(status === 'error' ? 'pos.updateError' : status === 'checking' ? 'pos.checkingUpdate' : status === 'downloaded' ? 'updateFlow.downloadedTitle' : 'pos.updateAvailable')}</h3>{!installAfterDownload.current && status !== 'installing' && <button onClick={close} aria-label={t('updateFlow.close')} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>}</div>
    {currentVersion && <p className="text-xs text-gray-500 mb-2">{t('updateFlow.current', {version: currentVersion})}</p>}
    {status === 'available' && info && <div className="space-y-3"><p className="text-sm text-gray-600">{t('pos.newVersionReady', {version: info.version})}</p><button onClick={() => void run('download')} className="w-full py-2 bg-primary text-white rounded-lg flex items-center justify-center gap-2"><Download size={16}/>{t('pos.downloadUpdate')}</button></div>}
    {status === 'checking' && <p className="flex items-center gap-2"><RefreshCw size={18} className="animate-spin"/>{t('pos.checkingUpdate')}</p>}
    {status === 'downloading' && <div className="space-y-3"><p>{t('pos.downloading')} {progress.toFixed(0)}%</p><div className="bg-gray-200 rounded h-2"><div className="bg-primary h-2 rounded" style={{width: `${Math.min(100, Math.max(0, progress))}%`}}/></div></div>}
    {status === 'preparing' && <p role="status" className="flex items-center gap-2"><RefreshCw size={18} className="animate-spin"/>{t('updateFlow.preparing')}</p>}
    {status === 'downloaded' && <div className="space-y-3"><p className="flex items-center gap-2 text-green-700"><Check size={18}/>{t('pos.updateReady')}</p><p className="text-sm">{t(installAfterDownload.current ? 'updateFlow.autoInstallWaiting' : 'updateFlow.idleInstallWaiting')}</p><button onClick={() => void run('install')} className="w-full py-2 bg-primary text-white rounded-lg flex items-center justify-center gap-2"><RefreshCw size={16}/>{t('updateFlow.installRestart')}</button><button onClick={() => void run('show')} className="text-xs text-gray-500 flex items-center gap-1"><FolderOpen size={14}/>{t('updateFlow.openFolder')}</button></div>}
    {status === 'installing' && <p role="status" className="flex items-center gap-2"><RefreshCw size={18} className="animate-spin"/>{t('updateFlow.installing')}</p>}
    {status === 'error' && <div className="space-y-3"><p className="flex items-center gap-2 text-red-600"><AlertCircle size={18}/>{t('updateFlow.failed')}</p>{error === t('updateFlow.busy') && <p className="text-sm text-red-600">{error}</p>}{error && error !== t('updateFlow.busy') && <details className="text-xs text-gray-500"><summary>{t('updateFlow.details')}</summary><p className="break-words">{error}</p></details>}<button onClick={() => void run('check')} className="w-full py-2 border rounded-lg">{t('pos.retry')}</button></div>}
  </div></div>
}
