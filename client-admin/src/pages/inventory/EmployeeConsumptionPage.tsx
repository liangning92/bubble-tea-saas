import { LocalizedDateTimeInput } from '../../../../shared/components/LocalizedDateTimeInput'
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { inventoryApi } from '../../services/api';
import { formatItemName } from '../../utils/helpers';
import { ConsumptionAlertsWidget } from '../../components/ConsumptionAlertsWidget';
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export function EmployeeConsumptionPage() {
    const { t, i18n } = useTranslation(), [range, setRange] = useState({ startDate: today(), endDate: today() });
    const query = useQuery({ queryKey: ['employee-consumption', range], queryFn: () => inventoryApi.employeeConsumption(range), enabled: !!range.startDate && !!range.endDate, refetchInterval: 60000 });
    const settings = useQuery({ queryKey: ['inventory-alert-config'], queryFn: () => inventoryApi.getAlertConfig() });
    const data = query.data?.data?.data, config = settings.data?.data?.data;
    return <main className="space-y-5"><div className="flex justify-between gap-4 flex-wrap"><div><h1 className="text-2xl font-bold">{t('inventoryFlow.consumption')}</h1><p className="text-sm text-gray-500 mt-2">{t('inventoryFlow.analysisHint')}</p></div><Link className="text-primary" to="/inventory/alert-config">{t('inventoryFlow.settings')}</Link></div>
 <ConsumptionAlertsWidget />
 <div className="flex flex-wrap gap-3 items-center"><LocalizedDateTimeInput aria-label={t('shiftReview.start')} type="date" className="input w-auto" value={range.startDate} onChange={e => setRange({ ...range, startDate: e.target.value })}/><span>—</span><LocalizedDateTimeInput aria-label={t('shiftReview.end')} type="date" className="input w-auto" value={range.endDate} onChange={e => setRange({ ...range, endDate: e.target.value })}/><button className="btn btn-secondary" onClick={() => query.refetch()}>{t('inventoryFlow.refresh')}</button><Link className="text-primary" to="/inventory/physical-analysis">{t('inventoryFlow.physicalAnalysis')}</Link></div>
 {config && <p className="text-sm text-gray-500">{t(config.enableConsumptionAlert ? 'inventoryFlow.dailyEnabled' : 'inventoryFlow.dailyDisabled')} · {t('inventoryFlow.warning')} {config.varianceWarningPercent}% · {t('inventoryFlow.critical')} {config.varianceCriticalPercent}%</p>}
 {query.isPending && <p>{t('inventoryFlow.loading')}</p>}{query.isError && <p role="alert" className="text-red-700">{t('inventoryFlow.failed')}</p>}
 {data?.cutover && <p className="text-sm text-gray-500">{t('inventoryFlow.cutover', { date: new Date(data.cutover).toLocaleString(i18n.language, { timeZone: 'Asia/Jakarta' }) })}</p>}
 {data?.segments?.some((s: any) => s.basis === 'legacy') && <p className="bg-amber-50 rounded p-3">{t('inventoryFlow.legacyPeriod')}</p>}
 {data?.list?.some((r: any) => r.provisional) && <p className="text-sm text-blue-700">{t('inventoryFlow.provisional')}</p>}
 {data?.list?.some((r: any) => r.partialPeriod) && <p className="text-sm text-amber-700">{t('inventoryFlow.partialPeriod')}</p>}
 <div className="overflow-auto bg-white rounded-xl border"><p className="admin-scroll-hint">{t("uiDesign.scrollHint")}</p><table className="admin-wide-table w-full text-sm whitespace-nowrap"><thead><tr>{['material', 'theory', 'actualOut', 'withdrawal', 'loss', 'expired', 'other', 'process', 'difference', 'percent', 'state'].map(k => <th key={k} className="p-3 border-b text-left">{t('inventoryFlow.' + k)}</th>)}</tr></thead><tbody>{data?.list?.map((row: any) => <tr key={row.inventoryId} className={row.varianceStatus === 'critical' ? 'bg-red-50' : row.varianceStatus === 'warning' ? 'bg-amber-50' : ''}><td className="p-3">{formatItemName(row.inventoryName, i18n.language)} ({row.unit})</td>{[row.theoreticalConsumption, row.actualConsumption, ...['withdrawal', 'loss', 'expired', 'other', 'process'].map(k => row.breakdown[k]), row.variance].map((value, index) => <td className="p-3" key={index}>{Number(value).toLocaleString(i18n.language, { maximumFractionDigits: 2 })}</td>)}<td className="p-3">{row.variancePercent === null ? '—' : `${row.variancePercent.toFixed(1)}%`}</td><td className="p-3"><p>{t('inventoryFlow.' + row.varianceStatus)}</p>{row.unavailableReason && <p className="text-xs text-gray-500">{t('inventoryFlow.' + row.unavailableReason)}</p>}</td></tr>)}</tbody></table>{data && !data.list?.length && <p className="p-4">{t('inventoryFlow.empty')}</p>}</div>
 </main>;
}
