import { useTranslation } from 'react-i18next'
import { handoverReceiptFields, resolveHandoverReceiptItems } from '../../../shared/utils/handoverReceipt'

export function HandoverReceiptSettings({ settings, onChange, disabled = false }: {
  settings: any; onChange: (items: Record<string, boolean>) => void; disabled?: boolean
}) {
  const { t } = useTranslation()
  const items = resolveHandoverReceiptItems(settings)
  return <div className="card" data-testid="handover-receipt-settings">
    <h3 className="text-lg font-semibold mb-2">{t('handoverReceipt.title')}</h3>
    <p className="text-sm text-gray-500 mb-4">{t('handoverReceipt.hint')}</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {handoverReceiptFields.map(key => <label key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-3">
        <span className="text-sm">{t(`handoverReceipt.${key}`)}</span>
        <input type="checkbox" checked={items[key]} disabled={disabled} onChange={e => onChange({ ...items, [key]: e.target.checked })} />
      </label>)}
    </div>
  </div>
}
