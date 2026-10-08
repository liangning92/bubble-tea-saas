import { useTranslation } from 'react-i18next'

export function RouteLoading() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-live="polite" className="flex min-h-48 items-center justify-center gap-3 p-8 text-gray-500">
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
      <span>{t('common.loading')}</span>
    </div>
  )
}
