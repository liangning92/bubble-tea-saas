import { useTranslation } from 'react-i18next'

export interface SwapProgressData { status: string; targetConfirmed: boolean }
export function ShiftSwapProgress({ request }: { request: SwapProgressData }) {
  const { t } = useTranslation()
  const terminal = ['peer_rejected', 'rejected', 'cancelled'].includes(request.status)
  const stage = request.status === 'approved' ? 3 : request.targetConfirmed ? 2 : 1
  const state = request.status === 'pending' ? (request.targetConfirmed ? 'waitingAdmin' : 'waitingPeer') : request.status
  return <div className="my-3" aria-label={t('swapFlow.progress')}>
    <ol className="grid grid-cols-4 gap-1 text-center text-xs sm:text-sm">
      {['submitted', 'peer', 'admin', 'complete'].map((key, index) => <li key={key} aria-current={!terminal && index === stage ? 'step' : undefined} className="min-w-0">
        <div className={`h-1.5 rounded-full mb-2 ${index < stage || request.status === 'approved' ? 'bg-green-500' : terminal ? 'bg-red-200' : 'bg-gray-200'}`} />
        <span className={index === stage && !terminal ? 'font-semibold text-primary' : 'text-gray-600'}>{t(`swapFlow.${key}`)}</span>
      </li>)}
    </ol>
    <p role="status" className={`mt-3 text-sm font-medium ${terminal ? 'text-red-700' : 'text-gray-700'}`}>{t(`swapFlow.${state}`)}</p>
  </div>
}
