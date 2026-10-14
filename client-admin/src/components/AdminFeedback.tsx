import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { AdminDialog } from './AdminDialog'

type Confirmation = { id: number; message: string; resolve: (value: boolean) => void }
let confirmations: Confirmation[] = [], notices: { id: number; message: string }[] = [], nextId = 0
const listeners = new Set<() => void>()
const changed = () => listeners.forEach(listener => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function confirmAdmin(message: unknown): Promise<boolean> {
  return new Promise(resolve => { confirmations = [...confirmations, { id: ++nextId, message: String(message), resolve }]; changed() })
}
export function notifyAdmin(message: unknown): void {
  notices = [{ id: ++nextId, message: String(message) }]; changed()
}
function settle(id: number, value: boolean) {
  const request = confirmations.find(item => item.id === id)
  confirmations = confirmations.filter(item => item.id !== id); request?.resolve(value); changed()
}
export function AdminFeedback() {
  const {t}=useTranslation()
  const queue=useSyncExternalStore(subscribe,()=>confirmations), messages=useSyncExternalStore(subscribe,()=>notices)
  const request=queue[0], message=messages[0]
  return <>
    {request&&<AdminDialog title={t('common.confirm')} onClose={()=>settle(request.id,false)} className="max-w-md" chrome>
      <p className="whitespace-pre-wrap break-words">{request.message}</p>
      <div className="admin-dialog-footer"><button type="button" className="btn-secondary" onClick={()=>settle(request.id,false)} data-dialog-close="true">{t('common.cancel')}</button><button type="button" className="btn-primary" onClick={()=>settle(request.id,true)}>{t('common.confirm')}</button></div>
    </AdminDialog>}
    {message&&<aside role="status" className="admin-workspace fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-lg z-[100] rounded-xl border border-border bg-white p-4 shadow-lg flex items-start gap-3">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{message.message}</p><button type="button" className="btn-secondary shrink-0" onClick={()=>{notices=notices.filter(item=>item.id!==message.id);changed()}}>{t('common.close')}</button>
    </aside>}
  </>
}
