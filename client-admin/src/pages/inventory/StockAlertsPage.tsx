import { AdminDialog } from '../../components/AdminDialog'
import { LocalizedDateTimeInput } from '../../../../shared/components/LocalizedDateTimeInput'
import {useStoreDateSettings} from '../../hooks/useStoreDateSettings';
import {formatStoreDate} from '../../utils/storeDateTime';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { inventoryApi } from '../../services/api';
import { formatItemName } from '../../utils/helpers';
import { useDashboardContext } from '../../utils/dashboardNavigation';
import { DashboardReadFailure, DashboardContextNotice } from '../../components/DashboardReadState';
export function StockAlertsPage() {
    const dateSettings=useStoreDateSettings();
    const { t, i18n } = useTranslation(), context = useDashboardContext(), qc = useQueryClient();
    const [status, setStatus] = useState('open'), [type, setType] = useState(''), [selected, setSelected] = useState<any>(null), [note, setNote] = useState(''), [expiry, setExpiry] = useState(''), [error, setError] = useState('');
    const query = useQuery({ queryKey: ['inventory-alert-center', context.storeId], enabled: context.valid, queryFn: () => inventoryApi.alertCenter(), refetchInterval: 60000 });
    const refresh = () => { qc.invalidateQueries({ queryKey: ['inventory-alert-center'] }); setSelected(null); setNote(''); setExpiry(''); setError(''); };
    const mutation = useMutation({ mutationFn: () => selected.action === 'expiry' ? inventoryApi.setExpiry({ inventoryId: selected.detail.inventoryId, batchId: selected.detail.batchId || undefined, expiryDate: expiry }) : inventoryApi.handleAlert(selected.id, note), onSuccess: refresh, onError: () => setError(t('inventoryFlow.failed')) });
    const list: any[] = query.data?.data?.data?.list || [], visible = list.filter(a => (status === 'all' || a.status === status) && (!type || a.type === type));
    const n = (v: any) => v === null || v === undefined ? '—' : Number(Number(v).toFixed(3)), label = (key: string) => t('inventoryAlerts.' + key);
    if (!context.valid)
        return <DashboardReadFailure scope/>;
    if (query.isError)
        return <DashboardReadFailure retry={() => query.refetch()}/>;
    return <div className="space-y-5"><DashboardContextNotice current/><header className="flex justify-between"><h1 className="text-2xl font-bold">{label('title')}</h1><Link className="text-primary" to="/inventory/alert-config">{label('settings')}</Link></header><p className="text-sm text-gray-600">{label('formula')}</p><p className="text-sm text-gray-600">{label('handleHint')}</p>
 <div className="grid grid-cols-3 gap-3">{['open', 'handled', 'resolved'].map(s => <button key={s} className={`card text-left ${s === 'open' ? 'bg-orange-50' : ''}`} onClick={() => setStatus(s)}><p>{label(s)}</p><strong className="text-2xl">{list.filter(a => a.status === s).length}</strong></button>)}</div>
 <div className="flex gap-3"><select aria-label={label('open')} className="input min-w-0 flex-1" value={status} onChange={e => setStatus(e.target.value)}>{['open', 'handled', 'resolved', 'all'].map(s => <option key={s} value={s}>{label(s)}</option>)}</select><select aria-label={label('all')} className="input min-w-0 flex-1" value={type} onChange={e => setType(e.target.value)}><option value="">{label('all')}</option>{[...new Set(list.map(a => a.type))].map(s => <option key={s} value={s}>{label(s)}</option>)}</select><button className="btn btn-outline shrink-0 whitespace-nowrap" onClick={() => query.refetch()}>{t('inventoryFlow.refresh')}</button></div>
 {query.isPending ? <p>{t('common.loading')}</p> : !visible.length ? <p className="card text-gray-500">{t('inventoryFlow.noAlerts')}</p> : visible.map(a => {
            const d = a.detail;
            return <article key={a.id} className={`card border-l-4 space-y-2 ${a.status === 'resolved' ? 'border-gray-300' : a.severity === 'critical' ? 'border-red-500 bg-red-50' : a.severity === 'warning' ? 'border-orange-400 bg-orange-50' : 'border-blue-300 bg-blue-50'}`}><div className="flex justify-between gap-3"><strong>{label(a.type)} · {formatItemName(d.inventoryName || d.name || d.orderNumber || '', i18n.language)}</strong><span>{label(a.status)} · {label(a.severity)}</span></div>
 {d.currentStock !== undefined && <p className="text-sm">{t('inventoryFlow.currentStock')}: {n(d.currentStock)} {d.unit} · {label('safe')}: {n(d.effectiveSafetyStock)} {d.unit} · {label('daily')}: {n(d.dailyUsage)} {d.unit} · {t('inventoryAlerts.sample', { days: d.historyDays ?? 0 })} · {label('daysLeft')}: {n(d.daysUntilStockOut)} {t('common.days')}</p>}
 {d.basis === 'recorded_sales_ledger_estimate' && <p className="text-sm">{label('legacy')}</p>}
 {d.businessDate && <p>{d.businessDate} · {t('inventoryFlow.theory')}: {n(d.theoreticalConsumption)} {d.unit} · {t('inventoryFlow.actualOut')}: {n(d.actualConsumption)} {d.unit} · {label('variance')}: {n(d.variancePercent)} {d.variancePercent === null ? '' : '%'}</p>}
 {a.type === 'count_variance' && <p>{t('inventoryFlow.currentStock')}: {n(d.systemQty)} {d.unit} · {t('inventory.actualQty')}: {n(d.countedQty)} {d.unit} · {label('variance')}: {n(d.variance)} {d.unit} ({n(d.variancePercent)}%)</p>}
 {a.type === 'excessive_loss' && <p>{label('loss')}: {n(d.lossUsage)} {d.unit} ({n(d.lossPercent)}%)</p>}
 {d.expectedDate && <p>{label('expectedDate')}: {formatStoreDate(d.expectedDate,dateSettings)} · {d.orderNumber}</p>}
 {a.type.startsWith('expiry_') && <p>{d.batchNumber} · {label('quantity')}: {n(d.quantity)} {d.unit} · {label('expiryDate')}: {d.expiryDate ? formatStoreDate(d.expiryDate,dateSettings) : '—'}</p>}
 {a.type === 'data_incomplete' && <p>{label(d.reason)}</p>}
 {a.handleNote && <p className="text-sm">{label(a.active ? 'activeHandled' : 'handled')} · {a.handleNote}</p>}
 <div className="flex flex-wrap gap-4 text-sm">{a.status === 'open' && <button className="text-primary" onClick={() => { setSelected({ ...a, action: 'handle' }); setError(''); }}>{label('handle')}</button>}{a.active && a.type === 'expiry_missing' && <button className="text-primary" onClick={() => { setSelected({ ...a, action: 'expiry' }); setError(''); }}>{label('fixExpiry')}</button>}{d.purchaseOrderId && <Link className="text-primary" to="/inventory/purchase-orders">{t('inventoryFlow.purchase')}</Link>}{d.countId && <Link className="text-primary" to="/inventory/count">{t('inventoryFlow.count')}</Link>}{a.type === 'consumption_variance' && <Link className="text-primary" to="/inventory/consumption">{t('inventoryFlow.consumption')}</Link>}</div></article>;
        })}
 {selected && <AdminDialog title={label(selected.action === 'expiry' ? 'fixExpiry' : 'handle')} onClose={() => setSelected(null)} className="max-w-md" busy={Boolean(mutation.isPending)} trackChanges chrome><form className="space-y-4" onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>{selected.action === 'expiry' ? <label className="block">{label('expiryDate')}<LocalizedDateTimeInput required type="date" className="input w-full" value={expiry} onChange={e => setExpiry(e.target.value)}/></label> : <label className="block">{label('handleNote')}<textarea required maxLength={1000} className="input w-full" value={note} onChange={e => setNote(e.target.value)}/></label>}{error && <p role="alert" className="text-red-700">{error}</p>}<div className="admin-dialog-footer"><button type="button" disabled={mutation.isPending} className="btn-secondary" onClick={() => setSelected(null)} data-dialog-close="true">{t('common.cancel')}</button><button disabled={mutation.isPending || selected.action === 'handle' && !note.trim()} className="btn btn-primary">{t('common.save')}</button></div></form></AdminDialog>}
 </div>;
}
