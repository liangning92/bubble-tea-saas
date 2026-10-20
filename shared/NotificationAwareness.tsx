import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export interface AwarenessItem {
  id: string
  event: string
  kind: 'chat' | 'training_update' | 'approval_request' | 'approval_result' | 'business_reminder'
  title: string
  url: string
  adminUrl?: string
  read: boolean
  pending?: boolean
  createdAt: string
  trainingUpdate?: unknown
  domain?: string
  objectId?: string
  status?: string
}
export interface AwarenessInbox {
  items: AwarenessItem[]
  counts: { unread: number; chatUnread: number; trainingUnread: number; approvalPending: number }
  chats: { id: string; title: string; unread: number; preview: { text: string; authorName: string; createdAt: string } | null; url: string }[]
  hasMore?: boolean
}
export interface AwarenessClient {
  inbox: (signal: AbortSignal) => Promise<AwarenessInbox>
  read: (id: string, signal: AbortSignal) => Promise<unknown>
}
const empty: AwarenessInbox = { items: [], chats: [], counts: { unread: 0, chatUnread: 0, trainingUnread: 0, approvalPending: 0 } }
const Context = createContext({ data: empty, loading: false, failed: false, refresh: async () => {}, markRead: async (_id: string) => {}, isCurrent: (): boolean => true })

// Identity is supplied by the authenticated app, including its current store/session.
// A prior identity's response is never exposed during a switch, even before effects run.
export function AwarenessProvider({ client, identity, children }: { client: AwarenessClient; identity: string; children: ReactNode }) {
  const [state, setState] = useState({ identity, data: empty, loading: !!identity, failed: false })
  const current = useRef(identity), poll = useRef<(() => Promise<void>) | null>(null)
  const reads = useRef(new Set<AbortController>())
  current.current = identity
  useEffect(() => {
    let active = true, inFlight = false
    let controller: AbortController | undefined
    for (const request of reads.current) request.abort()
    reads.current.clear()
    setState({ identity, data: empty, loading: !!identity, failed: false })
    const refresh = async () => {
      if (!identity || !active || current.current !== identity || inFlight || document.visibilityState !== 'visible') return
      inFlight = true
      controller = new AbortController()
      try {
        const data = await client.inbox(controller.signal)
        if (active && current.current === identity) setState({ identity, data, loading: false, failed: false })
      } catch (error: any) {
        if (active && current.current === identity && !controller.signal.aborted) setState(previous => ({ ...previous, data: [401, 403].includes(error?.response?.status) ? empty : previous.data, loading: false, failed: true }))
      } finally { inFlight = false }
    }
    poll.current = refresh
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    const resume = () => void refresh()
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('notification-awareness-changed', resume)
    window.addEventListener('employee-inbox-updated', resume)
    return () => {
      active = false; controller?.abort(); clearInterval(timer); poll.current = null
      for (const request of reads.current) request.abort()
      reads.current.clear()
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('notification-awareness-changed', resume)
      window.removeEventListener('employee-inbox-updated', resume)
    }
  }, [client, identity])
  const refresh = useCallback(async () => { await poll.current?.() }, [])
  const isCurrent = useCallback(() => current.current === identity, [identity])
  const markRead = useCallback(async (id: string) => {
    if (!identity) return
    const controller = new AbortController(); reads.current.add(controller)
    try {
      await client.read(id, controller.signal)
      if (current.current !== identity || controller.signal.aborted) return
      // Pending is a business projection and cannot be cleared by reading.
      await poll.current?.()
    } finally { reads.current.delete(controller) }
  }, [client, identity])
  const visible = state.identity === identity ? state : { data: empty, loading: !!identity, failed: false }
  return <Context.Provider value={{ ...visible, refresh, markRead, isCurrent }}>{children}</Context.Provider>
}
export const useAwareness = () => useContext(Context)
