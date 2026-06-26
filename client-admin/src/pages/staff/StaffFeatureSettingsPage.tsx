import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { configApi } from '../../services/api'
import { Save, RefreshCw, Check, X } from 'lucide-react'

interface StaffFeatureConfig {
  customShifts: boolean
  shiftSwapConfirmation: boolean
  gpsCheckIn: boolean
  attendanceRuleActive: boolean
  autoLeaveBalance: boolean
  leaveScheduleLinkage: boolean
  salesPerformance: boolean
  attendanceBonus: boolean
  salaryPdfExport: boolean
  pointRedemptionStock: boolean
}

const DEFAULT_CONFIG: StaffFeatureConfig = {
  customShifts: true,
  shiftSwapConfirmation: true,
  gpsCheckIn: false,
  attendanceRuleActive: false,
  autoLeaveBalance: true,
  leaveScheduleLinkage: true,
  salesPerformance: false,
  attendanceBonus: false,
  salaryPdfExport: false,
  pointRedemptionStock: false,
}

const featureGroups = [
  {
    title: 'staff.features.schedule',
    features: [
      { key: 'customShifts', label: 'staff.features.customShifts', desc: 'staff.features.customShiftsDesc' },
      { key: 'shiftSwapConfirmation', label: 'staff.features.shiftSwapConfirmation', desc: 'staff.features.shiftSwapConfirmationDesc' },
    ]
  },
  {
    title: 'staff.features.attendance',
    features: [
      { key: 'gpsCheckIn', label: 'staff.features.gpsCheckIn', desc: 'staff.features.gpsCheckInDesc' },
      { key: 'attendanceRuleActive', label: 'staff.features.attendanceRuleActive', desc: 'staff.features.attendanceRuleActiveDesc' },
      { key: 'autoLeaveBalance', label: 'staff.features.autoLeaveBalance', desc: 'staff.features.autoLeaveBalanceDesc' },
      { key: 'leaveScheduleLinkage', label: 'staff.features.leaveScheduleLinkage', desc: 'staff.features.leaveScheduleLinkageDesc' },
    ]
  },
  {
    title: 'staff.features.salary',
    features: [
      { key: 'salesPerformance', label: 'staff.features.salesPerformance', desc: 'staff.features.salesPerformanceDesc' },
      { key: 'attendanceBonus', label: 'staff.features.attendanceBonus', desc: 'staff.features.attendanceBonusDesc' },
      { key: 'salaryPdfExport', label: 'staff.features.salaryPdfExport', desc: 'staff.features.salaryPdfExportDesc' },
    ]
  },
  {
    title: 'staff.features.points',
    features: [
      { key: 'pointRedemptionStock', label: 'staff.features.pointRedemptionStock', desc: 'staff.features.pointRedemptionStockDesc' },
    ]
  }
]

export function StaffFeatureSettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [config, setConfig] = useState<StaffFeatureConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [user])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await configApi.getStaffFeatures()
      if (response.data?.data) {
        setConfig(response.data.data)
      }
    } catch (error) {
      console.error('Failed to load staff features:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (key: keyof StaffFeatureConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await configApi.setStaffFeatures(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save staff features:', error)
      alert(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG)
    setSaved(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t('staff.features.title') || '员工功能设置'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('staff.features.subtitle') || '开启或关闭各项员工管理功能，适应不同门店需求'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <X size={18} />
            {t('staff.features.reset') || '重置默认'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : saved ? (
              <Check size={18} />
            ) : (
              <Save size={18} />
            )}
            {saved ? (t('staff.features.saved') || '已保存') : (t('common.save') || '保存')}
          </button>
        </div>
      </div>

      {/* Feature Groups */}
      <div className="space-y-6">
        {featureGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                {t(group.title) || group.title}
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {group.features.map((feature) => {
                const value = config[feature.key as keyof StaffFeatureConfig]
                return (
                  <div key={feature.key} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {t(feature.label) || feature.label}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {t(feature.desc) || feature.desc}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggle(feature.key as keyof StaffFeatureConfig)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        value ? 'bg-primary' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          value ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Note */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-700">
          💡 {t('staff.features.note') || '提示：部分功能需要刷新页面后生效。关闭某功能后，相关数据仍会保留但不再显示。'}
        </p>
      </div>
    </div>
  )
}