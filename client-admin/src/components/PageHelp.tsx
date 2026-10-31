import {useTranslation} from 'react-i18next'
export function PageHelp({children}: {children: React.ReactNode}) {
  const {t} = useTranslation()
  return <details className="workspace-disclosure text-sm text-gray-500"><summary className="cursor-pointer">{t('pageHelp.title')}</summary><div className="workspace-disclosure-content space-y-2">{children}</div></details>
}
