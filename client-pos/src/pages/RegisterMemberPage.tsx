import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle, User, Mail, Phone, Calendar } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { posApi } from '../services/api'
import { showToast } from '../components/ui'
import { TextInputModal } from '../components/ui/TextInputModal'

export function RegisterMemberPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    birthday: ''
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // 输入弹窗状态
  const [inputModal, setInputModal] = useState<{
    isOpen: boolean
    field: 'name' | 'phone' | 'email' | 'birthday'
    title: string
    value: string
    placeholder: string
    inputMode: 'text' | 'email' | 'tel'
    required: boolean
  }>({
    isOpen: false,
    field: 'name',
    title: '',
    value: '',
    placeholder: '',
    inputMode: 'text',
    required: false
  })

  const openInput = (field: 'name' | 'phone' | 'email' | 'birthday', title: string, placeholder: string, inputMode: 'text' | 'email' | 'tel' = 'text', required = false) => {
    setInputModal({
      isOpen: true,
      field,
      title,
      value: form[field],
      placeholder,
      inputMode,
      required
    })
  }

  const handleInputConfirm = (value: string) => {
    setForm(prev => ({ ...prev, [inputModal.field]: value }))
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    // 验证必填项
    if (!form.name.trim()) {
      showToast(t('member.nameRequired') || '请输入姓名', 'error')
      return
    }
    if (!form.phone.trim()) {
      showToast(t('member.phoneRequired') || '请输入电话号码', 'error')
      return
    }

    setLoading(true)
    try {
      const res = await posApi.createMember({ ...form, storeId: user?.storeId })
      // axios响应结构: res.data 是服务器返回的 body
      const responseData = res.data
      if (responseData && responseData.code === 201) {
        setSuccess(true)
        showToast(t('member.registerSuccess') || '注册成功', 'success')
        setTimeout(() => navigate('/'), 2000)
      } else {
        showToast(responseData?.message || '注册失败', 'error')
      }
    } catch (error: any) {
      console.error('Register failed:', error)
      const errorMsg = error?.response?.data?.message || error?.message || '注册失败'
      showToast(errorMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <CheckCircle size={80} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-green-600">{t('member.registerSuccess')}</h2>
          <p className="text-gray-500 mt-4 text-lg">{t('member.redirecting')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate('/')} className="p-3 hover:bg-gray-100 rounded-xl active:bg-gray-200 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">{t('member.register')}</h1>
      </header>

      {/* Form - 点击卡片打开输入弹窗 */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
        className="flex-1 p-6 pb-40 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Name Field */}
        <div className="mb-6">
          <label className="block text-base font-medium text-gray-700 mb-2">
            {t('member.name')} *
          </label>
          <button
            type="button"
            onClick={() => openInput('name', t('member.name'), t('member.namePlaceholder'), 'text', true)}
            className="w-full p-4 text-lg rounded-xl border-2 border-gray-200 bg-white text-left flex items-center justify-between active:border-pink-500 transition-colors"
          >
            <span className={form.name ? 'text-gray-900' : 'text-gray-400'}>
              {form.name || t('member.namePlaceholder')}
            </span>
            <User size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Phone Field */}
        <div className="mb-6">
          <label className="block text-base font-medium text-gray-700 mb-2">
            {t('member.phone')} *
          </label>
          <button
            type="button"
            onClick={() => openInput('phone', t('member.phone'), t('member.phonePlaceholder'), 'tel', true)}
            className="w-full p-4 text-lg rounded-xl border-2 border-gray-200 bg-white text-left flex items-center justify-between active:border-pink-500 transition-colors"
          >
            <span className={form.phone ? 'text-gray-900' : 'text-gray-400'}>
              {form.phone || t('member.phonePlaceholder')}
            </span>
            <Phone size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Email Field */}
        <div className="mb-6">
          <label className="block text-base font-medium text-gray-700 mb-2">
            {t('member.email')}
          </label>
          <button
            type="button"
            onClick={() => openInput('email', t('member.email'), t('member.emailOptional'), 'email', false)}
            className="w-full p-4 text-lg rounded-xl border-2 border-gray-200 bg-white text-left flex items-center justify-between active:border-pink-500 transition-colors"
          >
            <span className={form.email ? 'text-gray-900' : 'text-gray-400'}>
              {form.email || t('member.emailOptional')}
            </span>
            <Mail size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Birthday Field */}
        <div className="mb-6">
          <label className="block text-base font-medium text-gray-700 mb-2">
            {t('member.birthday')}
          </label>
          <div className="relative">
            <input
              type="date"
              value={form.birthday}
              onChange={(e) => setForm(prev => ({ ...prev, birthday: e.target.value }))}
              className="w-full p-4 text-lg rounded-xl border-2 border-gray-200 focus:border-pink-500 focus:outline-none bg-white"
            />
          </div>
        </div>
      </form>

      {/* Submit Button - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg">
        <button
          type="button"
          disabled={loading || !form.name || !form.phone}
          onClick={() => handleSubmit()}
          className="w-full py-4 bg-pink-500 text-white rounded-xl font-bold text-lg disabled:bg-gray-300 active:bg-pink-600 transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              {t('common.loading')}
            </span>
          ) : (
            t('member.register')
          )}
        </button>
      </div>

      {/* 文字输入弹窗 */}
      <TextInputModal
        isOpen={inputModal.isOpen}
        onClose={() => setInputModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleInputConfirm}
        title={inputModal.title}
        value={inputModal.value}
        placeholder={inputModal.placeholder}
        inputMode={inputModal.inputMode}
        required={inputModal.required}
      />
    </div>
  )
}