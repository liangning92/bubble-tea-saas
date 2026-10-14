import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'

type Request = { message: string; confirm: boolean; resolve: (value: boolean) => void }
type Dialogs = { alert: (message: string) => Promise<void>; confirm: (message: string) => Promise<boolean> }
const Context = createContext<Dialogs | null>(null)
export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [requests, setRequests] = useState<Request[]>([])
  const ask = useCallback((message: string, confirm: boolean) => new Promise<boolean>(resolve => setRequests(queue => [...queue, { message, confirm, resolve }])), [])
  const api = useMemo(() => ({ alert: async (message: string) => { await ask(message, false) }, confirm: (message: string) => ask(message, true) }), [ask])
  const request = requests[0]
  const finish = (value: boolean) => { request.resolve(value); setRequests(queue => queue.slice(1)) }
  return <Context.Provider value={api}>{children}{request && <Modal label={t('common.confirm')} onClose={() => finish(false)} className="flex items-center justify-center bg-black/50 p-4"><section className="employee-dialog-panel bg-white rounded-xl p-5 w-full max-w-md space-y-5"><p className="whitespace-pre-wrap break-words">{request.message}</p><div className="flex justify-end gap-3">{request.confirm && <button className="btn-secondary" onClick={() => finish(false)}>{t('common.cancel')}</button>}<button className="btn-primary" onClick={() => finish(true)}>{t('common.confirm')}</button></div></section></Modal>}</Context.Provider>
}
export function useDialogs() {
  const dialogs = useContext(Context)
  if (!dialogs) throw new Error('DialogProvider is required')
  return dialogs
}
