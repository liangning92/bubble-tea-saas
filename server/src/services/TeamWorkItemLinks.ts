// Relative application links only. No deployment host or platform assumptions.
export function teamWorkItemLink(channelId: string, target: { messageSeq?: number; employeeTaskId?: string; managementActionId?: string } = {}) {
  const q = new URLSearchParams({ channel: channelId })
  if (target.employeeTaskId) { q.set('work', '1'); q.set('task', target.employeeTaskId) }
  else if (target.managementActionId) { q.set('work', '1'); q.set('action', target.managementActionId) }
  else if (target.messageSeq) q.set('message', String(target.messageSeq))
  return '/team?' + q.toString()
}
