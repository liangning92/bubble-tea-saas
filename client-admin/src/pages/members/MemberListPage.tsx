import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { memberApi } from '../../services/api'
import { Search, Star, Loader2, Users, Crown, Medal, Gem, Circle, ChevronRight } from 'lucide-react'

export function MemberListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchName, setSearchName] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => memberApi.list({ pageSize: 100 })
  })

  const members = data?.data?.data?.list || []

  // Filter by name if searching
  const displayMembers = searchName
    ? members.filter((m: any) =>
        m.name?.toLowerCase().includes(searchName.toLowerCase()) ||
        m.phone?.includes(searchName)
      )
    : members

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'diamond': return <Gem size={16} className="text-blue-400" />
      case 'gold': return <Crown size={16} className="text-yellow-500" />
      case 'silver': return <Medal size={16} className="text-gray-400" />
      default: return <Circle size={16} className="text-orange-400" />
    }
  }

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'diamond': return 'bg-blue-100 text-blue-800'
      case 'gold': return 'bg-yellow-100 text-yellow-800'
      case 'silver': return 'bg-gray-100 text-gray-800'
      default: return 'bg-orange-100 text-orange-800'
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <div className="text-sm text-gray-500">
          {members.length} {t('members.totalMembers')}
        </div>
      </div>

      {/* Search */}
      <div className="card mb-6">
        <div className="flex items-center gap-3">
          <Search size={20} className="text-gray-400" />
          <input
            type="text"
            placeholder={t('members.searchPlaceholder')}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="input flex-1"
          />
        </div>
      </div>

      {/* Member List */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : displayMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Users size={48} className="mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <div className="divide-y">
            {displayMembers.map((member: any) => (
              <div
                key={member.id}
                className="p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-4"
                onClick={() => navigate(`/members/${member.id}`)}
              >
                {/* Avatar & Basic Info */}
                <div className="w-12 h-12 rounded-full bg-primary-light flex items-center justify-center">
                  <span className="text-primary font-semibold">
                    {member.name?.charAt(0)?.toUpperCase() || member.phone?.charAt(0) || 'M'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{member.name || t('members.noName')}</span>
                    <span className={`badge ${getLevelBadge(member.level || 'bronze')}`}>
                      <span className="flex items-center gap-1">
                        {getLevelIcon(member.level || 'bronze')}
                        {t(`members.level${member.level?.charAt(0).toUpperCase() + member.level?.slice(1)}`)}
                      </span>
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {member.phone || '-'}
                  </div>
                </div>

                {/* Points & Stats */}
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Star size={14} className="text-yellow-500" />
                    <span className="font-semibold text-gray-900">
                      {(member.points || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {member.totalOrders || 0} {t('members.orders')}
                  </div>
                </div>

                <ChevronRight size={20} className="text-gray-400" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
