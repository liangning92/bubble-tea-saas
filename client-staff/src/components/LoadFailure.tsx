import { useTranslation } from 'react-i18next'

export function LoadFailure({ retry }: { retry: () => void }) {
  const { t } = useTranslation()
  return <div role="alert" className="m-4 rounded-xl border border-red-200 bg-white p-4 text-red-700">
    <p>{t('common.loadFailed')}</p>
    <button onClick={retry} className="mt-3 rounded-lg bg-primary px-4 py-2 text-white">{t('common.retry')}</button>
  </div>
}
