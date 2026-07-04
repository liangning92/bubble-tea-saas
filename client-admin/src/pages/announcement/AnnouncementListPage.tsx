import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { announcementApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Plus, Edit2, Trash2, Loader2, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-yellow-100 text-yellow-800',
  urgent: 'bg-red-100 text-red-800'
}

const TYPE_ICONS: Record<string, JSX.Element> = {
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
  urgent: <AlertCircle size={16} />
}

export function AnnouncementListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'

  const [showSuccess, setShowSuccess] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchKeyword, setSearchKeyword] = useState('')

  const { data: announcementsData, isLoading } = useQuery({
    queryKey: ['announcements', storeId],
    queryFn: () => announcementApi.list(storeId),
    enabled: !!storeId
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcementApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements', storeId] })
      setShowSuccess(true)
      setDeleteId(null)
      setTimeout(() => setShowSuccess(false), 2000)
    }
  })

  const announcements = Array.isArray(announcementsData?.data) ? announcementsData?.data : []

  const filteredAnnouncements = (announcements || []).filter((ann: any) => {
    // Type filter
    if (filterType !== 'all' && ann.type !== filterType) return false
    // Search filter
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      if (!ann.title.toLowerCase().includes(keyword) && !ann.content.toLowerCase().includes(keyword)) {
        return false
      }
    }
    return true
  })

  const handleDelete = (id: string) => {
    if (window.confirm(t('announcement.deleteConfirm'))) {
      deleteMutation.mutate(id)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">{t('announcement.title')}</h2>
        <Link to="/announcement/new" className="btn-primary flex items-center gap-2">
          <Plus size={20} /> {t('announcement.create')}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="input w-40"
        >
          <option value="all">{t('announcement.filterAll')}</option>
          <option value="info">{t('announcement.typeInfo')}</option>
          <option value="warning">{t('announcement.typeWarning')}</option>
          <option value="urgent">{t('announcement.typeUrgent')}</option>
        </select>
        <input
          type="text"
          placeholder={t('announcement.search')}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          className="input flex-1"
        />
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <CheckCircle size={18} />
          <span>{t('common.success')}</span>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl pointer-events-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{t('announcement.confirmDelete')}</h3>
            <p className="text-gray-600 mb-6">{t('announcement.deleteHint')}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="btn-secondary">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteId && handleDelete(deleteId)}
                className="btn-danger"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <p>{t('announcement.noAnnouncements')}</p>
          <Link to="/announcement/new" className="btn-primary mt-4 inline-flex">
            {t('announcement.createFirst')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAnnouncements.map((ann: any) => (
            <div key={ann.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                {/* Type Icon */}
                <div className={`p-2 rounded-lg ${TYPE_COLORS[ann.type] || TYPE_COLORS.info}`}>
                  {TYPE_ICONS[ann.type] || TYPE_ICONS.info}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">{ann.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[ann.type] || TYPE_COLORS.info}`}>
                      {t(`announcement.type${ann.type.charAt(0).toUpperCase() + ann.type.slice(1)}`)}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm whitespace-pre-wrap line-clamp-2">{ann.content}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>{t('announcement.priority')}: {ann.priority}</span>
                    {ann.startAt && <span>{t('announcement.startAt')}: {formatDate(ann.startAt)}</span>}
                    {ann.endAt && <span>{t('announcement.endAt')}: {formatDate(ann.endAt)}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/announcement/edit/${ann.id}`)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title={t('common.edit')}
                  >
                    <Edit2 size={18} className="text-gray-600" />
                  </button>
                  <button
                    onClick={() => setDeleteId(ann.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title={t('common.delete')}
                  >
                    <Trash2 size={18} className="text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}