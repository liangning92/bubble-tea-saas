import { useEffect, useRef } from 'react'
import { useAwareness } from './NotificationAwareness'
import { useLocation } from 'react-router-dom'

// Business pages supply data-notice-object only for objects they actually load.
// This locates that rendered object without changing its permissions or workflow.
export function NotificationAwarenessTarget() {
  const location = useLocation(), { data, markRead, isCurrent } = useAwareness()
  const acknowledging = useRef(new Set<string>())
  useEffect(() => { acknowledging.current.clear() }, [isCurrent])
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    let active = true
    // Only real, loaded objects on this exact business route can acknowledge a
    // notice. Chat and training keep their source-specific read protocols.
    const items = data.items.filter(item => !item.read && item.objectId && item.kind !== 'chat' && item.kind !== 'training_update' &&
      [item.url, item.adminUrl].some(url => { try { return !!url && /^\/(?!\/)/.test(url) && !/[\\\u0000-\u001f]/.test(url) && new URL(url, 'https://app.invalid').pathname === location.pathname } catch { return false } }))
    const visible = new IntersectionObserver(entries => {
      if (document.visibilityState !== 'visible') return
      for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= .1) {
        const source = (entry.target as HTMLElement).dataset
        for (const item of items.filter(item => item.objectId === source.noticeObject &&
          (!item.kind.startsWith('approval_') || !!item.status && source.noticeStatus === item.status) &&
          (!source.noticeEvent || source.noticeEvent === item.event) &&
          (!source.noticeVersion || source.noticeVersion === item.createdAt))) {
          if (!active || !isCurrent() || acknowledging.current.has(item.id)) continue
          acknowledging.current.add(item.id)
          void markRead(item.id).catch(() => { if (isCurrent()) acknowledging.current.delete(item.id) })
        }
      }
    }, { threshold: .1 })
    const observed = new Set<Element>()
    const observe = () => {
      for (const old of observed) if (!old.isConnected) { visible.unobserve(old); observed.delete(old) }
      for (const element of document.querySelectorAll<HTMLElement>('[data-notice-object]')) if (items.some(item => item.objectId === element.dataset.noticeObject) && !observed.has(element)) { observed.add(element); visible.observe(element) }
    }
    observe()
    const mutations = new MutationObserver(changes => {
      if (changes.some(change => change.type === 'attributes')) { for (const old of observed) visible.unobserve(old); observed.clear() }
      observe()
    })
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-notice-object','data-notice-status','data-notice-event','data-notice-version'] })
    return () => { active = false; visible.disconnect(); mutations.disconnect() }
  }, [location.pathname, data.items, markRead, isCurrent])
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('noticeObject')
    if (!id) return
    let target: HTMLElement | undefined
    const locate = () => {
      if (target?.isConnected) return
      target?.classList.remove('awareness-target')
      target = Array.from(document.querySelectorAll<HTMLElement>('[data-notice-object]')).find(el => el.dataset.noticeObject === id)
      if (target) { target.classList.add('awareness-target'); target.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
    }
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect(); target?.classList.remove('awareness-target') }
  }, [location.pathname, location.search])
  return null
}
