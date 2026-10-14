import { ActorName } from './InventoryActor'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '../services/api'
import { formatDateTime, formatItemName } from '../utils/helpers'
import { useStoreDateSettings } from '../hooks/useStoreDateSettings'
import { calendarStart } from '../utils/queryPeriods'
import { inventoryLogDisplay, isInventoryAdjustment, countDetailUrl } from '../utils/inventoryCountFlow'

/** Adjustment history stays in the count workspace; legacy entries remain visible. */
export function InventoryCountAdjustments({ storeId }: { storeId: string }) {
  const { t, i18n } = useTranslation()
  const dates = useStoreDateSettings()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const invalid = !!start && !!end && start > end
  const nextDay = end ? new Date(Date.parse(end + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10) : ''
  const query = useQuery({
    queryKey: ['stock-logs', storeId, 'count-adjustments', start, end, dates.timezone],
    queryFn: () => inventoryApi.logs({ limit: 1000,
      startDate: start ? calendarStart(start, dates.timezone).toISOString() : undefined,
      endDate: end ? new Date(calendarStart(nextDay, dates.timezone).getTime() - 1).toISOString() : undefined
    }),
    enabled: !!storeId && !invalid
  })
  const raw = query.data?.data?.data?.list || query.data?.data?.list || []
  const logs = raw.map(inventoryLogDisplay).filter(isInventoryAdjustment)
  return <section className="card space-y-4" data-testid="inventory-count-adjustments">
    <h2 className="font-semibold">{t('inventoryCountWorkspace.adjustments')}</h2>
    <p className="text-sm text-gray-500">{t('inventoryCountWorkspace.historyHint')}</p>
    <div className="flex flex-wrap gap-3 items-end">
      <label>{t('inventoryCountWorkspace.startDate')}<input className="input block" type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>{t('inventoryCountWorkspace.endDate')}<input className="input block" type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <button className="btn btn-outline" disabled={invalid || query.isFetching} onClick={() => query.refetch()}>{t('common.refresh')}</button>
    </div>
    {invalid ? <p role="alert">{t('inventoryCountWorkspace.invalidDates')}</p>
      : query.isError ? <p role="alert">{t('inventoryCountWorkspace.historyFailed')}</p>
      : query.isLoading ? <p>{t('common.loading')}</p>
      : <>
        {raw.length >= 1000 && <p className="text-sm text-amber-700">{t('inventoryCountWorkspace.narrowDates')}</p>}
        {logs.length === 0 ? <p>{t('common.noData')}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead className="whitespace-nowrap"><tr className="text-left border-b"><th>{t('inventory.date')}</th><th>{t('inventoryCountWorkspace.document')}</th><th>{t('inventory.material')}</th><th>{t('inventoryCountWorkspace.appliedDelta')}</th><th>{t('inventory.operatorOrSupplier')}</th><th>{t('countFlow.reason')}</th></tr></thead>
          <tbody>{logs.map((log: any) => <tr key={log.id} className="border-b" data-testid="count-adjustment-log">
            <td className="py-3 pr-3 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
            <td className="pr-3">{log.countId ? <Link className="text-primary underline" to={countDetailUrl(log.countId, log.countItemId)}>{log.countId.slice(-8).toUpperCase()}</Link> : t('inventoryCountWorkspace.legacyAdjustment')}</td>
            <td className="pr-3">{formatItemName(log.inventory?.name || '-', i18n.language)}</td>
            <td className="pr-3 whitespace-nowrap">{log.stockDelta !== null && log.stockDelta > 0 ? '+' : ''}{log.stockDelta?.toLocaleString() ?? '—'} {log.inventory?.unit}</td>
            <td className="pr-3"><ActorName actor={log.operator} id={log.staffId}/></td><td>{typeof log.note === 'string' ? log.note : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      </>}
  </section>
}
