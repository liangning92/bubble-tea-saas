import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/auth';
import { inventoryApi } from '../../services/api';
export function StockAlertConfigPage() {
    const { user } = useAuthStore();
    const { t } = useTranslation(), qc = useQueryClient(), [config, setConfig] = useState<any>(null), [dirty, setDirty] = useState(false), [message, setMessage] = useState('');
    const query = useQuery({ queryKey: ['inventory-alert-config', user?.storeId], enabled: !!user?.storeId, queryFn: () => inventoryApi.getAlertConfig() });
    useEffect(() => { if (query.data?.data?.data)
        setConfig(query.data.data.data); }, [query.data]);
    const mutation = useMutation({ mutationFn: () => inventoryApi.saveAlertConfig(config), onSuccess: () => { setDirty(false); setMessage(t('common.saveSuccess')); qc.invalidateQueries({ queryKey: ['inventory-alert-config'] }); qc.invalidateQueries({ queryKey: ['inventory-alert-center'] }); }, onError: () => setMessage(t('common.saveFailed')) });
    if (query.isError)
        return <p role="alert">{t('inventoryFlow.failed')} <button onClick={() => query.refetch()}>{t('inventoryFlow.retry')}</button></p>;
    if (!config)
        return <p>{t('common.loading')}</p>;
    const groups = [['enableLowStockAlert', 'lowStockWarningDays', 'lowStockCriticalDays'], ['enableConsumptionAlert', 'varianceWarningPercent', 'varianceCriticalPercent'], ['enablePurchaseAlert'], ['enableLossAlert', 'lossWarningPercent', 'lossCriticalPercent'], ['enableCountVarianceAlert', 'countVarianceWarningPercent', 'countVarianceCriticalPercent'], ['enableExpiryAlert', 'expiryWarningDays'], ['enableOverstockAlert', 'overstockDays', 'stagnantDays'], ['enableDataAlert']];
    const set = (k: string, v: any) => { setConfig({ ...config, [k]: v }); setDirty(true); setMessage(''); };
    return <form className="space-y-5" onSubmit={e => { e.preventDefault(); mutation.mutate(); }}><header className="flex justify-between"><h1 className="text-2xl font-bold">{t('inventoryAlerts.settings')}</h1><div className="flex gap-3"><button type="button" disabled={mutation.isPending} className="btn btn-outline" onClick={() => { setConfig(query.data?.data?.defaults); setDirty(true); }}>{t('common.reset')}</button><button disabled={!dirty || mutation.isPending} className="btn btn-primary">{t('common.save')}</button></div></header><p className="text-sm text-gray-600">{t('inventoryAlerts.formula')}</p>{message && <p role="status">{message}</p>}{groups.map(([enabled, ...fields]) => <section key={enabled} className="card space-y-4"><label className="flex gap-3 font-bold"><input type="checkbox" disabled={mutation.isPending} checked={config[enabled]} onChange={e => set(enabled, e.target.checked)}/>{t('inventoryAlerts.' + enabled)}</label><div className="grid grid-cols-2 gap-4">{fields.map(key => <label key={key}>{t('inventoryAlerts.' + key)}<input required type="number" min="1" step="any" disabled={mutation.isPending || !config[enabled]} className="input w-full mt-1" value={config[key]} onChange={e => set(key, Number(e.target.value))}/></label>)}</div></section>)}<label className="card block">{t('inventoryAlerts.autoCheckIntervalHours')}<input required className="input block mt-2" type="number" min="1" max="720" value={config.autoCheckIntervalHours} onChange={e => set('autoCheckIntervalHours', Number(e.target.value))}/></label></form>;
}
