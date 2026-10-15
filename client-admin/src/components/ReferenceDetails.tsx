import { useTranslation } from 'react-i18next'
import { useState } from 'react'
export function ReferenceDetails({value}:{value:string}){
 const {t}=useTranslation(),[copied,setCopied]=useState(false)
 return <details className="text-xs text-gray-400 mt-1 min-w-0"><summary className="cursor-pointer">{t('entryFix.reference')} · {value.length>16?value.slice(-8):value}</summary><div className="flex flex-wrap items-center gap-2 mt-1"><span className="break-all select-all">{value}</span><button type="button" className="underline" onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true)}catch{setCopied(false)}}}>{copied?'✓':t('entryFix.copy')}</button></div></details>
}
