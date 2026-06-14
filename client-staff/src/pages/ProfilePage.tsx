import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Lock, LogOut, CheckCircle, Loader2 } from 'lucide-react'

export function ProfilePage() {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('profile.passwordMismatch') })
      return
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: t('profile.passwordMinLength') })
      return
    }

    setIsLoading(true)
    try {
      const response = await staffApi.changePassword(oldPassword, newPassword)
      if (response.code === 200) {
        setMessage({ type: 'success', text: t('profile.passwordChangeSuccess') })
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setShowPasswordForm(false)
      } else {
        setMessage({ type: 'error', text: response.message || t('profile.passwordChangeError') })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || t('profile.error') })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold">
              {user?.name?.charAt(0) || 'S'}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold">{user?.name || 'Staff'}</h1>
            <p className="text-white/80 text-sm">{user?.position || 'Staff'}</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="p-4">
        {/* Profile Info */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-4">{t('profile.title')}</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-500">{t('profile.name')}</label>
              <p className="font-medium text-gray-900">{user?.name || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">{t('profile.phone')}</label>
              <p className="font-medium text-gray-900">{user?.phone || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">{t('profile.position')}</label>
              <p className="font-medium text-gray-900">{user?.position || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">{t('profile.store')}</label>
              <p className="font-medium text-gray-900">{t('profile.mainStore')}</p>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <button
            onClick={() => setShowPasswordForm(!showPasswordForm)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Lock className="text-gray-600" size={20} />
              </div>
              <span className="font-medium text-gray-900">{t('profile.changePassword')}</span>
            </div>
            <span className={`transform transition-transform ${showPasswordForm ? 'rotate-180' : ''}`}>
              ›
            </span>
          </button>

          {showPasswordForm && (
            <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
              {message && (
                <div className={`p-3 rounded-xl ${
                  message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {message.text}
                </div>
              )}

              <div>
                <label className="text-sm text-gray-500">{t('profile.oldPassword')}</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full mt-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">{t('profile.newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full mt-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-gray-500">{t('profile.confirmNewPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full mt-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <CheckCircle size={18} />
                )}
                {t('profile.saveNewPassword')}
              </button>
            </form>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full py-4 bg-white border border-red-200 text-red-600 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-red-50"
        >
          <LogOut size={20} />
          {t('auth.logout')}
        </button>
      </div>
    </div>
  )
}