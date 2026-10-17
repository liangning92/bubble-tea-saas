import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { costQueryKeys, COST_SYNC_EVENT, COST_SYNC_INTERVAL } from '../utils/costSync'

/** Refresh read models across tabs and devices without navigating or resetting forms. */
export function CostSync() {
  const queryClient = useQueryClient()
  const token = useAuthStore(state => state.token)
  const storeId = useAuthStore(state => state.user?.storeId)
  useEffect(() => {
    if (!token) return
    const refresh = () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return
      void queryClient.invalidateQueries({
        predicate: query => costQueryKeys.has(String(query.queryKey[0])),
        refetchType: 'active'
      }, { cancelRefetch: false })
    }
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(COST_SYNC_EVENT)
    const onLocalChange = () => {
      refresh()
      channel?.postMessage({ storeId })
    }
    if (channel) channel.onmessage = event => {
      if (event.data?.storeId === storeId) refresh()
    }
    // Covers other devices, interrupted requests and returning from an offline period.
    const timer = window.setInterval(refresh, COST_SYNC_INTERVAL)
    window.addEventListener(COST_SYNC_EVENT, onLocalChange)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      channel?.close()
      window.removeEventListener(COST_SYNC_EVENT, onLocalChange)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [queryClient, token, storeId])
  return null
}
