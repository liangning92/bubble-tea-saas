import { Children, cloneElement, isValidElement, ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

export function AdminDialog({ title, children, onClose, className = 'max-w-4xl', busy = false, trackChanges = false, chrome = false }: {
  title: string; children: ReactNode; onClose: () => void; className?: string; busy?: boolean; trackChanges?: boolean; chrome?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose), pending = useRef(busy), dirty = useRef(false)
  const [discard, setDiscard] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const working = busy || actionBusy
  close.current = onClose; pending.current = busy || actionBusy
  const requestClose = useRef<() => void>(() => {})
  requestClose.current = () => {
    if (pending.current) return
    if (trackChanges && dirty.current) setDiscard(true)
    else close.current()
  }
  const copy = { title: t('uiDesign.discardTitle'), message: t('uiDesign.discardMessage'), keep: t('uiDesign.keepEditing'), discard: t('uiDesign.discardChanges') }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex="0"]') || [])].filter(el => el.getClientRects().length > 0)
    ;(focusable()[0] || ref.current)?.focus()
    const key = (e: KeyboardEvent) => {
      if (!ref.current?.contains(document.activeElement)) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); requestClose.current(); return }
      if (e.key === 'Tab') {
        const els = focusable(), first = els[0], last = els[els.length - 1]
        if (!first) { e.preventDefault(); ref.current?.focus() }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => { if (discard) ref.current?.querySelector<HTMLElement>('[data-keep-editing]')?.focus() }, [discard])
  // Observe promises returned by existing form/actions, including older dialogs
  // that do not yet expose a mutation's pending state.
  const protectActions = (nodes: ReactNode): ReactNode => Children.map(nodes, node => {
    if (!isValidElement<{ children?: ReactNode; onClick?: (...args: any[]) => unknown; onSubmit?: (...args: any[]) => unknown; disabled?: boolean }>(node)) return node
    const props: Record<string, any> = {}
    if (node.props.children !== undefined) props.children = protectActions(node.props.children)
    if (typeof node.type === 'string') {
      if (['button', 'input', 'select', 'textarea'].includes(node.type)) props.disabled = working || node.props.disabled
      for (const event of ['onClick', 'onSubmit'] as const) {
        const handler = node.props[event]
        if (!handler) continue
        props[event] = (...args: any[]) => {
          if (pending.current) { args[0]?.preventDefault?.(); return }
          const result = handler(...args)
          if (result && typeof (result as Promise<unknown>).then === 'function') {
            pending.current = true; setActionBusy(true)
            const finish = () => { pending.current = busy; setActionBusy(false) }
            Promise.resolve(result).then(finish, finish)
          }
          return result
        }
      }
    }
    return cloneElement(node, props)
  })
  return createPortal(<div className="admin-dialog-overlay fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-3 sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget) requestClose.current() }}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={discard ? copy.title : title} aria-busy={working} className={`admin-workspace admin-dialog w-full max-h-[92dvh] overflow-y-auto overscroll-contain rounded-xl bg-white shadow-xl ${className}`}
      onChangeCapture={e => { const field = e.target as HTMLInputElement; if (field.type !== 'search' && !field.closest('[data-dialog-search]')) dirty.current = true }}
      onClickCapture={e => {
        if (pending.current) { e.preventDefault(); e.stopPropagation(); return }
        const button = (e.target as HTMLElement).closest('button')
        if (trackChanges && button && button.getAttribute('data-dialog-close') !== 'true' && (/添加|删除|计算|新增|移除|\b(?:add|remove|calculate|delete|tambah|hapus|hitung)\b/i.test(button.textContent || '') || button.querySelector('.lucide-trash-2'))) dirty.current = true
        if (trackChanges && button?.getAttribute('data-dialog-close') === 'true') { e.preventDefault(); e.stopPropagation(); requestClose.current() }
      }}>
      {chrome && <header className="admin-dialog-header"><h2>{title}</h2><button type="button" aria-label={t('common.close', 'Close')} disabled={working} onClick={() => requestClose.current()}><X size={20}/></button></header>}
      <div className={chrome ? 'admin-dialog-body' : undefined} hidden={discard}>{protectActions(children)}</div>
      {discard && <section className="p-5 space-y-4"><h2>{copy.title}</h2><p>{copy.message}</p><div className="flex flex-wrap justify-end gap-2"><button type="button" data-keep-editing className="btn-secondary" onClick={() => { setDiscard(false); ref.current?.focus() }}>{copy.keep}</button><button type="button" className="btn-danger" onClick={() => close.current()}>{copy.discard}</button></div></section>}
    </div>
  </div>, document.body)
}
