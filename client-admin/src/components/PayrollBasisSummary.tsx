import { useTranslation } from 'react-i18next'
import { PayrollBasisDetails } from '../../../shared/components/PayrollBasisDetails'
export function PayrollBasisSummary({basis}: {basis:any}) {
 const {i18n}=useTranslation()
 return <PayrollBasisDetails basis={basis} language={i18n.language}/>
}
