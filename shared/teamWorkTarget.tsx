import { useLayoutEffect, useRef, type CSSProperties } from 'react'

export type TeamWorkTarget = { kind: 'message' | 'task' | 'action'; id: string; invalid: boolean }
export function readTeamWorkTarget(params: URLSearchParams): TeamWorkTarget | undefined {
  const keys = (['message', 'task', 'action'] as const).filter(key => params.has(key))
  if (!keys.length) return undefined
  const kind = keys[0], id = params.get(kind) || ''
  const valid = kind === 'message' ? /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  return { kind, id, invalid: keys.length !== 1 || params.getAll(kind).length !== 1 || !valid }
}
export const teamWorkTargetStyle: CSSProperties = { outline: '3px solid #d97706', outlineOffset: 3, scrollMarginBlock: 24 }

// Locate only a rendered object inside this authorized resource's own container.
// No fetch, read receipt, task transition, or message send belongs to a deep link.
export function TeamWorkTargetStatus({ id, kind, scope, ready, found, failed = false, active = true, language }: {
  id?: string; kind: TeamWorkTarget['kind']; scope: string; ready: boolean; found: boolean; failed?: boolean; active?: boolean; language: string
}) {
  const marker = useRef<HTMLSpanElement>(null)
  const state = failed || ready && !found ? 'unavailable' : ready && found ? 'found' : 'loading'
  useLayoutEffect(() => {
    if (!id || !active || !ready || !found || failed) return
    const container = marker.current?.closest('[data-team-target-scope]')
    const target = Array.from(container?.querySelectorAll<HTMLElement>('[data-team-target-kind]') || [])
      .find(element => element.dataset.teamTargetKind === kind && element.dataset.teamTargetId === id)
    if (target?.getClientRects().length) target.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [id, kind, scope, ready, found, failed, active])
  if (id === undefined) return null
  const labels = language.startsWith('zh') ? { loading: '正在定位通知目标…', unavailable: '此目标在当前会话中不可用，可能已移除或无权查看。', found: '已定位通知目标' }
    : language.startsWith('en') ? { loading: 'Locating the linked item…', unavailable: 'This item is unavailable in the current conversation. It may have been removed or you may not have access.', found: 'Linked item located' }
      : { loading: 'Mencari tujuan notifikasi…', unavailable: 'Item ini tidak tersedia di percakapan ini. Item mungkin dihapus atau Anda tidak memiliki akses.', found: 'Tujuan notifikasi ditemukan' }
  return <span ref={marker} role="status" data-team-target-status={state} className={state === 'found' ? 'sr-only' : 'block rounded-lg border bg-amber-50 p-3 text-sm text-amber-900'}>{labels[state]}</span>
}
