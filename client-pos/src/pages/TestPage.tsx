import React from 'react'
import { useTranslation } from 'react-i18next'

export function TestPage() {
  const { t } = useTranslation()

  return (
    <div style={{ padding: 20, fontSize: 18 }}>
      <h1>🧋 POS Test</h1>
      <p>{t('testPage.environmentOk')}</p>
      <button onClick={() => alert(t('testPage.buttonNormal'))}>{t('testPage.testButton')}</button>
    </div>
  )
}