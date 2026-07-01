import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { shiftApi } from '../../services/api'
import { Plus, Edit2, Trash2, RefreshCw, X, Save } from 'lucide-react'

interface Shift {
  id: string
  key: string
  name: string
  nameZh?: string
  nameId?: string
  startTime: string
  endTime: string
  color: string
  sortOrder: number
  isActive: boolean
}

const PRESET_COLORS = [
  '#F59E0B', '#F97316', '#EF4444', '#EC4899',
  '#8B5CF6', '#3B82F6', '#10B981', '#6B7280'
]

export function ShiftConfigPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuthStore()

  const [shifts, setShifts] = useState<Shift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [formData, setFormData] = useState({
    key: '',
    name: '',
    nameZh: '',
    nameId: '',
    startTime: '08:00',
    endTime: '16:00',
    color: '#3B82F6',
    sortOrder: 0
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadShifts()
  }, [user])

  const loadShifts = async () => {
    setIsLoading(true)
    try {
      const response = await shiftApi.list(user?.storeId ?? undefined)
      setShifts(response.data?.data || [])
    } catch (error) {
      console.error('Failed to load shifts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenModal = (shift?: Shift) => {
    if (shift) {
      setEditingShift(shift)
      setFormData({
        key: shift.key,
        name: shift.name,
        nameZh: shift.nameZh || '',
        nameId: shift.nameId || '',
        startTime: shift.startTime,
        endTime: shift.endTime,
        color: shift.color,
        sortOrder: shift.sortOrder
      })
    } else {
      setEditingShift(null)
      setFormData({
        key: '',
        name: '',
        nameZh: '',
        nameId: '',
        startTime: '08:00',
        endTime: '16:00',
        color: '#3B82F6',
        sortOrder: shifts.length
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingShift(null)
  }

  const handleSave = async () => {
    if (!formData.name || !formData.startTime || !formData.endTime) {
      alert(t('common.required'))
      return
    }

    setSaving(true)
    try {
      if (editingShift) {
        await shiftApi.update(editingShift.id, formData)
      } else {
        if (!formData.key) {
          formData.key = formData.name.toLowerCase().replace(/\s+/g, '_')
        }
        await shiftApi.create(formData)
      }
      handleCloseModal()
      loadShifts()
    } catch (error) {
      console.error('Failed to save shift:', error)
      alert(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return
    try {
      await shiftApi.delete(id)
      loadShifts()
    } catch (error) {
      console.error('Failed to delete shift:', error)
      alert(t('common.error'))
    }
  }

  const getShiftName = (shift: Shift) => {
    if (i18n.language === 'zh' && shift.nameZh) return shift.nameZh
    if (i18n.language === 'id' && shift.nameId) return shift.nameId
    return shift.name
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{t('staff.shiftConfig')}</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadShifts}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover flex items-center gap-2"
          >
            <Plus size={18} />
            {t('staff.addShift')}
          </button>
        </div>
      </div>

      {/* Shift List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>
      ) : shifts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl">
          <p className="text-gray-500">{t('staff.noShifts')}</p>
          <button
            onClick={() => handleOpenModal()}
            className="mt-2 text-primary hover:text-primary-hover"
          >
            {t('staff.addFirstShift')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map(shift => (
            <div key={shift.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: shift.color + '20' }}
                  >
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: shift.color }}
                    />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{getShiftName(shift)}</p>
                    <p className="text-xs text-gray-500">{shift.key}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleOpenModal(shift)}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(shift.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('staff.startTime')}</span>
                  <span className="font-medium">{shift.startTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('staff.endTime')}</span>
                  <span className="font-medium">{shift.endTime}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                {editingShift ? t('staff.editShift') : t('staff.addShift')}
              </h2>
              <button onClick={handleCloseModal} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.shiftKey')} (ID)
                </label>
                <input
                  type="text"
                  value={formData.key}
                  onChange={e => setFormData({ ...formData, key: e.target.value })}
                  disabled={!!editingShift}
                  placeholder="morning"
                  className="w-full p-2 border border-gray-200 rounded-lg disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.shiftName')} (EN) *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Morning"
                  className="w-full p-2 border border-gray-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('staff.shiftNameZh')} (ZH)
                  </label>
                  <input
                    type="text"
                    value={formData.nameZh}
                    onChange={e => setFormData({ ...formData, nameZh: e.target.value })}
                    placeholder="早班"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('staff.shiftNameId')} (ID)
                  </label>
                  <input
                    type="text"
                    value={formData.nameId}
                    onChange={e => setFormData({ ...formData, nameId: e.target.value })}
                    placeholder="Pagi"
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('staff.startTime')} *
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('staff.endTime')} *
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full p-2 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('staff.color') || '颜色'}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-8 h-8 rounded-lg border-2 ${formData.color === color ? 'border-gray-900' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}