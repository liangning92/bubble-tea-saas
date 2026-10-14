import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const openModals: HTMLElement[] = []
let originalOverflow = ''
let originalRootInert = false

/** A modal owns focus and scrolling, and always sits above the bottom navigation. */
export function Modal({ children, label, onClose, className = '' }: {
  children: ReactNode; label: string; onClose?: () => void; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const modal = ref.current!
    const previous = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    if (!openModals.length) {
      originalOverflow = document.body.style.overflow
      originalRootInert = root?.inert ?? false
    }
    const underlying = openModals[openModals.length - 1]
    if (underlying) underlying.inert = true
    openModals.push(modal)
    modal.style.zIndex = String(100 + openModals.length * 10)
    document.body.style.overflow = 'hidden'
    if (root) root.inert = true
    const focusable = () => [...modal.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length > 0)
    modal.focus()
    const keydown = (event: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== modal) return
      if (event.key === 'Escape') { event.preventDefault(); close.current?.() }
      if (event.key === 'Tab') {
        const elements = focusable(), first = elements[0], last = elements[elements.length - 1]
        if (!first) { event.preventDefault(); modal.focus(); return }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      openModals.splice(openModals.indexOf(modal), 1)
      const top = openModals[openModals.length - 1]
      if (top) top.inert = false
      else { document.body.style.overflow = originalOverflow; if (root) root.inert = originalRootInert }
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return createPortal(<div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`employee-modal ${className}`}>{children}</div>, document.body)
}
