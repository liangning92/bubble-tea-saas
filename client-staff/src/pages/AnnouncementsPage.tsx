import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { ArrowLeft, Megaphone, Calendar, CheckCircle } from 'lucide-react'
import { formatDate } from '../utils/helpers'

interface Announcement {
  id: string
  title: string
  content: string
  type: 'info' | 'urgent' | 'event'
  isRead: boolean
  createdAt: string
}

export function AnnouncementsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadAnnouncements()
  }, [user])

  const loadAnnouncements = async () => {
    setIsLoading(true)
    try {
      const response = await staffApi.getNotifications()
      if (response.data?.list) {
        // Map API data to Announcement format
        const mapped: Announcement[] = response.data.list.map((n: any) => ({
          id: n.id,
          title: n.title,
          content: n.message,
          type: mapNotificationType(n.type),
          isRead: n.status === 'read' || !!n.readAt,
          createdAt: n.createdAt
        }))
        setAnnouncements(mapped)
      }
    } catch (error) {
      console.error('Failed to load announcements:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const mapNotificationType = (type: string): 'info' | 'urgent' | 'event' => {
    switch (type) {
      case 'birthday':
      case 'promotion':
      case 'tier_upgrade':
        return 'event'
      case 'reactivation':
      case 'points_expiring':
        return 'info'
      default:
        return 'info'
    }
  }

  const markAsRead = async (id: string) => {
    try {
      await staffApi.markNotificationRead(id)
      setAnnouncements(prev =>
        prev.map(a => a.id === id ? { ...a, isRead: true } : a)
      )
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const getTypeBadge = (type: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      info: { bg: 'bg-blue-100', text: 'text-blue-700', label: t('announcement.info') },
      urgent: { bg: 'bg-red-100', text: 'text-red-700', label: t('announcement.urgent') },
      event: { bg: 'bg-purple-100', text: 'text-purple-700', label: t('announcement.event') }
    }
    const badge = badges[type] || badges.info
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  const unreadCount = announcements.filter(a => !a.isRead).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{t('announcement.title')}</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-primary">{unreadCount} {t('announcement.unread')}</p>
            )}
          </div>
        </div>
      </header>

      {/* Announcements List */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
        ) : announcements.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <Megaphone size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">{t('announcement.noAnnouncements')}</p>
          </div>
        ) : (
          announcements.map((announcement) => (
            <div
              key={announcement.id}
              onClick={() => !announcement.isRead && markAsRead(announcement.id)}
              className={`bg-white rounded-xl shadow-sm p-4 cursor-pointer transition-all ${
                !announcement.isRead ? 'border-l-4 border-l-primary' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {!announcement.isRead && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                  <h3 className={`font-semibold ${!announcement.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                    {announcement.title}
                  </h3>
                </div>
                {getTypeBadge(announcement.type)}
              </div>

              <p className="text-sm text-gray-600 mb-3 line-clamp-3">{announcement.content}</p>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar size={12} />
                  <span>{formatDate(announcement.createdAt)}</span>
                </div>
                {announcement.isRead && (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle size={12} />
                    <span>{t('announcement.read')}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}