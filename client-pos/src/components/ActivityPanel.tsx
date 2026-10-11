import { useTranslation } from 'react-i18next'
import { languageIndex } from '../../../shared/utils/activityLabels'

// Eligible offers are quoted automatically; checkout only shows the result and
// any reward choice required by the configured activity rules.
export function ActivityPanel({quote,giftSelections,onGiftChange}:{quote:any;giftSelections:Record<string,string>;onGiftChange:(value:Record<string,string>)=>void}) {
 const {i18n}=useTranslation(),lang=languageIndex(i18n.language)
 if(!quote?.applied&&!quote?.pendingSelections?.length)return null
 return <div className="space-y-2 text-sm">
  {quote?.applied&&<p className="text-green-700">{quote.applied.name} · −Rp {quote.discount.toLocaleString('id-ID')}</p>}
  {quote?.pendingSelections?.map((selection:any)=><label className="block" key={selection.activityId}>{selection.name}<select className="input" value={giftSelections[selection.activityId]||''} onChange={e=>onGiftChange({...giftSelections,[selection.activityId]:e.target.value})}><option value="">{['选择赠品','Select reward','Pilih hadiah'][lang]}</option>{selection.rewards.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>)}
 </div>
}
