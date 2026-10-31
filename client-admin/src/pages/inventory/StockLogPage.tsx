import {stockLogDateRange,stockLogQueryCopy,physicalStockOutQuantity,materialComparison} from '../../utils/stockLogQuery'
import type {UsageResult} from '../../../../shared/inventoryUsageReport'
import {StockPhotoEvidence} from '../../components/StockPhotoEvidence'
import { ManualStockCorrection } from '../../components/ManualStockCorrection'
import { useAuthStore } from '../../stores/auth'
import { isSalesStockOut, stockLogCost } from '../../utils/inventorySalesCosts'
import { ReferenceDetails } from '../../components/ReferenceDetails'
import { formatNumber } from '../../utils/numberDisplay'
import { notifyAdmin } from '../../components/AdminFeedback'
import { AdminDialog } from '../../components/AdminDialog'
import { LocalizedDateTimeInput } from '../../components/LocalizedDateTimeInput'
import { ActorName, actorText } from '../../components/InventoryActor';
import { inventoryInputUnits, defaultInventoryInputUnit, inventoryUnitFactor } from "../../utils/inventoryInputUnits";
import { Link } from 'react-router-dom'
import { countDetailUrl, inventoryLogDisplay, isProcessingInbound, isInventoryAdjustment } from '../../utils/inventoryCountFlow'
import {useStoreDateSettings} from '../../hooks/useStoreDateSettings'
import {QUERY_PERIODS,QueryPeriod,queryInstantRange} from '../../utils/queryPeriods'
import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { inventoryApi, supplierApi, orderApi } from '../../services/api'
import { formatCurrency, formatDateTime, formatItemName } from '../../utils/helpers'
import * as XLSX from 'xlsx'
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  RefreshCw,

  AlertTriangle,
  Loader2
} from 'lucide-react'

type LogTab = 'withdrawal' | 'other' | 'all' | 'in' | 'sold' | 'waste' | 'process'

export function StockLogPage() {
  const dateSettings=useStoreDateSettings()
  const { t, i18n } = useTranslation()
  const copy=stockLogQueryCopy(i18n.language)
  const queryClient = useQueryClient()

  const user=useAuthStore(state=>state.user)
  const [comparisonId,setComparisonId]=useState('')
  const isCorrectionAdmin = useAuthStore(state => state.user?.role === 'admin')
  const [correctionLog, setCorrectionLog] = useState<any>(null)

  // State
  const [activeTab, setActiveTab] = useState<LogTab>('all')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  useEffect(()=>setComparisonId(''),[search,selectedCategory])
  const [datePreset, setDatePreset] = useState<'all' | QueryPeriod | 'custom'>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [appliedDates,setAppliedDates]=useState({start:'',end:''})
  const [dateInputInvalid,setDateInputInvalid]=useState(false)
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(50)
  const validDraft=stockLogDateRange(customStartDate,customEndDate,dateSettings.timezone)
  const dirtyDates=customStartDate!==appliedDates.start||customEndDate!==appliedDates.end
  const clearFilters=()=>{setActiveTab('all');setSearch('');setSelectedCategory('');setDatePreset('all')}

  // Modals
  const [showStockInModal, setShowStockInModal] = useState(false)
  const [showWasteModal, setShowWasteModal] = useState(false)

  // Forms
  const [stockInForm, setStockInForm] = useState({
    inventoryId: '', inputUnit: '',
    quantity: '',
    unitCost: '',
    supplierId: '',
    note: ''
  })

  const [wasteForm, setWasteForm] = useState({
    inventoryId: '', inputUnit: '',
    quantity: '',
    reason: 'loss',
    wasteType: 'spill',
    note: ''
  })

  // Date range calculation
  const dateRange = useMemo(() => {
    if (QUERY_PERIODS.includes(datePreset as QueryPeriod)) {
      return queryInstantRange(datePreset as QueryPeriod,dateSettings.timezone)
    } else if (datePreset === 'custom') {
      return stockLogDateRange(appliedDates.start,appliedDates.end,dateSettings.timezone) || {startDate:undefined,endDate:undefined}
    }
    return { startDate: undefined, endDate: undefined }
  }, [datePreset, appliedDates,dateSettings.timezone])

  // Fetch inventory items for dropdowns and display
  const { data: inventoryData } = useQuery({
    queryKey: ['inventory-all-items'],
    queryFn: () => inventoryApi.list({ pageSize: 500 }),
    staleTime: 60000
  })
  const inventoryItems: any[] = (inventoryData?.data?.data?.list || []).filter((i:any)=>i.type!=='semi_finished'||!i.processRecipeId)

  // Fetch suppliers for dropdown
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-dropdown'],
    queryFn: () => supplierApi.list(),
    staleTime: 60000
  })
  const suppliers: any[] = suppliersData?.data?.data?.list || suppliersData?.data?.list || []

  // Fetch recent orders to map orderId to readable orderNumber
  const { data: ordersData } = useQuery({
    queryKey: ['orders-lookup-for-logs'],
    queryFn: () => orderApi.list({ pageSize: 200 }),
    staleTime: 60000
  })
  const orders: any[] = ordersData?.data?.data?.list || ordersData?.data?.list || []
  const orderMap = useMemo(() => {
    const map = new Map<string, { orderNumber: string; pickupNumber?: string }>()
    orders.forEach((o: any) => {
      if (o.id) {
        map.set(o.id, {
          orderNumber: o.orderNumber || o.id,
          pickupNumber: o.pickupNumber
        })
      }
    })
    return map
  }, [orders])

  // Fetch logs
  const { data: logsData, isLoading, refetch, isFetching, isError } = useQuery({
    queryKey: ['inventory-logs-comprehensive', dateRange, search.trim(), selectedCategory],
    enabled: datePreset!=='custom'||!!stockLogDateRange(appliedDates.start,appliedDates.end,dateSettings.timezone),
    queryFn: async () => {
      const list:any[]=[]
      for(let offset=0;;offset+=1000){
        const response=await inventoryApi.logs({...dateRange,search:search.trim()||undefined,category:selectedCategory||undefined,limit:1000,offset})
        const data=response.data.data
        list.push(...(data?.list||[]))
        if(!data?.hasMore)break
      }
      return list
    },
    refetchInterval: 30000
  })

  const rawLogs: any[] = (logsData || []).map((log:any)=>({...inventoryLogDisplay(log),physicalQuantity:physicalStockOutQuantity(log)}))

  const statsUnavailable=isLoading||(isError&&!logsData)

  const comparisonItems=useMemo(()=>{
    if(!search.trim())return []
    const items=new Map<string,any>()
    for(const item of [...inventoryItems,...rawLogs.map(log=>({...log.inventory,id:log.inventoryId}))]){
      if(item?.id&&JSON.stringify(item.name||'').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())&&(!selectedCategory||item.category===selectedCategory))items.set(item.id,item)
    }
    return [...items.values()]
  },[inventoryItems,rawLogs,search,selectedCategory])
  const comparisonItem=comparisonItems.find(item=>item.id===comparisonId)||(comparisonItems.length===1?comparisonItems[0]:null)

  // Client-side filtering for rapid response
  const filteredLogs = useMemo(() => {
    return rawLogs.filter((log: any) => {
      if(comparisonItem&&log.inventoryId!==comparisonItem.id)return false
      // 1. Tab filter
      if (activeTab === 'withdrawal' || activeTab === 'other') {
        if(log.type!=='stock_out'||(log.reason!==activeTab && !(activeTab==='other' && log.reason==='receipt_cost_adjustment')))return false
      } else if (activeTab === 'in') {
        if (log.type !== 'stock_in') return false
      } else if (activeTab === 'sold') {
        if (!isSalesStockOut(log)) return false
      } else if (activeTab === 'waste') {
        if (log.type !== 'stock_out' || (log.reason !== 'loss' && log.reason !== 'expired')) return false
      } else if (activeTab === 'process') {
        const isProcessOut = log.type === 'stock_out' && log.reason === 'process'
        const isProcessIn = isProcessingInbound(log)
        if (!isProcessOut && !isProcessIn) return false

      }

      return true
    })
  }, [rawLogs, activeTab, selectedCategory, search, orderMap,comparisonItem?.id])

  useEffect(()=>setPage(1),[activeTab,search,selectedCategory,dateRange.startDate,dateRange.endDate,comparisonItem?.id])
  const pageCount=Math.max(1,Math.ceil(filteredLogs.length/pageSize)),currentPage=Math.min(page,pageCount),pageStart=(currentPage-1)*pageSize
  const pageLogs=filteredLogs.slice(pageStart,pageStart+pageSize)

  // Top KPI Metrics calculation based on loaded logs
  const metrics = useMemo(() => {
    let totalInboundCost = 0
    let totalSalesCost = 0
    let totalWasteCost = 0
    let costAdjustments = 0

    filteredLogs.forEach((log: any) => {
      if (log.type === 'stock_in') {
        totalInboundCost += stockLogCost(log)
      } else if (log.type === 'stock_out') {
        const itemCost = stockLogCost(log)
        if (log.reason === 'receipt_cost_adjustment') costAdjustments += itemCost
        if (isSalesStockOut(log)) {
          totalSalesCost += itemCost
        } else if (log.reason === 'loss' || log.reason === 'expired') {
          totalWasteCost += itemCost
        }
      }
    })

    return {
      totalInboundCost,
      totalSalesCost,
      totalWasteCost,
      costAdjustments,
      totalCount: filteredLogs.length
    }
  }, [filteredLogs])

  const materialTotals=useMemo(()=>Object.values(filteredLogs.reduce((result:Record<string,{id:string,name:string,quantity:number,unit:string}>,log:any)=>{
    if(log.physicalQuantity!==null){const key=log.inventoryId;result[key]??={id:key,name:formatItemName(log.inventory?.name||'-',i18n.language),quantity:0,unit:log.inventory?.unit||''};result[key].quantity+=log.physicalQuantity}
    return result
  },{})).sort((a,b)=>a.name.localeCompare(b.name)),[filteredLogs,i18n.language])
  const theoryParams={startDate:dateRange.startDate||'2000-01-01',endDate:dateRange.endDate||'2100-12-31'}
  const theoryQuery=useQuery({queryKey:['ledger-material-theory',user?.id,user?.storeId,theoryParams],enabled:!!comparisonItem&&!statsUnavailable&&(datePreset!=='custom'||!!dateRange.startDate),queryFn:async():Promise<UsageResult>=>(await inventoryApi.employeeConsumption(theoryParams)).data.data,refetchInterval:30000})
  const theoryRow=theoryQuery.data?.list.find(row=>row.inventoryId===comparisonItem?.id)
  const comparison=materialComparison(filteredLogs,comparisonItem,theoryRow,theoryQuery.data?.legacyOnly)
  const quantity=(value:number|null)=>value===null?'—':value.toLocaleString(i18n.language,{maximumFractionDigits:6})+' '+(comparisonItem?.unit||'')
  const theoryUnavailable=theoryQuery.isLoading||theoryQuery.isError||!theoryRow
  const financialMetrics=<div className="inventory-ledger-metrics">{[
    ['inventory.totalInboundCost',metrics.totalInboundCost],['inventory.totalSalesCost',metrics.totalSalesCost],['inventory.totalWasteCost',metrics.totalWasteCost]
  ].map(([key,value])=><div className="card p-4" key={key}><p className="text-sm text-gray-500 font-medium">{t(String(key))}</p><p className="text-2xl font-bold text-gray-900 mt-1">{statsUnavailable?'—':formatCurrency(Number(value))}</p></div>)}{!comparisonItem&&<div className="card p-4"><p className="text-sm text-gray-500 font-medium">{t('inventory.totalMovements')}</p><p className="text-2xl font-bold text-gray-900 mt-1">{statsUnavailable?'—':metrics.totalCount}</p></div>}</div>
  const hasFilters=activeTab!=='all'||datePreset!=='all'||!!search||!!selectedCategory

  // Mutations
  const stockInMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.stockIn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-logs-comprehensive'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-all-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setShowStockInModal(false)
      setStockInForm({ inventoryId: '', inputUnit: '', quantity: '', unitCost: '', supplierId: '', note: '' })
    }
  })

  const wasteMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.stockOut(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-logs-comprehensive'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-all-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setShowWasteModal(false)
      setWasteForm({ inventoryId: '', inputUnit: '', quantity: '', reason: 'loss', wasteType: 'spill', note: '' })
    }
  })

  // Selected item helpers for modals
  const selectedStockInItem = useMemo(() => {
    return inventoryItems.find((i: any) => i.id === stockInForm.inventoryId)
  }, [inventoryItems, stockInForm.inventoryId])

  const selectedWasteItem = useMemo(() => {
    return inventoryItems.find((i: any) => i.id === wasteForm.inventoryId)
  }, [inventoryItems, wasteForm.inventoryId])

  // Handle stock in item change
  const handleStockInItemSelect = (invId: string) => {
    const item = inventoryItems.find((i: any) => i.id === invId)
    setStockInForm(prev => ({
      ...prev,
      inventoryId: invId,
      quantity: '',
      inputUnit: item ? defaultInventoryInputUnit(item) : '',
      unitCost: item ? String((item.avgCost || 0) * inventoryUnitFactor(item, defaultInventoryInputUnit(item))) : ''
    }))
  }

  // Handle stock out / waste submit
  const handleWasteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!wasteForm.inventoryId || !wasteForm.quantity) return

    const qty = parseFloat(wasteForm.quantity)
    if (isNaN(qty) || qty <= 0) return

    const wasteLabelMap: Record<string, string> = {
      manual: t('inventory.reasonAdjust'),
      spill: t('inventory.lossSpill'),
      spoiled: t('inventory.lossSpoiled'),
      expired: t('inventory.lossExpired'),
      mistake: t('inventory.lossMistake'),
      tasting: t('inventory.lossTasting'),
      other: t('inventory.lossOther')
    }

    if(wasteForm.wasteType==='other'&&!wasteForm.note.trim()){notifyAdmin(t('inventoryFlow.otherReason'));return}
    const fullNote = `[${wasteLabelMap[wasteForm.wasteType] || ''}] ${wasteForm.note || ''}`.trim()

    wasteMutation.mutate({
      inventoryId: wasteForm.inventoryId,
      quantity: qty,
      inputUnit: wasteForm.inputUnit,
      reason: wasteForm.wasteType === 'expired' ? 'expired' : wasteForm.wasteType === 'other' ? 'other' : 'loss',
      note: fullNote
    })
  }

  // Handle stock in submit
  const handleStockInSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!stockInForm.inventoryId || !stockInForm.quantity) return

    const qty = parseFloat(stockInForm.quantity)
    const cost = stockInForm.unitCost ? parseFloat(stockInForm.unitCost) : undefined
    if (isNaN(qty) || qty <= 0) return

    stockInMutation.mutate({
      inventoryId: stockInForm.inventoryId,
      quantity: qty,
      inputUnit: stockInForm.inputUnit,
      unitCost: cost,
      supplierId: stockInForm.supplierId || undefined,
      note: stockInForm.note ? `[${t('inventory.reasonPurchase')}] ${stockInForm.note}` : t('inventory.reasonPurchase')
    })
  }

  // Helper to format order number cleanly
  const renderDocNumber = (log: any) => {
    if (log.countId) return <Link className="text-primary underline" to={countDetailUrl(log.countId, log.countItemId)}>{t('inventoryCountWorkspace.document')} {log.countId.slice(-8).toUpperCase()}</Link>
    if (log.orderId) {
      const orderInfo = orderMap.get(log.orderId)
      if (orderInfo) {
        return (
          <div className="flex items-center gap-1.5 font-mono text-sm">
            {orderInfo.pickupNumber && (
              <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-primary/10 text-primary border border-primary/20">
                #{orderInfo.pickupNumber}
              </span>
            )}
            <ReferenceDetails value={orderInfo.orderNumber}/>
          </div>
        )
      }
      return <ReferenceDetails value={log.orderId}/>
    }
    if (log.batchId) {
      return <ReferenceDetails value={log.batchId}/>
    }
    return <span className="text-gray-400">-</span>
  }

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredLogs.length === 0) return

    const rows = filteredLogs.map((log: any) => {
      const isStockIn = log.type === 'stock_in'
      const avgCost = Number(log.unitCost ?? log.inventory?.avgCost ?? 0)
      const costValue = stockLogCost(log)

      let reasonText = ''
      if (isInventoryAdjustment(log)) reasonText = t('inventory.reasonAdjust')
      else if (isStockIn) {
        if (isProcessingInbound(log)) {
          reasonText = t('inventory.reasonProcessIn')
        } else if (log.note?.includes('期初') || log.note?.includes('Initial') || log.note?.includes('Awal')) {
          reasonText = t('inventory.reasonInitial')
        } else {
          reasonText = t('inventory.reasonPurchase')
        }
      } else {
        if (log.reason === 'sale_estimate' || log.reason === 'sale_estimate_reversal') reasonText = t(log.reason === 'sale_estimate' ? 'inventoryUnified.sales' : 'inventoryUnified.reversal')
        else if (log.reason === 'receipt_cost_adjustment') reasonText = t('manualStockCorrection.consumptionDifference')
        else if (log.reason === 'sold') reasonText = t('inventory.reasonSold')
        else if (log.reason === 'process') reasonText = t('inventory.reasonProcess')
        else if (log.reason === 'expired') reasonText = t('inventory.reasonExpired')
        else if (log.reason === 'loss') reasonText = t('inventory.reasonLoss')
        else if (log.reason === 'count_adjustment' || log.reason === 'adjust') reasonText = t('inventory.reasonAdjust')
        else reasonText = ['withdrawal','other'].includes(log.reason)?t('inventoryFlow.'+log.reason):log.reason||'-'
      }

      const orderInfo = log.orderId ? orderMap.get(log.orderId) : null
      const docNumber = log.countId || (orderInfo
        ? (orderInfo.pickupNumber ? `[#${orderInfo.pickupNumber}] ${orderInfo.orderNumber}` : orderInfo.orderNumber)
        : (log.orderId || log.batchId || '-'))

      return {
        [t('inventory.date')]: formatDateTime(log.createdAt),
        [t('inventory.docNumber')]: docNumber,
        [t('inventory.itemName')]: formatItemName(log.inventory?.name || '-', i18n.language),
        [t('inventory.category')]: getCategoryText(log.inventory?.category),
        [t('inventory.type')]: isInventoryAdjustment(log) ? t('inventory.reasonAdjust') : isStockIn ? t('inventory.stockIn') : t('inventory.stockOut'),
        [t('inventory.wasteReason')]: reasonText,
        [t('inventory.changeAmount')]: log.stockDelta === null ? '-' : `${log.stockDelta > 0 ? '+' : ''}${log.stockDelta}`,
        [t('inventory.unit')]: log.inventory?.unit || '-',
        [t('inventory.unitCost')]: log.unitCost || avgCost,
        [t('inventory.totalCostValue')]: costValue,
        [t('inventoryActors.operator')]: actorText(log.operator, log.staffId, t),
        [t('purchases.supplier')]: log.supplier?.name || '-',
        [t('inventory.notes')]: log.note || '-',
        [t('manualStockCorrection.original')]: log.manualCorrection?.rootId || '-',
        [t('manualStockCorrection.reason')]: log.manualCorrection?.reason || '-',
        [t('manualStockCorrection.action')]: log.manualCorrection ? t(log.manualCorrection.role === 'reversal' ? 'manualStockCorrection.reversal' : log.manualCorrection.role === 'consumption_cost' ? 'manualStockCorrection.consumptionDifference' : 'manualStockCorrection.replacement') : log.correctionStatus ? t(log.correctionStatus === 'cancelled' ? 'manualStockCorrection.cancelled' : 'manualStockCorrection.corrected') : '-'
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'StockLedger')
    const fileName = `Stock_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  // Localized Category Text
  const getCategoryText = (category: string) => {
    switch (category) {
      case 'raw_material':
      case 'Raw Material':
        return t('inventory.rawMaterial')
      case 'packaging':
      case 'Packaging':
        return t('inventory.packaging')
      case 'semi_finished':
      case 'Semi-Finished':
        return t('inventory.semiFinished')
      default:
        return category || '-'
    }
  }

  // Standard category badge following design specs
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'raw_material':
      case 'Raw Material':
        return <span className="badge badge-info">{t('inventory.rawMaterial')}</span>
      case 'packaging':
      case 'Packaging':
        return <span className="badge badge-warning">{t('inventory.packaging')}</span>
      case 'semi_finished':
      case 'Semi-Finished':
        return <span className="badge badge-success">{t('inventory.semiFinished')}</span>
      default:
        return <span className="badge">{category || '-'}</span>
    }
  }

  // Standard reason badge following design specs
  const getReasonBadge = (log: any) => {
    if (log.reason === 'receipt_cost_adjustment') return <span className="badge badge-warning">{t('manualStockCorrection.consumptionDifference')}</span>
    if (isInventoryAdjustment(log)) return <span className="badge">{t('inventory.reasonAdjust')}</span>
    if (log.type === 'stock_in') {
      if (isProcessingInbound(log)) {
        return <span className="badge badge-success">{t('inventory.reasonProcessIn')}</span>
      }
      if (log.note?.includes('期初') || log.note?.includes('Initial') || log.note?.includes('Awal')) {
        return <span className="badge badge-info">{t('inventory.reasonInitial')}</span>
      }
      return <span className="badge badge-success">{t('inventory.reasonPurchase')}</span>
    }

    if (['withdrawal','other'].includes(log.reason)) return <span className="badge badge-info">{t('inventoryFlow.'+log.reason)}</span>
    if (log.reason==='sale_estimate'||log.reason==='sale_estimate_reversal') return <span className="badge badge-info">{t(log.reason==='sale_estimate'?'inventoryUnified.sales':'inventoryUnified.reversal')}</span>
    if (log.reason === 'sold') {
      return <span className="badge badge-info">{t('inventory.reasonSold')}</span>
    }
    if (log.reason === 'process') {
      return <span className="badge badge-warning">{t('inventory.reasonProcess')}</span>
    }
    if (log.reason === 'loss') {
      return <span className="badge badge-error">{t('inventory.reasonLoss')}</span>
    }
    if (log.reason === 'expired') {
      return <span className="badge badge-error">{t('inventory.reasonExpired')}</span>
    }
    if (log.reason === 'count_adjustment' || log.reason === 'adjust') {
      return <span className="badge">{t('inventory.reasonAdjust')}</span>
    }
    return <span className="badge">{log.reason || '-'}</span>
  }

  return (
    <div className="inventory-ledger">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('inventory.stockLog')}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {void refetch();if(comparisonItem)void theoryQuery.refetch()}}
            disabled={isFetching}
            className="btn btn-outline btn-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
            <span>{t('common.refresh')}</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={filteredLogs.length === 0}
            className="btn btn-outline btn-sm flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{t('inventory.exportExcel')}</span>
          </button>

          <button
            onClick={() => setShowWasteModal(true)}
            className="btn btn-secondary btn-sm flex items-center gap-1.5 text-error"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>{t('inventory.quickStockOut')}</span>
          </button>

          <button
            onClick={() => setShowStockInModal(true)}
            className="btn btn-primary btn-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{t('inventory.quickStockIn')}</span>
          </button>
        </div>
      </div>

      {comparisonItem&&<><div className="inventory-ledger-material-context"><strong>{formatItemName(comparisonItem.name,i18n.language)}</strong><span>{copy.comparisonScope}</span></div>
      <div className="inventory-ledger-metrics inventory-ledger-material-metrics" aria-label={copy.comparison}>
        <div className="card"><p>{copy.actualTotal}</p><strong>{statsUnavailable?'—':quantity(comparison.actual)}</strong><small>{copy.filteredActual}</small></div>
        <div className="card"><p>{copy.theoryTotal}</p><strong>{theoryUnavailable?'—':quantity(comparison.theory)}</strong><small>{comparison.partial?copy.verifiedPart:copy.orderRecipe}</small></div>
        <div className="card"><p>{copy.difference}</p><strong>{theoryUnavailable?'—':quantity(comparison.difference)}</strong><small>{copy.differenceFormula}</small></div>
        <div className="card"><p>{t('inventory.totalMovements')}</p><strong>{statsUnavailable?'—':metrics.totalCount}</strong><small>{copy.allMatches}</small></div>
      </div>
      {theoryQuery.isError?<p role="alert" className="text-sm text-amber-800">{copy.theoryFailed} <button className="underline" onClick={()=>void theoryQuery.refetch()}>{copy.retry}</button></p>:!theoryQuery.isLoading&&(comparison.partial||!theoryRow)&&<p className="text-sm text-amber-800">{copy.incompleteTheory} <Link className="underline" to="/inventory/consumption">{copy.theoryDetails}</Link></p>}
      </>}
      {comparisonItem?<details className="inventory-ledger-financial"><summary>{copy.financial}</summary>{financialMetrics}</details>:financialMetrics}

      <details className="inventory-ledger-correction">
        <summary><span>{t('manualStockCorrection.consumptionDifference')}: <strong>{statsUnavailable?'—':formatCurrency(metrics.costAdjustments)}</strong></span><span className="text-gray-500">{copy.costInfo}</span><ChevronDown size={14}/></summary>
        <p>{t('manualStockCorrection.postingHint')}</p>
      </details>

      {comparisonItems.length>1&&<label className="inventory-ledger-material-choice">{copy.chooseMaterial}<select className="input" value={comparisonId} onChange={e=>setComparisonId(e.target.value)}><option value="">{copy.chooseMaterial}</option>{comparisonItems.map(item=><option key={item.id} value={item.id}>{formatItemName(item.name,i18n.language)}</option>)}</select></label>}
      <section className="inventory-ledger-panel" aria-label={copy.ledger}>
        <div className="inventory-ledger-types" role="group" aria-label={copy.type}>
          {[
            {key:'all',label:t('inventory.allLogs')},{key:'in',label:t('inventory.inboundLogs')},
            {key:'withdrawal',label:t('inventoryFlow.withdrawal')},{key:'other',label:t('inventoryFlow.other')},
            {key:'sold',label:t('inventory.salesLogs')},{key:'waste',label:t('inventory.wasteLogs')},{key:'process',label:t('inventory.processLogs')}
          ].map(tab=><button className="inventory-ledger-view" key={tab.key} type="button" aria-pressed={activeTab===tab.key} onClick={()=>setActiveTab(tab.key as LogTab)}>{tab.label}</button>)}
        </div>
        <div className="inventory-ledger-toolbar">
          <label className="inventory-ledger-search"><span className="sr-only">{t('inventory.searchPlaceholder')}</span><Search size={16}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('inventory.searchPlaceholder')} className="input pl-10"/></label>
          <select aria-label={t('inventory.category')} value={selectedCategory} onChange={e=>setSelectedCategory(e.target.value)} className="input inventory-ledger-category">
            <option value="">{t('inventory.allCategories')}</option><option value="raw_material">{t('inventory.rawMaterial')}</option><option value="packaging">{t('inventory.packaging')}</option><option value="semi_finished">{t('inventory.semiFinished')}</option>
          </select>
          <div className="inventory-ledger-periods" role="group" aria-label={copy.period}>
            {[...QUERY_PERIODS.map(key=>({key,label:t('queryPeriods.'+key)})),{key:'all',label:t('common.all')},{key:'custom',label:t('inventory.customRange')}].map(preset=><button className="inventory-ledger-period" key={preset.key} type="button" aria-pressed={datePreset===preset.key} onClick={()=>{if(preset.key!==datePreset)setDateInputInvalid(false);if(preset.key==='custom'&&!customStartDate){const date=new Intl.DateTimeFormat('en-CA',{timeZone:dateSettings.timezone}).format(new Date());setCustomStartDate(date);setCustomEndDate(date);setAppliedDates({start:date,end:date})}setDatePreset(preset.key as any)}}>{preset.label}</button>)}
          </div>
          {datePreset==='custom'&&<form className="inventory-ledger-date-form" onChange={e=>setDateInputInvalid(!e.currentTarget.checkValidity())} onInvalidCapture={()=>setDateInputInvalid(true)} onSubmit={e=>{e.preventDefault();if(validDraft&&e.currentTarget.checkValidity()){setDateInputInvalid(false);setAppliedDates({start:customStartDate,end:customEndDate})}}}>
            <LocalizedDateTimeInput type="date" aria-label={copy.start} min="2000-01-01" max="2100-12-31" value={customStartDate} onChange={e=>{setCustomStartDate(e.target.value);setDateInputInvalid(!(e.target.form?.checkValidity()??true))}} className="input"/>
            <span className="text-gray-400 text-sm">{t('inventory.to')}</span>
            <LocalizedDateTimeInput type="date" aria-label={copy.end} min="2000-01-01" max="2100-12-31" value={customEndDate} onChange={e=>{setCustomEndDate(e.target.value);setDateInputInvalid(!(e.target.form?.checkValidity()??true))}} className="input"/>
            <button type="submit" className="btn btn-primary" disabled={!validDraft||dateInputInvalid}>{copy.apply}</button>
          </form>}
        </div>
        <div className="inventory-ledger-context">
          <p title={copy.loaded}>{copy.range}: {dateRange.startDate?`${datePreset==='custom'?appliedDates.start:formatDateTime(dateRange.startDate)} — ${datePreset==='custom'?appliedDates.end:formatDateTime(dateRange.endDate!)} · ${dateSettings.timezone}`:copy.all}</p>
          {hasFilters&&<button className="inventory-ledger-clear" type="button" onClick={clearFilters}>{copy.clear}</button>}
          {datePreset==='custom'&&(!validDraft||dateInputInvalid)&&<p role="alert" className="text-red-700">{copy.invalid}</p>}
          {datePreset==='custom'&&dirtyDates&&<p role="status" className="text-amber-700">{copy.draft}</p>}
          {isError&&<p role="alert" className="text-red-700">{copy.failed} <button className="underline" onClick={()=>refetch()}>{copy.retry}</button></p>}
        </div>
        {materialTotals.length===1&&<section className="inventory-ledger-outbound inventory-ledger-single" aria-label={copy.quantities}><span>{copy.outbound}</span><span>{materialTotals[0].name}: <strong>{materialTotals[0].quantity.toLocaleString(undefined,{maximumFractionDigits:6})} {materialTotals[0].unit}</strong></span></section>}
        {materialTotals.length>1&&<details className="inventory-ledger-outbound" aria-label={copy.quantities}>
          <summary><span>{copy.outbound}</span><strong>{copy.materials(materialTotals.length)}</strong><span className="inventory-ledger-summary-show">{copy.summary}</span><span className="inventory-ledger-summary-hide">{copy.hideSummary}</span><ChevronDown size={14}/></summary>
          <dl className="inventory-ledger-material-totals">{materialTotals.map(row=><div key={row.id}><dt>{row.name}</dt><dd>{row.quantity.toLocaleString(undefined,{maximumFractionDigits:6})} {row.unit}</dd></div>)}</dl>
        </details>}
        <div className="inventory-ledger-results-header"><h2>{copy.ledger}</h2><span className="inventory-ledger-scroll-hint">{copy.scroll}</span><span aria-live="polite">{isLoading?t('common.loading'):statsUnavailable?'—':copy.pageRange(filteredLogs.length?pageStart+1:0,Math.min(pageStart+pageSize,filteredLogs.length),filteredLogs.length)}</span></div>
      {/* Table Card */}
      <div className="inventory-ledger-table-wrap">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {isError ? copy.failed : copy.empty}
            <button className="btn btn-secondary block mx-auto mt-3" onClick={clearFilters}>{copy.clear}</button>
          </div>
        ) : (
          <div className="overflow-x-auto" role="region" aria-label={copy.tableRegion} tabIndex={0}>
            <table className="w-full inventory-ledger-table">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium whitespace-nowrap pr-4">{t('inventory.date')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap px-4">{t('inventory.docNumber')}</th>
                  <th className="pb-3 font-medium min-w-[240px] px-4">{t('inventory.itemName')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap px-4">{t('inventory.category')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap px-4">{t('inventory.type')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap text-right px-4">{t('inventory.changeAmount')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap text-right px-4">{t('inventory.unitCost')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap text-right px-4">{t('inventory.totalCostValue')}</th>
                  <th className="pb-3 font-medium whitespace-nowrap px-4">{t('inventory.operatorOrSupplier')}</th>
                  <th className="pb-3 font-medium min-w-[160px] pl-4">{t('inventory.notes')}</th>
                  {isCorrectionAdmin && <th className="pb-3 font-medium whitespace-nowrap px-4">{t('manualStockCorrection.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {pageLogs.map((log: any) => {
                  const avgCost = Number(log.unitCost ?? log.inventory?.avgCost ?? 0)
                  const unitCost = log.unitCost !== undefined && log.unitCost !== null && log.unitCost >= 0
                    ? Number(log.unitCost)
                    : avgCost
                  const costValue = stockLogCost(log)

                  return (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="py-3 text-sm text-gray-500 whitespace-nowrap pr-4">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="py-3 text-sm px-4 whitespace-nowrap">
                        {renderDocNumber(log)}
                      </td>
                      <td className="py-3 text-sm font-medium text-gray-900 px-4">
                        {formatItemName(log.inventory?.name || '-', i18n.language)}
                      </td>
                      <td className="py-3 text-sm px-4 whitespace-nowrap">
                        {getCategoryBadge(log.inventory?.category)}
                      </td>
                      <td className="py-3 text-sm px-4 whitespace-nowrap">
                        {getReasonBadge(log)}
                      </td>
                      <td className="py-3 text-sm text-right px-4 whitespace-nowrap font-medium">
                        <span className={log.stockDelta >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {log.stockDelta !== null && log.stockDelta > 0 ? '+' : ''}{log.stockDelta?.toLocaleString(undefined, { maximumFractionDigits: 6 }) ?? '—'} {log.inventory?.unit || ''}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-right text-gray-600 px-4 whitespace-nowrap">
                        {unitCost ? `${formatCurrency(unitCost)}/${log.inventory?.unit || ''}` : '-'}
                      </td>
                      <td className="py-3 text-sm text-right font-medium px-4 whitespace-nowrap">
                        {costValue ? formatCurrency(costValue) : '-'}
                      </td>
                      <td className="py-3 text-sm text-gray-600 px-4 whitespace-nowrap">
                        <ActorName actor={log.operator} id={log.staffId}/>{log.supplier?.name && <div className="text-xs text-gray-500 mt-1">{t('purchases.supplier')}: {log.supplier.name}</div>}
                      </td>
                      <td className="py-3 text-sm text-gray-500 pl-4 max-w-xs truncate" title={log.note || ''}>
                        {log.manualCorrection && <span className="block text-xs text-amber-700" title={log.manualCorrection.reason}>{t(log.manualCorrection.role === 'reversal' ? 'manualStockCorrection.reversal' : log.manualCorrection.role === 'consumption_cost' ? 'manualStockCorrection.consumptionDifference' : 'manualStockCorrection.replacement')}</span>}
                        {log.note || '-'}
                        {log.sourceEvidence?.photos?.length>0&&<StockPhotoEvidence logId={log.id} evidence={log.sourceEvidence} language={i18n.language}/>}
                      </td>
                      {isCorrectionAdmin && <td className="py-3 px-4 text-sm whitespace-nowrap">{(log.manualCorrectionEligible || log.manualCorrection) ? <><button type="button" className="btn-secondary min-h-[44px] px-4 border-primary-200 text-primary-700 hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500" onClick={() => setCorrectionLog(log.manualCorrection ? {...log,type:log.manualCorrection.type,id:log.manualCorrection.rootId} : log)}>{t(log.correctionStatus || log.manualCorrection ? 'manualStockCorrection.history' : 'manualStockCorrection.title')}</button>{log.correctionStatus && <span className="block text-xs text-gray-500">{t(log.correctionStatus === 'cancelled' ? 'manualStockCorrection.cancelled' : 'manualStockCorrection.corrected')}</span>}</> : '—'}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filteredLogs.length>0&&<nav className="inventory-ledger-pagination" aria-label={copy.pagination}>
        <span>{copy.pageRange(pageStart+1,Math.min(pageStart+pageSize,filteredLogs.length),filteredLogs.length)}</span>
        <div><label>{copy.perPage}<select className="input" aria-label={copy.perPage} value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}>{[25,50,100].map(size=><option key={size} value={size}>{size}</option>)}</select></label>
        <button className="btn-secondary" type="button" aria-label={copy.previous} disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={16}/></button>
        <button className="btn-secondary" type="button" aria-label={copy.next} disabled={currentPage>=pageCount} onClick={()=>setPage(currentPage+1)}><ChevronRight size={16}/></button></div>
      </nav>}
      </section>

      {correctionLog && <ManualStockCorrection log={correctionLog} items={inventoryItems} onClose={() => setCorrectionLog(null)} onSaved={() => { queryClient.invalidateQueries({queryKey:['inventory-logs-comprehensive']}); queryClient.invalidateQueries({queryKey:['inventory']}); queryClient.invalidateQueries({queryKey:['inventory-all-items']}); queryClient.invalidateQueries({queryKey:['products']}); queryClient.invalidateQueries({queryKey:['bom-products']}); }} />}
      {/* Modal: Quick Stock In */}
      {showStockInModal && (
        <AdminDialog title={t('inventory.quickStockIn')} onClose={() => setShowStockInModal(false)} className="max-w-md" busy={Boolean(stockInMutation.isPending)} trackChanges chrome>


            <form onSubmit={handleStockInSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.selectItem')} *
                </label>
                <select
                  required
                  value={stockInForm.inventoryId}
                  onChange={(e) => handleStockInItemSelect(e.target.value)}
                  className="input w-full"
                >
                  <option value="">-- {t('inventory.selectItem')} --</option>
                  {inventoryItems.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      [{getCategoryText(item.category)}] {formatItemName(item, i18n.language)} ({t('inventory.currentStock')}: {formatNumber(item.currentStock)} {item.unit})
                    </option>
                  ))}
                </select>
              </div>

              {selectedStockInItem && <label className="block">{t('inventoryUnits.input')}
                <select className="input w-full" value={stockInForm.inputUnit} onChange={e => setStockInForm({ ...stockInForm, inputUnit: e.target.value, unitCost: '' })}>
                  {inventoryInputUnits(selectedStockInItem).map(unit => <option key={unit}>{unit}</option>)}
                </select>
              </label>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('inventory.inboundQty')} *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.001"
                      value={stockInForm.quantity}
                      onChange={(e) => setStockInForm({ ...stockInForm, quantity: e.target.value })}
                      className="input w-full pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      {stockInForm.inputUnit}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('inventory.inboundPrice')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={stockInForm.unitCost}
                    onChange={(e) => setStockInForm({ ...stockInForm, unitCost: e.target.value })}
                    className="input w-full"
                  />
                </div>
              </div>

              {stockInForm.quantity && (
                <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center text-sm">
                  <span className="text-gray-600">{t('inventory.totalCostValue')}:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(
                      (parseFloat(stockInForm.quantity) || 0) * (parseFloat(stockInForm.unitCost) || 0)
                    )}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.supplier')}
                </label>
                <select
                  value={stockInForm.supplierId}
                  onChange={(e) => setStockInForm({ ...stockInForm, supplierId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">-- {t('inventory.supplier')} --</option>
                  {suppliers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.notes')}
                </label>
                <textarea
                  rows={2}
                  value={stockInForm.note}
                  onChange={(e) => setStockInForm({ ...stockInForm, note: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div className="admin-dialog-footer flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStockInModal(false)}
                  className="btn btn-secondary"
                 data-dialog-close="true">
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={stockInMutation.isPending}
                  className="btn btn-primary"
                >
                  {stockInMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                  <span>{t('common.confirm')}</span>
                </button>
              </div>
            </form>
          </AdminDialog>
      )}

      {/* Modal: Waste & Loss */}
      {showWasteModal && (
        <AdminDialog title={t('inventory.quickStockOut')} onClose={() => setShowWasteModal(false)} className="max-w-md" busy={Boolean(wasteMutation.isPending)} trackChanges chrome>


            <form onSubmit={handleWasteSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.selectItem')} *
                </label>
                <select
                  required
                  value={wasteForm.inventoryId}
                  onChange={(e) => setWasteForm({ ...wasteForm, inventoryId: e.target.value, quantity: '', inputUnit: inventoryItems.find(i => i.id === e.target.value) ? defaultInventoryInputUnit(inventoryItems.find(i => i.id === e.target.value)) : '' })}
                  className="input w-full"
                >
                  <option value="">-- {t('inventory.selectItem')} --</option>
                  {inventoryItems.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      [{getCategoryText(item.category)}] {formatItemName(item, i18n.language)} ({t('inventory.currentStock')}: {formatNumber(item.currentStock)} {item.unit})
                    </option>
                  ))}
                </select>
                {selectedWasteItem && (
                  <div className="text-xs text-gray-500 mt-1 flex justify-between">
                    <span>{t('inventory.availableStock')}: <strong>{formatNumber(selectedWasteItem.currentStock)} {selectedWasteItem.unit}</strong></span>
                    <span>{t('inventory.unitCost')}: <strong>{formatCurrency(selectedWasteItem.avgCost || 0)}</strong></span>
                  </div>
                )}
              </div>

              {selectedWasteItem && <label className="block">{t('inventoryUnits.input')}
                <select className="input w-full" value={wasteForm.inputUnit} onChange={e => setWasteForm({ ...wasteForm, inputUnit: e.target.value })}>
                  {inventoryInputUnits(selectedWasteItem).map(unit => <option key={unit}>{unit}</option>)}
                </select>
              </label>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('inventory.wasteQty')} *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.001"
                      max={selectedWasteItem ? selectedWasteItem.currentStock / inventoryUnitFactor(selectedWasteItem, wasteForm.inputUnit || defaultInventoryInputUnit(selectedWasteItem)) : undefined}
                      value={wasteForm.quantity}
                      onChange={(e) => setWasteForm({ ...wasteForm, quantity: e.target.value })}
                      className="input w-full pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      {wasteForm.inputUnit}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('inventory.wasteReason')} *
                  </label>
                  <select
                    value={wasteForm.wasteType}
                    onChange={(e) => setWasteForm({ ...wasteForm, wasteType: e.target.value })}
                    className="input w-full"
                  >
                    <option value="spill">{t('inventory.lossSpill')}</option>
                    <option value="spoiled">{t('inventory.lossSpoiled')}</option>
                    <option value="expired">{t('inventory.lossExpired')}</option>
                    <option value="mistake">{t('inventory.lossMistake')}</option>
                    <option value="tasting">{t('inventory.lossTasting')}</option>
                    <option value="other">{t('inventory.lossOther')}</option>
                  </select>
                </div>
              </div>

              {wasteForm.quantity && selectedWasteItem && (
                <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center text-sm">
                  <span className="text-gray-600">{t('inventory.estimatedCostLoss')}:</span>
                  <span className="font-bold text-error">
                    {formatCurrency(
                      (parseFloat(wasteForm.quantity) || 0) * (Number(selectedWasteItem.avgCost) || 0)
                    )}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('inventory.notes')}
                </label>
                <textarea
                  rows={2}
                  value={wasteForm.note}
                  onChange={(e) => setWasteForm({ ...wasteForm, note: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div className="admin-dialog-footer flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWasteModal(false)}
                  className="btn btn-secondary"
                 data-dialog-close="true">
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={wasteMutation.isPending}
                  className="btn btn-primary"
                >
                  {wasteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                  <span>{t('common.confirm')}</span>
                </button>
              </div>
            </form>
          </AdminDialog>
      )}
    </div>
  )
}
