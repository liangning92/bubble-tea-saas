import { LocalizedDateTimeInput } from '../../../../shared/components/LocalizedDateTimeInput'
import { payslipHtml, downloadPayslip } from '../../../../shared/payslip'
import { payrollPresentation, payrollStatus, isConfirmedBasis } from '../../../../shared/payrollPresentation'
import { LateCalculation } from '../../../../shared/components/PayrollBasisDetails'
import {Link} from 'react-router-dom'
import { payrollIssueText, payrollLabels } from '../../../../shared/payrollLabels'
import { PayrollBasisSummary } from '../../components/PayrollBasisSummary'
import { useEmployeePermission } from '../../contexts/EmployeeAccess'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { salaryApi, staffApi } from '../../services/api'
import { DollarSign, Loader2, Filter, X, CheckCircle } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  unrecorded: 'bg-gray-100 text-gray-700',
  paid: 'bg-green-100 text-green-700'
}

interface Salary {
  id: string
  staffId: string
  month: string
  payrollReview?: {reason:string}|null
  reestimate?: {baseSalary:number;finalAmount:number;difference:number;originalFinalAmount?:number;error?:string}
  calculationError?: string
  payrollBasis?: any
  compensationAdjustmentIds?: string[]
  compensationRewards?: number
  compensationPenalties?: number
  depositRefundAmount?: number
  settlementAmount?:number
  depositDeductionAmount?: number
  compensationItems?: Array<{id:string;type:string;amount:number;reason:string}>
  depositNeedsReview?: boolean
  expectedDepositAmount?: number
  depositDeductions?: Array<{staffDepositId: string; amountMinor: number}>
  baseSalary: number
  overtime: number
  commission: number
  bonus: number
  deduction: number
  finalAmount: number
  status: string
  staff?: {
    id: string
    name: string
    employeeNumber: string
  }
  createdAt: string
}

interface StaffOption {
  id: string
  name: string
  employeeNumber: string
}

export function SalaryListPage() {
  const canWrite=useEmployeePermission('salary.write')
  const { t, i18n } = useTranslation()
  const { user } = useAuthStore()

  const [preparing,setPreparing]=useState(false)
  const [prepareMessage,setPrepareMessage]=useState('')
  const salaryLoadSequence=useRef(0)
  const skipInitialManualDays=useRef(false)
  const [allPayroll,setAllPayroll]=useState<Salary[]>([])
  const [salaries, setSalaries] = useState<Salary[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStaff, setFilterStaff] = useState<string>('')
  const [filterMonth, setFilterMonth] = useState<string>(() => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(new Date()))
  const [filterStatus, setFilterStatus] = useState<string>('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingSalary, setEditingSalary] = useState<Salary | null>(null)
  const [depositPlan, setDepositPlan] = useState<{staffId: string; month: string; items: Array<{staffDepositId: string; amountMinor: number}>} | null>(null)
  const [payrollBasis,setPayrollBasis]=useState<any>(null)
  const [daysError,setDaysError]=useState(false)
  const [workingDays,setWorkingDays]=useState<{probation:string;regular:string}|null>(null)
  const l=payrollLabels(i18n.language),pl=payrollPresentation(i18n.language)
  const [lateMinutes,setLateMinutes]=useState('0')
  const [lateMode,setLateMode]=useState<'rule'|'manual'>('rule')
  const [manualLateDeduction,setManualLateDeduction]=useState('0')
  const [otherAttendanceDeduction,setOtherAttendanceDeduction]=useState('0')
  const [correctionReason,setCorrectionReason]=useState('')
  const [daySource,setDaySource]=useState<'estimate'|'manual'|'attendance'>('estimate')
  const [unpaidDays,setUnpaidDays]=useState({probation:'0',regular:'0'})
  const appliedLeaveAmount=useRef(0)
  const [depositRefundAmount,setDepositRefundAmount]=useState(0)
  const [payslip,setPayslip]=useState<any>(null)
  const [attendancePreview,setAttendancePreview]=useState<any>(null)
  const appliedAttendanceAmount=useRef(0)
  const [saveError, setSaveError] = useState('')
  const [depositLoading, setDepositLoading] = useState(false)
  const [depositError, setDepositError] = useState('')
  const appliedDepositAmount = useRef(0)
  const appliedCompensation = useRef({rewards:0,penalties:0})
  const [compensationIds,setCompensationIds]=useState<string[]>([])
  const [formData, setFormData] = useState({
    staffId: '',
    month: '',
    baseSalary: '',
    overtime: '0',
    commission: '0',
    bonus: '0',
    deduction: '0'
  })
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)

  const activeSalaryContext = useRef('')
  activeSalaryContext.current = `${showModal}:${formData.staffId}:${formData.month}:${workingDays?.probation}:${workingDays?.regular}`

  useEffect(() => {
    if (!showModal || !formData.staffId || !formData.month || payrollBasis?.settlementVersion===1) return
    let current = true
    setDepositLoading(true)
    setDepositError('')
    salaryApi.depositPlan(formData.staffId, formData.month).then(response => {
      if (!current) return
      const items = response.data.data.depositDeductions || []
      const amount = items.reduce((sum: number, item: {amountMinor: number}) => sum + Math.round(item.amountMinor / 100), 0)
      const compensation=response.data.data.compensation || {items:[],rewards:0,penalties:0}
      const previousCompensation=appliedCompensation.current
      appliedCompensation.current=compensation
      setCompensationIds(compensation.items.map((item:{id:string})=>item.id))
      const previous = appliedDepositAmount.current
      appliedDepositAmount.current = amount
      setDepositPlan({staffId:formData.staffId, month:formData.month, items})
      setFormData(prev => ({...prev, bonus:String(Math.max(0,Number(prev.bonus)-previousCompensation.rewards)+compensation.rewards), deduction:String(Math.max(0, Number(prev.deduction) - previous - previousCompensation.penalties) + amount + compensation.penalties)}))
    }).catch(() => {if (current) setDepositError(t('salaryDeposit.loadFailed'))})
      .finally(() => {if (current) setDepositLoading(false)})
    return () => {current = false}
  }, [showModal, formData.staffId, formData.month, t,payrollBasis?.settlementVersion])

  // Get current month in YYYY-MM format
  const getCurrentMonth = () => {
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(new Date())
  }

  useEffect(() => {
    loadSalaries()
    loadStaff()
  }, [user, filterStaff, filterMonth, filterStatus])

  const loadSalaries = async () => {
    const sequence=++salaryLoadSequence.current
    setIsLoading(true)
    try {
      const params: any = {}
      params.storeId = user?.storeId
      params.month = filterMonth || getCurrentMonth()
      params.includeUnrecorded = true
      setPreparing(true);setPrepareMessage('')
      if(sequence!==salaryLoadSequence.current)return
      const response = await salaryApi.list(params)
      if(sequence!==salaryLoadSequence.current)return
      const rows=(response.data?.data?.list||[]).map((row:Salary)=>row.reestimate&&!row.reestimate.error?{...row,...row.reestimate,payrollReview:row.payrollReview?{reason:'LEGACY_RECALC_REQUIRED'}:null}:row)
      setAllPayroll(rows)
      setSalaries(rows.filter((s:Salary)=>(!filterStaff||s.staffId===filterStaff)&&(!filterStatus||s.status===filterStatus)))
    } catch (error) {
      console.error('Failed to load salaries:', error)
      setPrepareMessage(t('common.error'))
    } finally {
      if(sequence===salaryLoadSequence.current){setIsLoading(false);setPreparing(false)}
    }
  }

  const loadStaff = async () => {
    try {
      const response = await staffApi.list({ storeId: user?.storeId, pageSize: 100 })
      const rows=response.data?.data?.list || []
      const total=response.data?.data?.total || rows.length
      for(let page=2;rows.length<total;page++){const next=await staffApi.list({storeId:user?.storeId,pageSize:100,page});const items=next.data?.data?.list||[];if(!items.length)break;rows.push(...items)}
      setStaffOptions(rows)
    } catch (error) {
      console.error('Failed to load staff:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const formatMonth = (monthStr: string) => {
    if (!monthStr) return ''
    const [year, month] = monthStr.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  }

  const calculateFinalAmount = () => {
    const base = parseInt(formData.baseSalary) || 0
    const overtime = parseInt(formData.overtime) || 0
    const commission = parseInt(formData.commission) || 0
    const bonus = parseInt(formData.bonus) || 0
    const deduction = parseInt(formData.deduction) || 0
    return base + overtime + commission + bonus - deduction + depositRefundAmount
  }

  const handleOpenModal = (salary?: Salary) => {
    setDaysError(false)
    setCorrectionReason('');setAttendancePreview(null)
    const basis=salary?.payrollBasis
    const correction=basis?.correction
    setLateMinutes(String(correction?.lateMinutes||0));setLateMode(correction?.lateMode||'rule');setManualLateDeduction(String(correction?.manualLateDeduction||0));setOtherAttendanceDeduction(String(correction?.otherAttendanceDeduction||0))
    setDaySource(basis?.settlementVersion===1?'estimate':basis?.daysSource==='attendance'?'attendance':'manual')
    setUnpaidDays({probation:String(basis?.unpaidLeave?.days?.probation||0),regular:String(basis?.unpaidLeave?.days?.regular||0)})
    appliedLeaveAmount.current=basis?.unpaidLeave?.deduction||0;setDepositRefundAmount(salary?.depositRefundAmount||0)
    const legacyMonthlyLate=salary?.compensationItems?.find(item=>item.id===`late-${salary.staffId}-${salary.month}`)?.amount||0
    appliedAttendanceAmount.current=(correction?.lateDeduction||0)+(correction?.otherAttendanceDeduction||0)+legacyMonthlyLate
    skipInitialManualDays.current=basis?.settlementVersion!==1&&!!salary&&salary.status!=='unrecorded'&&(basis?.version===2||basis?.manualAdjustment||basis?.manualCorrection||basis?.daysSource==='manual')
    setWorkingDays(basis ? {probation:String(basis.workingDays?.probation ?? basis.segments.filter((s:any)=>s.type==='probation').reduce((n:number,s:any)=>n+s.days,0)),regular:String(basis.workingDays?.regular ?? basis.segments.filter((s:any)=>s.type==='regular').reduce((n:number,s:any)=>n+s.days,0))} : null)
    setPayrollBasis(salary?.payrollBasis||null)
    setSaveError('')
    setDepositError('')
    appliedCompensation.current={rewards:salary?.compensationRewards||0,penalties:Math.max(0,(salary?.compensationPenalties||0)-legacyMonthlyLate)}
    setCompensationIds((salary?.compensationAdjustmentIds||[]).filter(id=>id!==`late-${salary?.staffId}-${salary?.month}`))
    appliedDepositAmount.current = (salary?.depositDeductions || []).reduce((sum, item) => sum + Math.round(item.amountMinor / 100), 0)
    setDepositPlan(salary ? { staffId: salary.staffId, month: salary.month, items: salary.depositDeductions || [] } : null)
    if (salary) {
      setEditingSalary(salary.status==='unrecorded'?null:salary)
      setFormData({
        staffId: salary.staffId,
        month: salary.month,
        baseSalary: String(salary.baseSalary),
        overtime: String(salary.overtime),
        commission: String(salary.commission),
        bonus: String(salary.bonus),
        deduction: String(salary.deduction)
      })
    } else {
      setEditingSalary(null)
      setFormData({
        staffId: '',
        month: filterMonth || getCurrentMonth(),
        baseSalary: '',
        overtime: '0',
        commission: '0',
        bonus: '0',
        deduction: '0'
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingSalary(null)
  }

  const previewCorrection = () => ({...(daySource==='estimate'?{unpaidProbationDays:Number(unpaidDays.probation),unpaidRegularDays:Number(unpaidDays.regular)}:{}),lateMinutes:Number(lateMinutes),lateMode,manualLateDeduction:Number(manualLateDeduction),otherAttendanceDeduction:Number(otherAttendanceDeduction)})
  const importAttendance = async () => {
    if(!formData.staffId||!formData.month)return
    setCalculating(true);setSaveError('')
    const context=`${formData.staffId}:${formData.month}`
    try {
      const response=await salaryApi.calculate(formData.staffId,Number(formData.month.slice(5)),Number(formData.month.slice(0,4)),undefined,undefined,'attendance')
      if(activeSalaryContext.current.startsWith(`true:${context}:`))setAttendancePreview(response.data.data)
    }catch{setSaveError(t('staff.salary.calcFailed'))}finally{setCalculating(false)}
  }
  const applyAttendance = () => {
    const data=attendancePreview,basis=data.payrollBasis
    setWorkingDays({probation:String(basis.attendanceDays.probation),regular:String(basis.attendanceDays.regular)})
    setDaySource('attendance')
    setLateMinutes(String(basis.correction?.lateMinutes||0));setLateMode(basis.correction?.lateMode||(data.latePenalty>0?'manual':'rule'));setManualLateDeduction(String(basis.correction?.manualLateDeduction??data.latePenalty??0))
    setOtherAttendanceDeduction(String(basis.correction?.otherAttendanceDeduction??Math.max(0,data.deductions-(data.compensation?.penalties||0)-(data.depositDeductions||[]).reduce((sum:number,i:any)=>sum+i.amount,0)-(data.latePenalty||0))))
    setAttendancePreview(null)
  }
  const [previewRevision,setPreviewRevision]=useState(0)
  useEffect(()=>{
    if(!showModal||!formData.staffId||!formData.month)return
    if(skipInitialManualDays.current){skipInitialManualDays.current=false;return}
    let active=true
    setCalculating(true);setSaveError('');setDaysError(false)
    const days=daySource!=='estimate'&&workingDays?{probation:Number(workingDays.probation),regular:Number(workingDays.regular)}:undefined
    if((daySource!=='estimate'&&workingDays&&(workingDays.probation===''||workingDays.regular===''))||lateMinutes===''||manualLateDeduction===''||otherAttendanceDeduction===''){setSaveError(l.invalidDays);setDaysError(true);setCalculating(false);return}
    const timer=setTimeout(()=>salaryApi.calculate(formData.staffId,Number(formData.month.slice(5)),Number(formData.month.slice(0,4)),days,previewCorrection(),days?daySource:'estimate').then(response=>{
      if(!active)return
      const data=response.data.data,basis=data.payrollBasis
      setPayrollBasis(basis)
      const nextLeave=basis.unpaidLeave?.deduction||0
      const previousLeave=appliedLeaveAmount.current;appliedLeaveAmount.current=nextLeave
      if(daySource!=='estimate')setUnpaidDays({probation:String(basis.unpaidLeave?.days?.probation||0),regular:String(basis.unpaidLeave?.days?.regular||0)})
      setDepositRefundAmount(data.depositRefundAmount||0)
      const nextAttendance=(basis.correction?.lateDeduction||0)+(basis.correction?.otherAttendanceDeduction||0)
      const nextComp=data.compensation||{rewards:0,penalties:0}
      const nextDeposit=(data.depositDeductions||[]).reduce((sum:number,i:any)=>sum+i.amount,0)
      const previousAttendance=appliedAttendanceAmount.current,previousComp=appliedCompensation.current,previousDeposit=appliedDepositAmount.current
      appliedAttendanceAmount.current=nextAttendance;appliedCompensation.current=nextComp;appliedDepositAmount.current=nextDeposit
      setCompensationIds(data.compensationAdjustmentIds||[])
      setDepositPlan({staffId:formData.staffId,month:formData.month,items:data.depositDeductions||[]})
      setFormData(previous=>({...previous,baseSalary:String(data.baseSalary),bonus:String(Math.max(0,Number(previous.bonus)-previousComp.rewards)+nextComp.rewards),deduction:String(Math.max(0,Number(previous.deduction)-previousAttendance-previousComp.penalties-previousDeposit-previousLeave)+nextLeave+nextAttendance+nextComp.penalties+nextDeposit)}))
      if(basis.correction?.lateRuleRequired){setSaveError(pl.noRule);setDaysError(true)}
    }).catch(()=>{if(active){setSaveError(t('staff.salary.calcFailed'));setDaysError(true)}}).finally(()=>{if(active)setCalculating(false)}),200)
    return ()=>{active=false;clearTimeout(timer)}
  },[showModal,formData.staffId,formData.month,workingDays?.probation,workingDays?.regular,lateMinutes,lateMode,manualLateDeduction,otherAttendanceDeduction,daySource,previewRevision,unpaidDays.probation,unpaidDays.regular])

  const handleSave = async () => {
    if (!formData.staffId || !formData.month || !formData.baseSalary) {
      alert(t('common.required'))
      return
    }

    if(!correctionReason.trim()){setSaveError(pl.reasonRequired);return}

    if (saving || calculating || depositLoading || depositError || daysError) return
    if (Number(formData.deduction) < appliedDepositAmount.current+appliedCompensation.current.penalties || Number(formData.bonus)<appliedCompensation.current.rewards) {setSaveError(t('salaryDeposit.minimum')); return}
    const amounts = ['baseSalary', 'overtime', 'commission', 'bonus', 'deduction'].map(key => Number(formData[key as keyof typeof formData]))
    if (amounts.some(value => !Number.isSafeInteger(value) || value < 0) || calculateFinalAmount() < 0) { setSaveError(l.invalidMoney); return }
    setSaveError('')
    setSaving(true)
    try {
      const data = {
        manualCorrection:true,
        daysSource:daySource,
        correction:{...previewCorrection(),reason:correctionReason.trim()},
        includedLeaveDeduction:appliedLeaveAmount.current,
        includedAttendanceDeduction:appliedAttendanceAmount.current,
        manualBaseSalary:!!payrollBasis && Number(formData.baseSalary)!==payrollBasis.amount,
        workingDays: daySource==='estimate'?undefined:workingDays ? {probation:Number(workingDays.probation),regular:Number(workingDays.regular)} : payrollBasis?{probation:payrollBasis.segments.filter((seg:any)=>seg.type==='probation').reduce((sum:number,seg:any)=>sum+seg.days,0),regular:payrollBasis.segments.filter((seg:any)=>seg.type==='regular').reduce((sum:number,seg:any)=>sum+seg.days,0)}:undefined,
        autoBaseSalary: !!payrollBasis && Number(formData.baseSalary) === payrollBasis.amount,
        compensationAdjustmentIds:compensationIds,
        storeId: user?.storeId,
        staffId: formData.staffId,
        month: formData.month,
        baseSalary: parseInt(formData.baseSalary),
        overtime: parseInt(formData.overtime) || 0,
        commission: parseInt(formData.commission) || 0,
        bonus: parseInt(formData.bonus) || 0,
        deduction: parseInt(formData.deduction) || 0,
        depositDeductions: depositPlan?.staffId === formData.staffId && depositPlan?.month === formData.month ? depositPlan.items : []
        // 注意: finalAmount 由服务端统一计算，不要前端计算后发送
      }

      if (editingSalary) {
        await salaryApi.update(editingSalary.id, data)
      } else {
        await salaryApi.create(data)
      }
      loadSalaries()
      handleCloseModal()
    } catch (error: any) {
      setSaveError(payrollIssueText(i18n.language,error?.response?.data?.message))
    } finally {
      setSaving(false)
    }
  }

  const openPayslip=async(id:string)=>{try{const r=await salaryApi.payslip(id);setPayslip(r.data.data)}catch{alert(pl.salaryErrorHint)}}

  const handleMarkPaid = async (id: string) => {
    try {
      await salaryApi.markPaid(id)
      loadSalaries()
    } catch (error:any) {
      console.error('Failed to mark paid:', error)
      alert(error?.response?.data?.message==='SALARY_REVIEW_REQUIRED'?l.reviewGeneric:t('salaryDeposit.recalculate'))
    }
  }

  const pendingSalaries = salaries.filter(s => s.status === 'pending' && isConfirmedBasis(s.payrollBasis))
  const paidSalaries = salaries.filter(s => s.status === 'paid')
  const thisMonthSalaries = salaries.filter(s => s.status==='unrecorded'||s.status==='pending'&&!isConfirmedBasis(s.payrollBasis))

  const totalPending = pendingSalaries.reduce((sum, s) => sum + (s.settlementAmount??s.finalAmount), 0)
  const totalPaid = paidSalaries.reduce((sum, s) => sum + (s.settlementAmount??s.finalAmount), 0)
  const thisMonthTotal = thisMonthSalaries.reduce((sum, s) => sum + (s.settlementAmount??s.finalAmount), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarSign size={28} />
            <div />
          </div>
          <button
            onClick={() => handleOpenModal()}
            disabled={preparing||!canWrite}
            className="flex items-center gap-2 bg-white text-primary px-4 py-2 rounded-lg font-medium hover:bg-gray-100"
          >
            {l.correction}
          </button>
        </div>
      </header>

      {prepareMessage&&<p role="alert" className="p-4 text-amber-700">{prepareMessage}</p>}
      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-500" />
          <select
            value={filterStaff}
            onChange={(e) => setFilterStaff(e.target.value)}
            className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">{t('staff.salary.selectStaff')}</option>
            {staffOptions.map((staff) => (
              <option key={staff.id} value={staff.id}>{staff.name}</option>
            ))}
          </select>
          <LocalizedDateTimeInput
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">{t('common.all')} {t('staff.salary.status')}</option>
            <option value="pending">{pl.confirmed}</option>
            <option value="unrecorded">{pl.estimate}</option>
            <option value="paid">{t('staff.salary.paid')}</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-yellow-800 text-sm font-medium">{t('staff.salary.totalPending')}</p>
          <p className="text-xl font-bold text-yellow-900">{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-green-800 text-sm font-medium">{t('staff.salary.totalPaid')}</p>
          <p className="text-xl font-bold text-green-900">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-blue-800 text-sm font-medium">{pl.estimatedTotal}</p>
          <p className="text-xl font-bold text-blue-900">{formatCurrency(thisMonthTotal)}</p>
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : salaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <DollarSign size={48} className="mb-4 opacity-50" />
            <p>{t('staff.salary.noSalaries')}</p>

          </div>
        ) : (
          salaries.map((salary) => (
            <div key={salary.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-gray-900">
                    {salary.staff?.name || t('staff.salary.staff')}
                  </p>
                  <p className="text-sm text-gray-500">
                    {salary.staff?.employeeNumber || '-'}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[salary.status]}`}>
                  {salary.payrollReview ? (salary.payrollReview.reason==='STAFF_BASE_SALARY_REQUIRED'?l.needsSalary:l.needsCorrection) : payrollStatus(salary,i18n.language)}
                </span>
              </div>

              {salary.payrollBasis?.segments?.length>0&&<p className="text-sm text-blue-700 mb-3">{salary.payrollBasis.segments.map((segment:any)=>`${segment.type==='probation'?pl.probation:pl.regular} · ${formatCurrency(segment.monthlyRate)} × ${segment.days} / ${salary.payrollBasis.daysInMonth}`).join(' + ')}</p>}
              <div className="mb-3">
                <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
                  {formatMonth(salary.month)}
                </span>
              </div>

              {salary.payrollReview&&<p className="text-sm text-amber-700 mb-2">{payrollIssueText(i18n.language,salary.payrollReview.reason)}{salary.payrollReview.reason==='STAFF_BASE_SALARY_REQUIRED'&&<Link className="ml-2 underline" to={'/staff/'+salary.staffId+'/edit'}>{l.configureSalary}</Link>}</p>}
              {salary.payrollBasis?.employmentNeedsReview&&<p role="alert" className="text-amber-700">{l.employmentReview}</p>}
              <div className="mb-4"><p className="text-sm text-gray-500">{payrollStatus(salary,i18n.language)}</p><p className="text-3xl font-bold">{salary.calculationError?pl.salaryError:formatCurrency(salary.settlementAmount??salary.finalAmount)}</p></div>
              {(salary.status!=='paid'&&!salary.payrollBasis?.confirmed)&&<p className="text-sm text-blue-700 mb-4">{pl.estimateHint}</p>}
              {salary.status==='pending'&&salary.payrollBasis?.version!==2&&<p className="text-sm text-amber-700 mb-3">{pl.legacy}</p>}
              {salary.reestimate&&<p className="text-sm text-blue-700 mb-3">{salary.reestimate.error?pl.salaryErrorHint:<>{pl.originalAmount}: {formatCurrency(salary.reestimate.originalFinalAmount??salary.finalAmount)} · {pl.difference}: {formatCurrency(salary.reestimate.difference)}</>}</p>}
              <section className="border rounded-xl p-4 mb-3"><h3 className="font-semibold mb-3">{pl.breakdown}</h3><dl className="space-y-2 text-sm">
                {[[pl.base,salary.baseSalary],[pl.overtime,salary.overtime],[pl.commission,salary.commission],[pl.reward,salary.bonus],[pl.lateDeduction,-(salary.payrollBasis?.correction?.lateDeduction||0)],[pl.penalty,-(salary.compensationPenalties||0)],[pl.deposit,-(salary.depositDeductionAmount||0)],[pl.unpaidLeave,-(salary.payrollBasis?.unpaidLeave?.deduction||0)],[pl.depositRefund,salary.depositRefundAmount||0],[pl.otherDeduction,-Math.max(0,salary.deduction-(salary.payrollBasis?.correction?.lateDeduction||0)-(salary.compensationPenalties||0)-(salary.depositDeductionAmount||0)-(salary.payrollBasis?.unpaidLeave?.deduction||0))]].map(([label,amount])=><div className="flex justify-between gap-3" key={String(label)}><dt className="text-gray-500">{label}</dt><dd className={Number(amount)<0?'text-red-600':'font-medium'}>{formatCurrency(Number(amount)||0)}</dd></div>)}
                <div className="flex justify-between border-t pt-2 font-semibold"><dt>{pl.totalDeduction}</dt><dd>{formatCurrency(salary.deduction)}</dd></div>
              </dl></section>
              {!!salary.compensationItems?.length&&<details className="text-sm mb-3"><summary>{t('compensation.title')}</summary><ul>{salary.compensationItems.map(item=><li key={item.id}>{t('compensation.'+item.type)} {formatCurrency(item.amount)} · {item.reason}</li>)}</ul></details>}
              <PayrollBasisSummary basis={salary.payrollBasis}/>
              {salary.depositNeedsReview&&<p className="text-sm text-amber-700">{t('salaryDeposit.recalculate')}</p>}
              {salary.status==='pending'&&<p className="text-sm text-gray-500 my-3">{pl.paymentHint}</p>}
              <div className="flex gap-2">
                {salary.status==='paid'&&<button onClick={()=>openPayslip(salary.id)} className="py-2 px-3 text-sm border rounded-lg">{pl.viewPayslip}</button>}
                {salary.status === 'unrecorded' && <button disabled={!canWrite || user?.role!=='admin'} onClick={()=>handleOpenModal(salary)} className="py-2 px-3 text-sm border rounded-lg">{l.correction}</button>}
                {salary.status === 'pending' && <button disabled={!canWrite} onClick={() => handleOpenModal(salary)} className="py-2 px-3 text-sm border rounded-lg">{l.correction}</button>}
                {salary.status === 'pending' && (
                  <button
                    onClick={() => handleMarkPaid(salary.id)}
                    disabled={(salary.month>=getCurrentMonth()&&!(salary.payrollBasis?.terminationDate&&salary.payrollBasis.terminationDate<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date()))) || !salary.payrollBasis?.confirmed || user?.role !== 'admin' || !!salary.payrollReview || salary.depositNeedsReview || salary.payrollBasis?.employmentNeedsReview}
                    className="flex-1 py-2 text-sm text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center justify-center gap-1"
                  >
                    <CheckCircle size={16} />
                    {t('staff.salary.markAsPaid')}
                  </button>
                )}

              </div>
            </div>
          ))
        )}
      </div>

      {payslip&&<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><section className="bg-white rounded-xl p-4 w-full max-w-3xl mx-4 max-h-[95vh] overflow-y-auto"><header className="flex justify-between items-center mb-3"><h2 className="font-bold">{pl.payslipTitle}</h2><button aria-label={pl.cancel} onClick={()=>setPayslip(null)}><X/></button></header><iframe title={pl.payslipTitle} sandbox="allow-same-origin" srcDoc={payslipHtml(payslip,{title:pl.payslipTitle,language:i18n.language})} className="w-full h-[65vh] border rounded-lg"/><button className="mt-3 px-4 py-2 border rounded-lg" onClick={()=>downloadPayslip(payslip,{title:pl.payslipTitle,language:i18n.language})}>{pl.downloadPayslip}</button></section></div>}
      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {l.correction}
              </h2>
              <button onClick={handleCloseModal} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {saveError && <p role="alert" className="text-red-600">{saveError}</p>}
              {/* Staff Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.staff')} *
                </label>
                <select
                  value={formData.staffId}
                  onChange={(e) => {const row=allPayroll.find(s=>s.staffId===e.target.value);if(row)handleOpenModal(row);else{setWorkingDays(null);setEditingSalary(null);setFormData({...formData,staffId:e.target.value})}}}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                >
                  <option value="">{t('staff.salary.selectStaff')}</option>
                  {allPayroll.map(salary=><option key={salary.staffId} value={salary.staffId} disabled={salary.status==='paid'}>{salary.staff?.name||salary.staffId}</option>)}
                </select>
              </div>

              {/* Month */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.month')} *
                </label>
                <LocalizedDateTimeInput
                  type="month"
                  value={formData.month}
                  onChange={(e) => {setWorkingDays(null);setFormData({ ...formData, month: e.target.value })}}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  disabled={!!editingSalary}
                />
              </div>

              {payrollBasis?.settlementVersion===1?<section className="border rounded-xl p-4 space-y-3"><h3 className="font-semibold">{pl.unpaidDays}</h3><p className="text-sm text-gray-500">{pl.calendarHint}</p>
                {['probation','regular'].map(type=>{const segment=payrollBasis.segments?.find((seg:any)=>seg.type===type);if(!segment)return null;return <label key={type} className="block text-sm">{type==='probation'?pl.probation:pl.regular}<input aria-label={`${pl.unpaidDays} · ${type==='probation'?pl.probation:pl.regular}`} type="number" min="0" max={segment.eligibleDays??segment.days} step="0.5" className="w-full p-2 border rounded-lg" value={unpaidDays[type as 'probation'|'regular']} onChange={e=>{setDaySource('estimate');setUnpaidDays(p=>({...p,[type]:e.target.value}))}}/></label>})}
              </section>:<>              <section className="border rounded-xl p-4 space-y-3"><h3 className="font-semibold">{l.editDays}</h3><p className="text-sm text-gray-500">{pl.daysHint}</p>
                {payrollBasis&&['probation','regular'].map(type=>{const segment=payrollBasis.segments?.find((seg:any)=>seg.type===type);if(!segment)return null;return <label key={type} className="block text-sm">{type==='probation'?pl.probation:pl.regular} · {pl.employmentDays}: {segment.eligibleDays??segment.days}<input aria-label={type==='probation'?l.probationDays:l.regularDays} type="number" min="0" max={segment.eligibleDays??segment.days} step="0.5" className="w-full p-2 border rounded-lg" value={workingDays?.[type as 'probation'|'regular']??segment.days} onChange={e=>{setDaySource('manual');setWorkingDays(previous=>({...previous||{probation:String(payrollBasis.segments.find((seg:any)=>seg.type==='probation')?.days||0),regular:String(payrollBasis.segments.find((seg:any)=>seg.type==='regular')?.days||0)},[type]:e.target.value}))}}/></label>})}
                <button type="button" disabled={calculating||!canWrite} className="text-blue-700 text-sm underline" onClick={importAttendance}>{pl.importAttendance}</button>
                {attendancePreview&&<div className="bg-blue-50 rounded-lg p-3 space-y-2"><p>{pl.workDays}: {attendancePreview.payrollBasis.workedDays} · {pl.base}: {formatCurrency(attendancePreview.baseSalary)}</p><p>{pl.lateMinutes}: {attendancePreview.payrollBasis.correction?.lateMinutes||0}</p><p className="text-sm">{pl.importHint}</p><div className="flex gap-4"><button type="button" onClick={applyAttendance}>{pl.applyAttendance}</button><button type="button" onClick={()=>setAttendancePreview(null)}>{pl.cancel}</button></div></div>}
              </section>
</>}
              <section className="border rounded-xl p-4 space-y-3"><label className="block text-sm">{pl.lateMinutes}<input aria-label={pl.lateMinutes} type="number" min="0" max="50000" step="1" value={lateMinutes} onChange={e=>setLateMinutes(e.target.value)} className="w-full p-2 border rounded-lg"/></label><select aria-label={pl.lateDeduction} value={lateMode} onChange={e=>setLateMode(e.target.value as 'rule'|'manual')} className="w-full p-2 border rounded-lg"><option value="rule">{pl.ruleLate}</option><option value="manual">{pl.manualLate}</option></select>
                {lateMode==='manual'&&<label className="block text-sm">{pl.manualLate} (Rp)<input type="number" min="0" value={manualLateDeduction} onChange={e=>setManualLateDeduction(e.target.value)} className="w-full p-2 border rounded-lg"/></label>}
                <LateCalculation correction={payrollBasis?.correction} language={i18n.language}/>
                <label className="block text-sm">{pl.otherAttendance} (Rp)<input type="number" min="0" value={otherAttendanceDeduction} onChange={e=>setOtherAttendanceDeduction(e.target.value)} className="w-full p-2 border rounded-lg"/></label>
                <label className="block text-sm">{pl.reason}<textarea value={correctionReason} maxLength={1000} onChange={e=>setCorrectionReason(e.target.value)} className="w-full p-2 border rounded-lg"/></label>
              </section>
              <PayrollBasisSummary basis={payrollBasis}/>
              {/* Base Salary */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.baseSalary')} (Rp) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    aria-label={pl.base}
                    value={formData.baseSalary}
                    onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                    className="flex-1 w-full p-3 border border-gray-200 rounded-xl"
                    placeholder="0"
                    min="0"
                  />
                  <button
                    type="button"
                    onClick={()=>setPreviewRevision(n=>n+1)}
                    disabled={!canWrite || calculating || depositLoading || !formData.staffId || !formData.month}
                    className="px-4 py-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1 text-sm font-medium"
                  >
                    {calculating ? <Loader2 size={16} className="animate-spin" /> : null}
                    {t('staff.salary.autoCalc')}
                  </button>
                </div>
              </div>

              {/* Overtime */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.overtime')} (Rp)
                </label>
                <input
                  type="number"
                  value={formData.overtime}
                  onChange={(e) => setFormData({ ...formData, overtime: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {/* Commission */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.commission')} (Rp)
                </label>
                <input
                  type="number"
                  value={formData.commission}
                  onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {/* Bonus */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.bonus')} (Rp)
                </label>
                <input
                  type="number"
                  value={formData.bonus}
                  onChange={(e) => setFormData({ ...formData, bonus: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {/* Deduction */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.salary.deduction')} (Rp)
                </label>
                <input
                  type="number"
                  aria-label={pl.totalDeduction}
                  value={formData.deduction}
                  onChange={(e) => setFormData({ ...formData, deduction: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-xl"
                  placeholder="0"
                  min="0"
                />
              </div>

              {depositLoading && <p role="status">{t('common.loading')}</p>}
              {depositError && <p role="alert" className="text-red-600">{depositError}</p>}
              <p className="text-sm text-gray-500">{pl.deductionHint}</p>
              <p className="text-sm text-gray-500">{pl.depositHint}</p>
              {depositPlan?.staffId === formData.staffId && depositPlan?.month === formData.month && depositPlan.items.length > 0 && <p className="text-sm text-gray-600">{t('staff.salary.depositPortion')}: {formatCurrency(depositPlan.items.reduce((sum, item) => sum + item.amountMinor, 0) / 100)}</p>}
              {/* Final Amount Preview */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{t('staff.salary.finalAmount')}:</span>
                  <span className="text-xl font-bold text-primary">
                    {formatCurrency(calculateFinalAmount())}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleCloseModal}
                  className="flex-1 py-3 border border-gray-200 rounded-xl"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canWrite || saving || calculating || depositLoading || !!depositError || daysError}
                  className="flex-1 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    pl.confirm
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}