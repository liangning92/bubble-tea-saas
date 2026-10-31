export interface TeamPending {
  id: string; scope: string; channelId: string; text: string; files: File[]; uploaded: string[]
  language?: 'zh' | 'en' | 'id'
  expectedLastSeq?: number
  createdAt: string; error?: string; retryable?: boolean; attempts?: number; nextRetryAt?: number
}
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('youme-team-outbox-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function operation<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', mode), request = action(tx.objectStore('pending'))
    tx.oncomplete = () => { db.close(); resolve(request.result) }
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('OUTBOX_STORAGE_FAILED')) }
  })
}
export const pendingMessages = async (scope: string) => (await operation<TeamPending[]>('readonly', store => store.getAll())).filter(m => m.scope === scope).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
export const savePending = (value: TeamPending) => operation('readwrite', store => store.put(value))
export const removePending = (id: string) => operation('readwrite', store => store.delete(id))
