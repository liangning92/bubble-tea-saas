import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/offline'
import { formatCurrency } from '../utils/helpers'

export interface ShiftEvidence {
  verified: boolean
  status: string
  windowStart: string | null
  windowEnd: string
  cashSales: number | null
  cashIns: number | null
  cashOuts: number | null
  qrisReceipts: number | null
  orderCount: number | null
  orderReceipts: number | null
}

export function ShiftSummaryEvidence({ evidence, openFloat, storeId, showValues = true, visibleFields = {} }: { evidence?: ShiftEvidence; openFloat?: number | null; storeId?: string | null; showValues?: boolean; visibleFields?: Record<string, boolean | undefined> }) {
  const { t } = useTranslation()
  const pending = useLiveQuery(async () => {
    if (!storeId) return null
    try { return await db.orders.where('status').anyOf('pending', 'syncing', 'failed').and(o => o.storeId === storeId).count() }
    catch { return null }
  }, [storeId])
  const locallyUncertain = pending === undefined || pending === null || pending > 0
  const money = (value: number | null | undefined) => typeof value === 'number' ? formatCurrency(value) : t('shiftEvidence.unknown')
  return <section className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4 text-gray-800" data-testid="shift-evidence">
    <h4 className="font-bold">{t('shiftEvidence.title')} · {t(!locallyUncertain && evidence?.status === 'provisional' ? 'shiftEvidence.provisional' : 'shiftEvidence.unknown')}</h4>
    <p className="text-sm mt-2" role="alert">{t('shiftEvidence.notice')}</p>
    {locallyUncertain && <p className="text-sm mt-2">{t(typeof pending === 'number' ? 'shiftEvidence.pending' : 'shiftEvidence.queueUnknown', { count: typeof pending === 'number' ? pending : undefined })}</p>}
    {evidence?.windowStart && <p className="text-xs text-gray-600 mt-2">{t('shiftEvidence.window')}: {new Date(evidence.windowStart).toLocaleString()} – {new Date(evidence.windowEnd).toLocaleString()}</p>}
    {showValues && <dl className="grid grid-cols-2 gap-2 mt-3 text-sm">
      {[
        ['openingFloat', openFloat], ['cashSales', evidence?.cashSales],
        ['cashIn', evidence?.cashIns], ['cashOut', evidence?.cashOuts],
        ['qrisReceipts', evidence?.qrisReceipts], ['receipts', evidence?.orderReceipts]
      ].filter(([key]) => visibleFields[String(key)] !== false).map(([key, value]) => <div key={String(key)}><dt>{t(`shiftEvidence.${key}`)}</dt><dd className="font-semibold">{money(key !== 'openingFloat' && locallyUncertain ? null : typeof value === 'number' ? value : null)}</dd></div>)}
      {visibleFields.orders !== false && <div><dt>{t('shiftEvidence.orders')}</dt><dd className="font-semibold">{locallyUncertain ? t('shiftEvidence.unknown') : evidence?.orderCount ?? t('shiftEvidence.unknown')}</dd></div>}
      {visibleFields.expected !== false && <div><dt>{t('pos.expectedCash')}</dt><dd className="font-semibold">{t('shiftEvidence.unknown')}</dd></div>}
    </dl>}
    <p className="text-xs mt-3">{t('shiftEvidence.manualCloseNotice')}</p>
  </section>
}
