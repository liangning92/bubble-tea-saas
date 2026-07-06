import { useState, useEffect } from 'react'
import { posApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Announcement {
  id: string
  title: string
  content: string
  type: 'info' | 'warning' | 'urgent'
  priority: number
  taskId?: string
  taskStatus?: string
  taskTime?: string
  staffName?: string
}

const TYPE_STYLES: Record<string, string> = {
  info: 'bg-blue-100 border-blue-300 text-blue-900',
  warning: 'bg-orange-100 border-orange-300 text-orange-900',
  urgent: 'bg-red-200 border-red-400 text-red-900 animate-pulse'
}

const TYPE_ICONS: Record<string, JSX.Element> = {
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
  urgent: <AlertCircle size={16} />
}

export function AnnouncementBanner() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set<string>())

  const fetchAnnouncements = async () => {
    if (!user?.storeId) return
    try {
      const [annRes, hygieneRes] = await Promise.all([
        posApi.getActiveAnnouncements(user.storeId),
        posApi.getHygieneAnnouncements(user.storeId)
      ])

      const regularAnnouncements: Announcement[] = annRes.data?.data || []
      const hygieneAnnouncements: Announcement[] = hygieneRes.data?.data || []

      const filtered = [...regularAnnouncements, ...hygieneAnnouncements]
        .filter((a) => !dismissed.has(a.id))

      setAnnouncements(filtered)
    } catch (e) {
      console.error('Failed to fetch announcements:', e)
    }
  }

  useEffect(() => {
    if (!user?.storeId) return
    fetchAnnouncements()
    const interval = setInterval(fetchAnnouncements, 30000)
    return () => clearInterval(interval)
  }, [user?.storeId, dismissed.size])

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id))
  }

  if (announcements.length === 0) return null

  // 只显示1条公告，紧凑横向布局
  const displayAnnouncement = announcements[0]

  // 判断是否是卫生任务公告（有taskId字段）
  const isHygieneTask = !!displayAnnouncement?.taskId

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-primary px-3 py-2 shadow-lg">
      {displayAnnouncement && (
        <div className="flex items-center gap-2">
          <span className="text-lg">{isHygieneTask ? '🧹' : '📢'}</span>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-white font-bold text-sm truncate">{displayAnnouncement.title}</span>
            {isHygieneTask ? (
              // 卫生任务公告：显示时间、区域和负责人
              <span className="text-white/70 text-xs truncate">
                {displayAnnouncement.taskTime ? `⏰ ${displayAnnouncement.taskTime}` : ''}
                {displayAnnouncement.content ? ` | ${displayAnnouncement.content}` : ''}
                {displayAnnouncement.staffName ? ` | 👤 ${displayAnnouncement.staffName}` : ''}
              </span>
            ) : (
              // 普通公告：直接显示content
              <span className="text-white/70 text-xs truncate">{displayAnnouncement.content}</span>
            )}
          </div>
          <button
            onClick={() => handleDismiss(displayAnnouncement.id)}
            className="p-1 hover:bg-white/20 rounded flex-shrink-0"
          >
            <X size={16} className="text-white" />
          </button>
        </div>
      )}
      {announcements.length > 1 && (
        <p className="text-xs text-white/60 text-center mt-1">+{announcements.length - 1} more</p>
      )}
    </div>
  )
}
