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
  const current = useRef('')
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    let disposed = false
    void api.getAppVersion().then(version => {if (!disposed) {current.current = version; setCurrentVersion(version)}}).catch(() => {})
    const offStatus = api.onUpdateStatus((next: string, value?: any) => {
      if (next === 'checking') return
      const installed = value?.currentVersion || current.current
      if (next === 'available' || next === 'downloaded') {
        if (!isNewerUpdate(value?.version, installed)) return
        try {
          const dismissed = JSON.parse(localStorage.getItem(DISMISSED) || '{}')
          if (next === 'available' && dismissed.version === value.version && dismissed.until > Date.now() && !manual.current) return
        } catch {}
        setInfo(value); setStatus(next); setError(null); setVisible(true)
      } else if (next === 'up-to-date') {setStatus(next); setVisible(false); setInfo(null)}
      else setStatus(next)
      if (next === 'available' || next === 'downloaded' || next === 'up-to-date') manual.current = false
    })
    const offProgress = api.onUpdateProgress((value: any) => setProgress(value.percent || 0))
    const offError = api.onUpdateError((message: string) => {
      useOrderStore.getState().setIsInstallingUpdate(false)
      setStatus('error'); setError(message)
      if (manual.current) setVisible(true)
      manual.current = false
    })
    return () => {disposed = true; offStatus?.(); offProgress?.(); offError?.()}
  }, [])
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
        setStatus('installing')
        const {db}=await import('../db/offline')
        const snapshot=await db.transaction('r',db.tables,async()=>({format:'POSOffline-upgrade-v1',capturedAt:new Date().toISOString(),schemaVersion:db.verno,orders:await db.orders.toArray(),syncQueue:await db.syncQueue.toArray(),config:await db.config.toArray(),products:await db.products.toArray()}))
        if((await api.installUpdate(snapshot))!==true) {
          state.setIsInstallingUpdate(false);setStatus('error');setVisible(true);manual.current=false
          return
        }
      }
      if (action === 'check') {setStatus('checking'); await api.checkForUpdates()}
      if (action === 'download') {setStatus('downloading'); const result = await api.downloadUpdate(); if ((result as any) === false) throw Error(t('pos.updateError'))}
      if (action === 'show') {
        if (!(await api.showUpdateInstaller()).success) throw Error(t('updateFlow.fileMissing'))
        manual.current = false
      }
    } catch (err: any) {useOrderStore.getState().setIsInstallingUpdate(false);manual.current = false; setError(err.message); setStatus('error'); setVisible(true)}
  }
  const close = () => {
    if (info?.version && status === 'available') {
      try {localStorage.setItem(DISMISSED, JSON.stringify({version: info.version, until: Date.now() + 86400000}))} catch {}
    }
    setVisible(false)
  }
  if (!window.electronAPI || !visible) return null
  return <div className={`fixed top-4 right-4 z-50 max-w-sm ${className}`}><div className="bg-white rounded-xl shadow-2xl border p-4">
    <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-gray-900">{t(status === 'error' ? 'pos.updateError' : status === 'checking' ? 'pos.checkingUpdate' : status === 'downloaded' ? 'updateFlow.downloadedTitle' : 'pos.updateAvailable')}</h3><button onClick={close} aria-label={t('updateFlow.close')} className="text-gray-400 hover:text-gray-600"><X size={18}/></button></div>
    {currentVersion && <p className="text-xs text-gray-500 mb-2">{t('updateFlow.current', {version: currentVersion})}</p>}
    {status === 'available' && info && <div className="space-y-3"><p className="text-sm text-gray-600">{t('pos.newVersionReady', {version: info.version})}</p><button onClick={() => void run('download')} className="w-full py-2 bg-primary text-white rounded-lg flex items-center justify-center gap-2"><Download size={16}/>{t('pos.downloadUpdate')}</button></div>}
    {status === 'checking' && <p className="flex items-center gap-2"><RefreshCw size={18} className="animate-spin"/>{t('pos.checkingUpdate')}</p>}
    {status === 'downloading' && <div className="space-y-3"><p>{t('pos.downloading')} {progress.toFixed(0)}%</p><div className="bg-gray-200 rounded h-2"><div className="bg-primary h-2 rounded" style={{width: `${Math.min(100, Math.max(0, progress))}%`}}/></div></div>}
    {status === 'preparing' && <p role="status" className="flex items-center gap-2"><RefreshCw size={18} className="animate-spin"/>{t('updateFlow.preparing')}</p>}
    {status === 'downloaded' && <div className="space-y-3"><p className="flex items-center gap-2 text-green-700"><Check size={18}/>{t('pos.updateReady')}</p><p className="text-sm">{t('updateFlow.onlineInstall')}</p><button onClick={() => void run('install')} className="w-full py-2 bg-primary text-white rounded-lg flex items-center justify-center gap-2"><RefreshCw size={16}/>{t('updateFlow.installRestart')}</button><button onClick={() => void run('show')} className="text-xs text-gray-500 flex items-center gap-1"><FolderOpen size={14}/>{t('updateFlow.openFolder')}</button></div>}
    {status === 'installing' && <p role="status" className="flex items-center gap-2"><RefreshCw size={18} className="animate-spin"/>{t('updateFlow.installing')}</p>}
    {status === 'error' && <div className="space-y-3"><p className="flex items-center gap-2 text-red-600"><AlertCircle size={18}/>{t('updateFlow.failed')}</p>{error === t('updateFlow.busy') && <p className="text-sm text-red-600">{error}</p>}{error && error !== t('updateFlow.busy') && <details className="text-xs text-gray-500"><summary>{t('updateFlow.details')}</summary><p className="break-words">{error}</p></details>}<button onClick={() => void run('check')} className="w-full py-2 border rounded-lg">{t('pos.retry')}</button></div>}
  </div></div>
}
