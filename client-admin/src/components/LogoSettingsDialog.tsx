import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { receiptLogoImage } from '../utils/receiptLogoImage'

export type LogoColor = 'red' | 'white' | 'black' | 'custom'
export type LogoSources = Partial<Record<LogoColor, string>>

export function LogoSettingsDialog({ purpose, variant, sources, onSave, onClose }: {
  purpose: 'receipt' | 'display'
  variant: LogoColor
  sources: LogoSources
  onSave: (color: LogoColor, file?: File) => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [color, setColor] = useState<LogoColor>(purpose === 'receipt' ? 'black' : variant)
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const source = preview || sources[color] || (color === 'white' ? '/youme-logo-white.png' : color === 'custom' ? '' : '/youme-logo-red.png')
  const save = async () => {
    setSaving(true); setError('')
    try {
      let image = file
      if (!image && !sources[color]) {
        if (!source) throw new Error('LOGO_IMAGE_FAILED')
        const response = await fetch(source)
        if (!response.ok) throw new Error('LOGO_IMAGE_FAILED')
        image = new File([await response.blob()], `logo-${color}.png`, { type: 'image/png' })
      }
      if (image && (purpose === 'receipt' || color === 'black')) image = await receiptLogoImage(image)
      await onSave(color, image)
      onClose()
    } catch (reason: any) {
      setError(t(reason?.message === 'LOGO_HAS_NO_INK' ? 'logoSettings.blankImage' : 'logoSettings.saveFailed'))
    } finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-label={t(`logoSettings.${purpose}`)} className="bg-white rounded-xl p-5 w-full max-w-md space-y-4">
      <h3 className="font-semibold">{t(`logoSettings.${purpose}`)}</h3>
      <p className="text-sm text-gray-600">{t('logoSettings.independent')}</p>
      {purpose === 'receipt' ? <p className="text-sm">{t('logoSettings.thermalBlack')}</p> : <label className="block text-sm">{t('posSettings.logoVariant')}
        <select className="input mt-1" value={color} disabled={saving} onChange={event => { setColor(event.target.value as LogoColor); setFile(undefined) }}>
          {(['red', 'white', 'black', 'custom'] as LogoColor[]).map(value => <option key={value} value={value}>{t(`posSettings.logo${value[0].toUpperCase()}${value.slice(1)}`)}</option>)}
        </select>
      </label>}
      <div className="rounded border p-4 flex items-center justify-center min-h-24" style={{ background: color === 'white' ? '#374151' : '#fff' }}>
        {source && <img src={source} alt={t('logoSettings.preview')} className="max-h-24 max-w-full object-contain" style={{ filter: color === 'black' && !preview ? 'brightness(0)' : undefined }} />}
      </div>
      <label className="block text-sm">{t('posSettings.uploadLogoBtn')}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={saving} className="block mt-2 text-sm max-w-full" onChange={async event => {
          const selected = event.target.files?.[0]
          if (!selected) return
          setSaving(true); setError('')
          try { setFile(purpose === 'receipt' || color === 'black' ? await receiptLogoImage(selected) : selected) }
          catch (reason: any) { setError(t(reason?.message === 'LOGO_HAS_NO_INK' ? 'logoSettings.blankImage' : 'logoSettings.saveFailed')) }
          finally { setSaving(false) }
        }} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>{t(saving ? 'common.loading' : 'common.save')}</button>
      </div>
    </section>
  </div>
}
