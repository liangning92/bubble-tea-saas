import { probationLabels } from '../../../shared/probationLabels'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Wallet, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { LoadFailure } from '../components/LoadFailure'
import { downloadPayslip } from '../utils/payslip'
import { formatCurrency } from '../utils/helpers'

export function SalaryPage() {
  const { t, i18n } = useTranslation()
  const probationText=probationLabels(i18n.language)
  const { user } = useAuthStore()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [loadError, setLoadError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [probation,setProbation]=useState<any>(null)
  const [probationError,setProbationError]=useState(false)
  const [salary, setSalary] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    setSalary(null)
    setLoadError(false)
    setIsLoading(true)
    if (!user?.staffId) {
      setIsLoading(false)
      return
    }
    staffApi.getMySalary(user.staffId, currentMonth.getMonth() + 1, currentMonth.getFullYear())
      .then(response => { if (active) setSalary(response.data || null) })
      .catch(error => { if (active) { setLoadError(true); console.error('Failed to load salary:', error) } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [user?.staffId, currentMonth, retryCount])

  const goToPrevMonth = () => {
    const prev = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    prev.setMonth(prev.getMonth() - 1)
    setCurrentMonth(prev)
  }

  const goToNextMonth = () => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    next.setMonth(next.getMonth() + 1)
    setCurrentMonth(next)
  }

  useEffect(()=>{
    let active=true;setProbation(null);setProbationError(false)
    if(!user?.staffId)return
    const month=`${currentMonth.getFullYear()}-${String(currentMonth.getMonth()+1).padStart(2,'0')}`
    staffApi.getMyProbation(month).then(response=>{if(active)setProbation(response.data)}).catch(()=>{if(active)setProbationError(true)})
    return ()=>{active=false}
  },[user?.staffId,currentMonth,retryCount])

  if (loadError) return <LoadFailure retry={() => setRetryCount(count => count + 1)} />

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center gap-3">
          <Wallet size={28} />
          <div>
            <h1 className="text-xl font-bold">{t('salary.title')}</h1>
            <p className="text-white/80 text-base">
              {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </header>

      {salary && <section className="grid grid-cols-3 gap-2 p-4 bg-white border-b">
        <div><p className="text-sm text-gray-500">{t('compensation.reward')}</p><p className="font-bold text-green-700">+{formatCurrency(salary.bonuses||0)}</p></div>
        <div><p className="text-sm text-gray-500">{t('compensation.penalty')}</p><p className="font-bold text-red-600">−{formatCurrency(salary.compensationPenalties||0)}</p></div>
        <div><p className="text-sm text-gray-500">{t('compensation.deposit')}</p><p className="font-bold text-amber-700">−{formatCurrency(salary.depositDeductionAmount||0)}</p></div>
        {!!salary.compensationItems?.length && <ul className="col-span-3 text-base">{salary.compensationItems.map((item:any)=><li key={item.id}>{t('compensation.'+item.type)} {formatCurrency(item.amount)} · {item.reason}</li>)}</ul>}
      </section>}

      {/* Month Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button
          onClick={goToPrevMonth}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ChevronLeft size={24} className="text-gray-600" />
        </button>
        <span className="font-bold text-gray-900">
          {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={goToNextMonth}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ChevronRight size={24} className="text-gray-600" />
        </button>
      </div>

      {probationError&&<p role="alert" className="p-4 text-red-600">{probationText.loadError}<button onClick={()=>setRetryCount(n=>n+1)}>↻</button></p>}
      {probation&&<section className="m-4 bg-white rounded-xl border p-4 space-y-2 text-sm"><h2 className="font-bold text-base">{probationText[probation.status==='probation'?'probation':probation.status==='not_started'?'not_started':'regular']}</h2><p>{probationText.formal}: {probation.formalMonthlySalary===null?'-':formatCurrency(probation.formalMonthlySalary)}</p><p>{probationText.current}: {probation.currentMonthlySalary===null?'-':formatCurrency(probation.currentMonthlySalary)}</p>{probation.confirmationDate&&<p>{probationText.confirmation}: {probation.confirmationDate}</p>}
      <h3 className="font-semibold">{probation.salaryStatus==='not_created'?probationText.estimated:probationText.recorded}</h3>
      {probation.basis ? <><p>{probationText.monthDays}: {probation.basis.daysInMonth} · {probationText.eligible}: {probation.basis.eligibleDays}</p><p>{probationText.formula}</p>{probation.basis.segments?.map((s:any,i:number)=><p key={i}>{s.type==='probation'?probationText.probation:probationText.regular} · {s.startDate} — {s.endDate}<br/>{formatCurrency(s.monthlyRate)} × {s.days} / {probation.basis.daysInMonth} = {formatCurrency(s.amount)}</p>)}<p className="font-bold">{probationText.total}: {formatCurrency(probation.basis.recordedBaseSalary??probation.basis.amount)}</p>{probation.basis.manualAdjustment&&<p>{probationText.manual}</p>}</> : <p>{probation.recordedBaseSalary===null?probationText.configError:formatCurrency(probation.recordedBaseSalary)}</p>}
      <p className="text-gray-500">{probation.salaryStatus==='not_created'?probationText.preview:probationText.legacy}</p></section>}
      {/* Salary Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : salary ? (
          <>
            {/* Total Salary Card */}
            <div className="bg-gradient-to-br from-primary to-pink-600 rounded-2xl p-6 text-white mb-6">
              <p className="text-white/80 text-base mb-1">{t('salary.totalSalary')}</p>
              <p className="text-4xl font-bold mb-4">
                {formatCurrency(salary.totalSalary)}
              </p>
              <div className="flex items-center gap-2 text-white/60 text-base">
                <span>{salary.staffName}</span>
                <span>•</span>
                <span>{user?.position}</span>
              </div>
            </div>

            {/* Breakdown */}
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">{t('salary.breakdown')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.baseSalary')}</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(salary.baseSalary)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.workDays')}</span>
                  <span className="font-medium text-gray-900">{salary.workDays} {t('common.days')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.overtime')}</span>
                  <span className="font-medium text-gray-900">
                    {salary.overtimeHours} {t('common.hours')} ({formatCurrency(salary.overtimePay)})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.bonuses')}</span>
                  <span className="font-medium text-green-600">
                    +{formatCurrency(salary.bonuses)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.commissions')}</span>
                  <span className="font-medium text-green-600">+{formatCurrency(salary.commissions || 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.deductions')}</span>
                  <span className="font-medium text-red-600">
                    -{formatCurrency(salary.deductions)}
                  </span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                  <span className="font-bold text-gray-900">{t('salary.totalSalary')}</span>
                  <span className="font-bold text-primary text-xl">
                    {formatCurrency(salary.totalSalary)}
                  </span>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">{t('salary.details')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.lateDays')}</span>
                  <span className="font-medium text-gray-900">{salary.lateDays} {t('common.days')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('salary.latePenalty')}</span>
                  <span className="font-medium text-red-600">
                    {/* latePenalty应由服务端计算，前端不应计算 */}
                    {salary.latePenalty != null ? formatCurrency(salary.latePenalty) : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Download Button */}
            <button onClick={() => downloadPayslip(salary, { title: t('salary.title'), baseSalary: t('salary.baseSalary'), overtimePay: t('salary.overtime'), commissions: t('salary.commissions'), bonuses: t('salary.bonuses'), compensationPenalties:t('compensation.penalty'), depositDeductionAmount:t('compensation.deposit'), otherDeductions:t('compensation.other'), deductions: t('salary.deductions'), totalSalary: t('salary.totalSalary') })} className="w-full py-4 bg-white border border-primary text-primary rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-colors">
              <Download size={20} />
              {t('salary.downloadSlip')}
            </button>
          </>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Wallet size={48} className="mx-auto mb-4 opacity-50" />
            <p>{t('salary.noData')}</p>
          </div>
        )}
      </div>
    </div>
  )
}