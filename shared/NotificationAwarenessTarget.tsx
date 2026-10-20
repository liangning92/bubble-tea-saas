import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Business pages supply data-notice-object only for objects they actually load.
// This locates that rendered object without changing its permissions or workflow.
export function NotificationAwarenessTarget() {
  const location = useLocation()
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
