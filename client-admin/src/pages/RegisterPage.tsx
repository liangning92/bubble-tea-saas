import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Loader2, User, Phone, Lock, Store, ArrowLeft, ArrowRight, Globe, Check } from 'lucide-react'
import { authApi, storeApi } from '../services/api'

const LANGUAGES = [
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'id', label: 'Indonesia', flag:'🇮🇩' }
]

export function RegisterPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    password: '',
    confirmPassword: '',
    storeName: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)
  const [showLangMenu, setShowLangMenu] = useState(false)

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError('')
  }

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode)
    localStorage.setItem('bubble-tea-language', langCode)
    setShowLangMenu(false)
  }

  const validateStep1 = () => {
    if (!formData.name.trim()) {
      setError(t('auth.nameRequired') || 'Name is required')
      return false
    }
    if (!formData.phone.match(/^[\d]{10,14}$/)) {
      setError(t('auth.invalidPhone') || 'Invalid phone number')
      return false
    }
    if (formData.password.length < 6) {
      setError(t('auth.passwordMinLength') || 'Password must be at least 6 characters')
      return false
    }
    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.passwordMismatch') || 'Passwords do not match')
      return false
    }
    return true
  }

  const handleNext = () => {
    if (validateStep1()) {
      setStep(2)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Step 1: Create store (required)
      const storeResponse = await storeApi.create({
        name: formData.storeName || formData.name + "'s Store"
      })

      if (!storeResponse.data?.data?.id) {
        throw new Error('Failed to create store')
      }

      const storeId = storeResponse.data.data.id

      // Step 2: Register user with store
      const response = await authApi.register({
        phone: formData.phone,
        password: formData.password,
        name: formData.name,
        storeId,
        role: 'admin'
      })

      if (response.data?.code === 201 || response.data?.token) {
        navigate('/login', { replace: true })
      } else {
        setError(response.data?.message || t('auth.registerFailed'))
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || t('auth.registerFailed')
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EC6D88]/5 via-white to-[#EC6D88]/10">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center">
        <button
          onClick={() => navigate('/login')}
          className="p-2 hover:bg-white/50 rounded-full transition-colors"
        >
          <ArrowLeft size={24} className="text-gray-600" />
        </button>
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-2 px-3 py-2 bg-white/80 backdrop-blur rounded-lg shadow-sm hover:bg-white transition-colors"
          >
            <Globe size={18} className="text-primary" />
            <span className="text-sm font-medium">{currentLang.flag} {currentLang.label}</span>
          </button>
          {showLangMenu && (
            <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg py-2 z-50">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 ${i18n.language === lang.code ? 'text-primary font-medium' : 'text-gray-700'}`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="min-h-screen flex items-center justify-center p-6 pt-20">
        <div className="w-full max-w-lg">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-primary mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-4xl">🧋</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('auth.createAccount')}</h1>
            <p className="text-gray-500 mt-1">{t('auth.registerSubtitle')}</p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${step >= 1 ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'}`}>
                {step > 1 ? <Check size={20} /> : '1'}
              </div>
              <span className={`text-sm font-medium ${step >= 1 ? 'text-primary' : 'text-gray-500'}`}>
                {t('auth.stepBasic') || '基本信息'}
              </span>
            </div>
            <div className={`w-12 h-1 transition-colors ${step >= 2 ? 'bg-primary' : 'bg-gray-200'}`} />
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${step >= 2 ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'}`}>
                2
              </div>
              <span className={`text-sm font-medium ${step >= 2 ? 'text-primary' : 'text-gray-500'}`}>
                {t('auth.stepStore') || '店铺信息'}
              </span>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
                {error}
              </div>
            )}

            {step === 1 && (
              <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('auth.fullName')} *
                  </label>
                  <div className="relative">
                    <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder={t('auth.namePlaceholder')}
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-primary focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('auth.phone')} *
                  </label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder={t('auth.phonePlaceholder')}
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-primary focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('auth.password')} *
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder={t('auth.passwordPlaceholder')}
                      className="w-full pl-12 pr-12 py-4 rounded-xl border-2 border-gray-200 focus:border-primary focus:outline-none transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('auth.confirmPassword')} *
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder={t('auth.passwordPlaceholder')}
                      className="w-full pl-12 pr-12 py-4 rounded-xl border-2 border-gray-200 focus:border-primary focus:outline-none transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-hover transition-all flex items-center justify-center gap-2"
                >
                  {t('auth.next')}
                  <ArrowRight size={20} />
                </button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Store Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('auth.storeName')}
                  </label>
                  <div className="relative">
                    <Store size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      name="storeName"
                      value={formData.storeName}
                      onChange={handleChange}
                      placeholder={t('auth.storeNamePlaceholder')}
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-primary focus:outline-none transition-colors"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {t('auth.storeNameHint')}
                  </p>
                </div>

                {/* Summary */}
                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{t('auth.fullName')}:</span>
                    <span className="font-medium">{formData.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{t('auth.phone')}:</span>
                    <span className="font-medium">{formData.phone}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{t('auth.storeName')}:</span>
                    <span className="font-medium">{formData.storeName || formData.name + "'s Store"}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 bg-gray-100 text-gray-700 py-4 rounded-xl font-bold text-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft size={20} />
                    {t('auth.back')}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        {t('auth.registering')}
                      </>
                    ) : (
                      <>
                        {t('auth.createAccount')}
                        <ArrowRight size={20} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Login Link */}
            <div className="mt-6 text-center text-sm text-gray-500">
              {t('auth.alreadyHaveAccount')}{' '}
              <Link to="/login" className="text-primary font-medium hover:underline">
                {t('auth.login')}
              </Link>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-gray-400 text-sm mt-6">
            {t('auth.copyright')}
          </p>
        </div>
      </div>
    </div>
  )
}