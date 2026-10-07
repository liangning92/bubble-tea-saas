import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { formatCurrency, formatDateTime } from '../utils/helpers'
import {PageHelp} from './PageHelp'
export function PaymentEvidencePanel({ orderId }: { orderId: string }) {
  const { t } = useTranslation()
  const { data } = useQuery({ queryKey: ['payment-evidence', orderId], queryFn: async () => {
    try { return (await api.get(`/payments/order/${orderId}/evidence`)).data.data } catch (error: any) { if (error.response?.status === 404) return null; throw error }
  }, retry: false })
  if (!data) return <p className="text-sm text-gray-500">{t('manualPayment.absent')}</p>
  const download = async () => {
    try {
      const response = await api.get(`/payments/evidence/${data.id}`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data); const link = document.createElement('a')
      link.href = url; link.download = `payment-evidence-${data.id}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { alert(t('common.error')) }
  }
  return <div className="mt-4 p-3 border rounded-lg text-sm space-y-1">
    <p className="font-medium">{t('manualPayment.title')}</p>
    <p>{t('manualPayment.amount')}: {formatCurrency(data.amount)}</p>
    <p>{t('manualPayment.actor')}: {data.confirmedBy}</p>
    <p>{t('manualPayment.time')}: {data.confirmedAt ? formatDateTime(data.confirmedAt) : '—'}</p>
    <button type="button" className="text-primary underline" onClick={download}>{t('manualPayment.view')}</button>
    <PageHelp>{t('manualPayment.evidenceOnly')}</PageHelp>
  </div>
}
