import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { uploadApi } from '../../services/api'
import { Upload, X, FileText } from 'lucide-react'

interface Attachment {
  url: string
  name: string
  type: string
  size: number
}

interface TrainingRecord {
  id?: string
  staffId: string
  trainingType: string
  title: string
  provider: string
  date: string
  duration: number
  certificate?: string
  status: string
  score?: number
  passingScore?: number
  passed?: boolean
  notes?: string
  attachments?: string // JSON string
}

interface Props {
  staffList: any[]
  editData: TrainingRecord | null
  onClose: () => void
}

export function TrainingFormModal({ staffList, editData, onClose }: Props) {
  const { t } = useTranslation()
  const [categories, setCategories] = useState<any[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)

  const [form, setForm] = useState({
    staffId: editData?.staffId || '',
    trainingType: editData?.trainingType || '',
    title: editData?.title || '',
    provider: editData?.provider || '',
    date: editData?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    duration: editData?.duration || 1,
    certificate: editData?.certificate || '',
    status: editData?.status || 'scheduled',
    score: editData?.score || '',
    passingScore: editData?.passingScore || 70,
    notes: editData?.notes || ''
  })

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 加载培训类别
  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await fetch('/api/training/categories', {
          headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
        })
        const data = await response.json()
        if (data.data) {
          setCategories(data.data)
          // 如果编辑模式下没有设置 trainingType，设置第一个为默认值
          if (!editData?.trainingType && data.data.length > 0) {
            setForm(prev => ({ ...prev, trainingType: data.data[0].key }))
          }
        }
      } catch (error) {
        console.error('Failed to load categories:', error)
      } finally {
        setIsLoadingCategories(false)
      }
    }
    loadCategories()
  }, [editData?.trainingType])

  //加载已有附件
  useEffect(() => {
    if (editData?.attachments) {
      try {
        const parsed = JSON.parse(editData.attachments)
        if (Array.isArray(parsed)) {
          setAttachments(parsed)
        }
      } catch (e) {
        console.error('Failed to parse attachments:', e)
      }
    }
  }, [editData?.attachments])

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsUploading(true)
    try {
      const fileArray = Array.from(files)
      const response = await uploadApi.uploadAttachment(fileArray)
      const newFiles = response.data.data.urls.map((url: string, i: number) => ({
        url,
        name: files[i].name,
        type: files[i].type,
        size: files[i].size
      }))
      setAttachments(prev => [...prev, ...newFiles])
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Failed to upload files')
    } finally {
      setIsUploading(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFileUpload(e.dataTransfer.files)
  }, [handleFileUpload])

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.staffId || !form.title || !form.provider) {
      alert('Please fill required fields')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        ...form,
        attachments: JSON.stringify(attachments)
      }

      const url = editData?.id
        ? `/api/staff-management/training/${editData.id}`
        : '/api/staff-management/training'
      const method = editData?.id ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().token}`
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        onClose()
      } else {
        const data = await response.json()
        alert(data.message || 'Failed to save training record')
      }
    } catch (error) {
      console.error('Failed to save:', error)
      alert('Failed to save training record')
    } finally {
      setIsSubmitting(false)
       }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{editData ? t('staff.editTraining') : t('staff.addTraining')}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.name')} *</label>
            <select
              value={form.staffId}
              onChange={(e) => setForm({ ...form, staffId: e.target.value })}
              className="input"
              required
              disabled={!!editData}
            >
              <option value="">{t('staff.select')}</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.type')} *</label>
              <select
                value={form.trainingType}
                onChange={(e) => setForm({ ...form, trainingType: e.target.value })}
                className="input"
                required
                disabled={isLoadingCategories}
              >
                <option value="">{isLoadingCategories ? t('common.loading') + '...' : t('staff.select')}</option>
                {categories.map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.status')} *</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="input"
                required
              >
                <option value="scheduled">{t('staff.scheduled')}</option>
                <option value="in_progress">{t('staff.inProgress')}</option>
                <option value="completed">{t('staff.completed')}</option>
                <option value="cancelled">{t('staff.cancelled')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.title')} *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input"
              placeholder="e.g. Basic Barista Training"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.provider')} *</label>
              <input
                type="text"
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="input"
                placeholder="e.g. Head Office"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.date')} *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="input"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.duration')} (hours)</label>
              <input
                type="number"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: parseInt(e.target.value) || 0 })}
                className="input"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.score')}</label>
              <input
                type="number"
                value={form.score ?? ''}
                onChange={(e) => setForm({ ...form, score: e.target.value ? Number(e.target.value) : 0 })}
                className="input"
                min="0"
                max="100"
                placeholder="0-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.passingScore')}</label>
              <input
                type="number"
                value={form.passingScore}
                onChange={(e) => setForm({ ...form, passingScore: Number(e.target.value) || 0 })}
                className="input"
                min="0"
                max="100"
                placeholder="70"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.certificate')}</label>
            <input
              type="text"
              value={form.certificate}
              onChange={(e) => setForm({ ...form, certificate: e.target.value })}
              className="input"
              placeholder="Certificate number (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('staff.notes')}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input"
              rows={3}
              placeholder="Additional notes..."
            />
          </div>

          {/* 附件上传 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('training.attachments')}</label>
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-primary cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => document.getElementById('training-attachments')?.click()}
            >
              <input
                type="file"
                id="training-attachments"
                className="hidden"
                accept=".pdf,application/pdf"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              {isUploading ? (
                <div className="text-primary">{t('common.loading')}...</div>
              ) : (
                <div className="text-gray-500">
                  <Upload className="mx-auto mb-2" size={24} />
                  <p className="text-sm">{t('training.uploadPdf') || 'Drop PDF files here or click to upload'}</p>
                </div>
              )}
            </div>

            {/* 附件列表 */}
            {attachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {attachments.map((att, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-gray-500" />
                      <span className="text-sm truncate">{att.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn-primary flex-1" disabled={isSubmitting || isUploading}>
              {isSubmitting ? t('common.loading') : t('common.save')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}