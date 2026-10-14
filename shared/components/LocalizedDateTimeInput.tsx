import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import './LocalizedDateTimeInput.css'

type Kind = 'date' | 'time' | 'month' | 'datetime-local'
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { type: Kind }
const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const words = {
  en: { date: 'Select date', time: 'Select time', month: 'Select month', today: 'Today', clear: 'Clear', done: 'Done', previous: 'Previous month', next: 'Next month', hour: 'Hour', minute: 'Minute', year: 'Year', invalid: 'Select a value within the allowed range' },
  id: { date: 'Pilih tanggal', time: 'Pilih waktu', month: 'Pilih bulan', today: 'Hari ini', clear: 'Hapus', done: 'Selesai', previous: 'Bulan sebelumnya', next: 'Bulan berikutnya', hour: 'Jam', minute: 'Menit', year: 'Tahun', invalid: 'Pilih nilai dalam rentang yang diizinkan' },
  zh: { date: '选择日期', time: '选择时间', month: '选择月份', today: '今天', clear: '清除', done: '完成', previous: '上个月', next: '下个月', hour: '小时', minute: '分钟', year: '年份', invalid: '请选择允许范围内的日期或时间' },
}

// Keep the existing ISO value/onChange contract; never delegate UI language to the OS picker.
export const LocalizedDateTimeInput = forwardRef<HTMLInputElement, Props>(function LocalizedDateTimeInput(
  { type, value, defaultValue, onChange, min, max, step, name, className, disabled, readOnly, required, onClick, onKeyDown, ...rest }, forwardedRef,
) {
  const { i18n } = useTranslation()
  const language = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0]
  const lang = language === 'zh' || language === 'id' ? language : 'en'
  const locale = lang === 'zh' ? 'zh-CN' : lang === 'id' ? 'id-ID' : 'en-GB'
  const copy = words[lang]
  const [internal, setInternal] = useState(String(defaultValue || ''))
  const current = String(value === undefined ? internal : value || '')
  const input = useRef<HTMLInputElement | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const focusPanel = useRef(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => { setDraft(null) }, [current, lang])
  const [position, setPosition] = useState({ left: 0, top: 0, width: 300 })
  const [view, setView] = useState(() => new Date())
  const hasDate = type !== 'time'
  const hasTime = type === 'time' || type === 'datetime-local'
  const selectedDate = current.slice(0, 10)
  const time = type === 'time' ? current : current.split('T')[1] || ''
  const hour = time.split(':')[0] || '00'
  const minute = time.split(':')[1] || '00'
  const lower = String(min || '')
  const upper = String(max || '')
  const allowed = (candidate: string) => {
    if ((lower && candidate < lower) || (upper && candidate > upper)) return false
    if (!step || step === 'any') return true
    const unit = Number(step)
    if (!Number.isFinite(unit) || unit <= 0) return true
    const amount = (v: string) => type === 'month' ? Number(v.slice(0, 4)) * 12 + Number(v.slice(5, 7)) - 1
      : type === 'time' ? Number(v.slice(0, 2)) * 3600 + Number(v.slice(3, 5)) * 60
      : new Date(`${v}${type === 'date' ? 'T00:00:00Z' : 'Z'}`).getTime() / (type === 'date' ? 86400000 : 1000)
    const offset = amount(candidate) - (lower ? amount(lower) : type === 'month' ? 1970 * 12 : 0)
    return Math.abs(offset / unit - Math.round(offset / unit)) < 1e-8
  }
  useEffect(() => { input.current?.setCustomValidity(current && !allowed(current) ? copy.invalid : '') }, [current, lower, upper, step, type, lang])
  const change = (next: string) => {
    if (next && !allowed(next)) return
    setDraft(null)
    setInternal(next)
    // Snapshot the ISO value: deferred React state updaters must never read the localized display.
    const node = input.current
    if (node) {
      node.setCustomValidity('')
      const target = new Proxy(node, { get: (element, key) => key === 'value' ? next : Reflect.get(element, key, element) })
      onChange?.({ target, currentTarget: target, type: 'change' } as ChangeEvent<HTMLInputElement>)
    }
  }
  const selectDate = (date: string) => {
    let next = type === 'datetime-local' ? `${date}T${time || '00:00'}` : date
    if (type === 'datetime-local') {
      if (lower && next < lower && date === lower.slice(0, 10)) next = lower
      if (upper && next > upper && date === upper.slice(0, 10)) next = upper
    }
    change(next)
    if (type !== 'datetime-local') { setOpen(false); input.current?.focus() }
  }
  const selectTime = (h: string, m: string) => {
    const prefix = type === 'datetime-local' ? `${/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? selectedDate : isoDate(new Date())}T` : ''
    let next = `${prefix}${h}:${m}`
    if (!allowed(next)) {
      const minutes = Array.from({ length: 60 }, (_, n) => n).sort((a, b) => Math.abs(a - Number(m)) - Math.abs(b - Number(m)))
      const valid = minutes.find(n => allowed(`${prefix}${h}:${pad(n)}`))
      if (valid === undefined) return
      next = `${prefix}${h}:${pad(valid)}`
    }
    change(next)
  }
  const show = (focus = false) => {
    focusPanel.current = focus
    if (disabled || readOnly) return
    const parsed = new Date(`${current.slice(0, 7)}-01T12:00:00`)
    setView(Number.isNaN(parsed.getTime()) ? new Date() : parsed)
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = input.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(304, window.innerWidth - 16)
      const height = type === 'time' ? 170 : type === 'datetime-local' ? 410 : 350
      setPosition({ width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: Math.max(8, rect.bottom + height > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6) })
    }
    place()
    if (focusPanel.current) panel.current?.querySelector<HTMLElement>('[aria-pressed="true"], select, button')?.focus()
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && event.target !== input.current) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); input.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, type])
  useEffect(() => { if (disabled || readOnly) setOpen(false) }, [disabled, readOnly])
  let display = ''
  if (current) {
    if (type === 'time') display = current
    else {
      const date = new Date(`${type === 'month' ? current + '-01' : current.slice(0, 10)}T12:00:00`)
      if (!Number.isNaN(date.getTime())) display = new Intl.DateTimeFormat(locale, type === 'month' ? { month: 'long', year: 'numeric' } : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
      if (type === 'datetime-local') display += ` ${time}`
    }
  }
  const year = view.getFullYear()
  const month = view.getMonth()
  const first = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const placeholder = type === 'time' ? 'HH:mm' : type === 'month' ? copy.month : lang === 'zh' ? '年/月/日' : type === 'datetime-local' ? 'DD/MM/YYYY HH:mm' : 'DD/MM/YYYY'
  const label = rest['aria-label'] || rest.title || copy[type === 'month' ? 'month' : type === 'time' ? 'time' : 'date']
  return <>
    <input {...rest} ref={node => {
      input.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    }} type="text" data-picker={type} className={`${className || ''} localized-datetime-input`} lang={locale}
      value={draft ?? display} placeholder={rest.placeholder || placeholder} disabled={disabled} readOnly={readOnly}
      required={required} autoComplete="off" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
      onChange={event => {
        const text = event.target.value.trim()
        if (!text) { change(''); return }
        setDraft(text)
        let next = ''
        if (type === 'time') next = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(text) ? text : ''
        else {
          const parts = text.split(/[ T]+/)
          const numbers = parts[0].match(/\d+/g) || []
          if (type === 'month' && numbers.length === 2) {
            const [y, m] = numbers[0].length === 4 ? numbers : [numbers[1], numbers[0]]
            if (Number(m) >= 1 && Number(m) <= 12 && y.length === 4) next = `${y}-${pad(Number(m))}`
          } else if (numbers.length === 3) {
            const [y, m, d] = numbers[0].length === 4 ? numbers : [numbers[2], numbers[1], numbers[0]]
            const date = new Date(Number(y), Number(m) - 1, Number(d))
            if (y.length === 4 && date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d)) next = isoDate(date)
          }
          if (type === 'datetime-local') next = next && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(parts[1] || '') ? `${next}T${parts[1]}` : ''
        }
        input.current?.setCustomValidity(!next || !allowed(next) ? copy.invalid : '')
        if (next && allowed(next)) change(next)
      }}
      onClick={event => { onClick?.(event); if (!event.defaultPrevented) show() }}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (event.defaultPrevented || disabled || readOnly) return
        if (event.key === 'Enter' || (event.key === ' ' && draft === null) || event.key === 'ArrowDown') { event.preventDefault(); show(true) }
        if (event.key === 'Escape') { setOpen(false); setDraft(null) }
      }} />
    {name && <input type="hidden" name={name} value={current} disabled={disabled} />}
    {open && createPortal(<div ref={panel} className="localized-datetime-panel" role="dialog" aria-label={label} lang={locale} style={position} onKeyDown={event => {
      const grid = (event.target as HTMLElement).closest('.localized-datetime-calendar')
      if (!grid || !(event.target instanceof HTMLButtonElement)) return
      const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[event.key]
      if (offset === undefined) return
      event.preventDefault()
      const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>('button'))
      const target = buttons[buttons.indexOf(event.target) + offset]
      if (target && !target.disabled) target.focus()
    }}>
      {hasDate && <>
        <div className="localized-datetime-header">
          <button type="button" aria-label={copy.previous} onClick={() => setView(new Date(year, month - 1, 1))}>‹</button>
          <select aria-label={copy.month} value={month} onChange={e => setView(new Date(year, Number(e.target.value), 1))}>
            {Array.from({ length: 12 }, (_, m) => <option key={m} value={m}>{new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, m, 1))}</option>)}
          </select>
          <input aria-label={copy.year} type="number" min="1" max="9999" value={year} onChange={e => { const y = Number(e.target.value); if (y > 0 && y < 10000) setView(new Date(y, month, 1)) }} />
          <button type="button" aria-label={copy.next} onClick={() => setView(new Date(year, month + 1, 1))}>›</button>
        </div>
        {type === 'month' ? <div className="localized-datetime-months">
          {Array.from({ length: 12 }, (_, m) => { const date = `${year}-${pad(m + 1)}`; return <button type="button" key={m} disabled={!allowed(date)} aria-pressed={current === date} onClick={() => selectDate(date)}>{new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(year, m, 1))}</button> })}
        </div> : <div className="localized-datetime-calendar">
          {Array.from({ length: 7 }, (_, d) => <span key={`weekday-${d}`}>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + d))}</span>)}
          {Array.from({ length: first }, (_, d) => <span key={`empty-${d}`} />)}
          {Array.from({ length: days }, (_, d) => {
            const date = `${year}-${pad(month + 1)}-${pad(d + 1)}`
            const candidate = type === 'datetime-local' ? `${date}T${time || '00:00'}` : date
            const enabled = type === 'datetime-local' ? (!lower || date >= lower.slice(0, 10)) && (!upper || date <= upper.slice(0, 10)) : allowed(candidate)
            return <button type="button" key={date} disabled={!enabled} aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date(year, month, d + 1))} aria-pressed={selectedDate === date} onClick={() => selectDate(date)}>{d + 1}</button>
          })}
        </div>}
      </>}
      {hasTime && <div className="localized-datetime-time">
        <label>{copy.hour}<select aria-label={copy.hour} value={hour} onChange={e => selectTime(e.target.value, minute)}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={pad(h)}>{pad(h)}</option>)}</select></label>
        <span>:</span>
        <label>{copy.minute}<select aria-label={copy.minute} value={minute} onChange={e => selectTime(hour, e.target.value)}>{Array.from({ length: 60 }, (_, m) => <option key={m} value={pad(m)}>{pad(m)}</option>)}</select></label>
      </div>}
      <div className="localized-datetime-actions">
        <button type="button" onClick={() => change('')}>{copy.clear}</button>
        {hasDate && <button type="button" disabled={!allowed(type === 'month' ? isoDate(new Date()).slice(0, 7) : type === 'datetime-local' ? `${isoDate(new Date())}T${time || '00:00'}` : isoDate(new Date()))} onClick={() => selectDate(type === 'month' ? isoDate(new Date()).slice(0, 7) : isoDate(new Date()))}>{copy.today}</button>}
        <button type="button" onClick={() => { setOpen(false); input.current?.focus() }}>{copy.done}</button>
      </div>
    </div>, document.body)}
  </>
})
