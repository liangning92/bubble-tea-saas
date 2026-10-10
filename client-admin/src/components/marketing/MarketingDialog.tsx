import { ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMarketingCopy } from './MarketingLayout'

export function MarketingDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose), l = useMarketingCopy()
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || [])].filter(element => element.getClientRects().length > 0)
    ;(focusable()[0] || ref.current)?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return }
      if (event.key !== 'Tab') return
      const elements = focusable(), first = elements[0], last = elements[elements.length-1]
      if (!first) { event.preventDefault(); ref.current?.focus(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus() }
  }, [])
  return createPortal(<div ref={ref} role="dialog" aria-modal="true" aria-label={l('营销管理表单','Marketing form','Form pemasaran')} tabIndex={-1} className="marketing-workspace fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={event => { if (event.target === event.currentTarget) onClose() }}>{children}</div>, document.body)
}
