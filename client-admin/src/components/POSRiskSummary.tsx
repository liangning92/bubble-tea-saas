import { useTranslation } from 'react-i18next'
export function POSRiskSummary({ staff, select }: { staff: any[]; select: (staffId: string, action: string) => void }) {
  const { t } = useTranslation()
  return <section className="card mb-6 space-y-3" data-testid="pos-risk-summary">
    <h2 className="font-semibold text-lg">{t('posRisk.title')}</h2>
    <p className="text-sm text-gray-600">{t('posRisk.scope')}</p>
    <p className="text-sm text-amber-800">{t('posRisk.frequency')}</p>
    {!staff.length ? <p className="text-sm text-gray-500">{t('posRisk.empty')}</p> : <div className="space-y-3">{staff.map(row=><div key={row.staffId} className="rounded-lg border p-3 flex flex-wrap items-center gap-3">
      <span className="font-medium break-words">{row.staffName}</span>
      {(['manualDrawer','clearedCarts','removedItems'] as const).map((key,index)=><button key={key} disabled={!row[key]} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50 hover:bg-gray-50" onClick={()=>select(row.staffId,['cash_drawer','cart_clear','cart_remove'][index])}>{t('posRisk.'+key)}: {row[key]}</button>)}
    </div>)}</div>}
    <p className="text-xs leading-relaxed text-gray-500">{t('posRisk.limits')}</p>
  </section>
}
export function DrawerLogDetails({ metadata }: { metadata: unknown }) {
  const { t } = useTranslation()
  let meta: any = {}
  try { meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata || {} } catch { /* Unknown legacy metadata. */ }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {}
  return <div className="mt-2 text-sm space-y-1 break-words">
    <p>{t('posRisk.'+(['automatic','manual','test','admin_test'].includes(meta.source)?meta.source:'unknown'))} · {t('posRisk.'+(['requested','sent','unconfirmed'].includes(meta.status)?meta.status:'unknown'))}</p>
    {meta.reason && <p>{t('posRisk.reason')}: {String(meta.reason)}</p>}
    {meta.orderNumber && <p>{t('posRisk.order')}: {String(meta.orderNumber)}</p>}
    <p className="text-xs text-gray-500">{t('posRisk.physicalUnknown')}</p>
  </div>
}

export function RemovedItemDetails({ metadata }: { metadata: unknown }) {
  const { t } = useTranslation()
  let meta: any = {}
  try { meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata || {} } catch { /* Unknown historical metadata. */ }
  return <p className="mt-2 text-sm break-words">{meta?.productName ? String(meta.productName) : t('posRisk.unknown')} · {t('posRisk.removedQuantity')}: {Number.isFinite(meta?.removedQuantity) ? meta.removedQuantity : t('posRisk.unknown')}</p>
}
