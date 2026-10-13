import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {useAuthStore} from '../stores/auth';
import { inventoryApi } from '../services/api';
import { formatItemName } from '../utils/helpers';
export function ConsumptionAlertsWidget() {
    const {user}=useAuthStore();
    const { t, i18n } = useTranslation(), query = useQuery({ queryKey: ['inventory-alert-center',user?.storeId], enabled: !!user?.storeId, queryFn: () => inventoryApi.alertCenter(), refetchInterval: 60000 });
    const alerts = query.data?.data?.data?.list?.filter((a: any) => a.status === 'open') || [];
    return <section className="bg-white border rounded-xl p-4 space-y-3"><div className="flex justify-between items-center"><Link className="font-bold text-orange-700" to="/inventory/alerts">{query.isPending || query.isError ? t('inventoryAlerts.title') : t('inventoryAlerts.title') + ' (' + alerts.length + ')' }</Link><Link className="text-primary text-sm" to="/inventory/alert-config">{t('inventoryFlow.settings')}</Link></div>{query.isError ? <p role="alert" className="text-red-700">{t('inventoryFlow.failed')} <button onClick={() => query.refetch()}>{t('inventoryFlow.retry')}</button></p> : query.isPending ? <p>{t('inventoryFlow.loading')}</p> : !alerts.length ? <p className="text-sm text-gray-500">{t('inventoryFlow.noAlerts')}</p> : <div className="max-h-64 overflow-auto space-y-2">{alerts.map((alert: any) => <Link key={alert.id} to="/inventory/alerts" className={`block rounded-lg p-3 ${alert.severity === 'critical' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}><strong>{formatItemName(alert.detail.inventoryName || alert.detail.orderNumber || '', i18n.language)}</strong> · {t('inventoryAlerts.' + alert.type)} · {t('inventoryAlerts.' + alert.severity)}</Link>)}</div>}</section>;
}
