import { readTeamWorkTarget } from '../../../shared/teamWorkTarget'
import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { TeamCommunication, type TeamClient } from '../../../shared/TeamCommunication'
import './staffTeamConversation.css'

export function StaffTeamConversation(props: { client: TeamClient; scope: string; staffId: string; language: string }) {
  const [params, setParams] = useSearchParams(), navigate = useNavigate(), location = useLocation()
  const channelId = params.get('channel') || '', target = readTeamWorkTarget(params)
  const clientVersion = useRef({ client: props.client, version: 0 })
  if (clientVersion.current.client !== props.client) clientVersion.current = { client: props.client, version: clientVersion.current.version + 1 }
  const frame = useRef<HTMLDivElement>(null), listScroll = useRef(0)
  useLayoutEffect(() => {
    const el = frame.current, viewport = window.visualViewport
    if (!el || !channelId) { window.scrollTo(0, listScroll.current); return }
    const resize = () => {
      if (!viewport || viewport.scale !== 1) return
      el.style.setProperty('--team-viewport-height', viewport.height + 'px')
      el.style.setProperty('--team-viewport-top', viewport.offsetTop + 'px')
      el.dataset.keyboard = String(document.activeElement?.tagName === 'TEXTAREA' && window.innerHeight - viewport.height > 120)
    }
    resize()
    viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize)
    window.addEventListener('resize', resize); el.addEventListener('focusin', resize); el.addEventListener('focusout', resize)
    return () => {
      viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize)
      window.removeEventListener('resize', resize); el.removeEventListener('focusin', resize); el.removeEventListener('focusout', resize)
    }
  }, [channelId])
  function select(id: string) {
    if (!id && location.state?.teamConversation) { navigate(-1); return }
    const next = new URLSearchParams(params)
    if (id !== channelId) for (const key of ['message', 'task', 'action', 'work']) next.delete(key)
    if (id) { if (!channelId) listScroll.current = window.scrollY; next.set('channel', id) } else next.delete('channel')
    setParams(next, { replace: !id || !!channelId, state: id ? { teamConversation: !channelId || !!location.state?.teamConversation } : null })
  }
  return <div ref={frame} className="employee-team-frame" data-conversation={!!channelId}>
    <TeamCommunication key={`${props.scope}:${props.staffId}:${clientVersion.current.version}`} {...props} compact navigation={{ channelId, select, target, work: params.get('work') === '1' }} />
  </div>
}
