import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Star, Users, ShoppingCart, BarChart3, Package, Settings, Sparkles } from 'lucide-react'

const FEATURES = [
  {
    icon: ShoppingCart,
    titleKey: 'welcome.features.multiChannelOrders',
    descKey: 'welcome.features.multiChannelOrdersDesc'
  },
  {
    icon: BarChart3,
    titleKey: 'welcome.features.profitAnalytics',
    descKey: 'welcome.features.profitAnalyticsDesc'
  },
  {
    icon: Users,
    titleKey: 'welcome.features.staffManagement',
    descKey: 'welcome.features.staffManagementDesc'
  },
  {
    icon: Package,
    titleKey: 'welcome.features.smartInventory',
    descKey: 'welcome.features.smartInventoryDesc'
  },
  {
    icon: Settings,
    titleKey: 'welcome.features.recipeManagement',
    descKey: 'welcome.features.recipeManagementDesc'
  },
  {
    icon: Star,
    titleKey: 'welcome.features.customerRewards',
    descKey: 'welcome.features.customerRewardsDesc'
  }
]

export function WelcomePage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-white">
      {/* Header */}
      <header className="p-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <span className="text-xl">🧋</span>
            </div>
            <span className="text-xl font-bold text-gray-900">{t('welcome.appName')}</span>
          </div>
          <div className="flex gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              {t('welcome.login')}
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white font-medium rounded-lg transition-colors shadow-lg shadow-pink-500/20"
            >
              {t('welcome.signUp')}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-pink-100 text-pink-700 rounded-full text-sm font-medium mb-6">
            <Sparkles size={16} />
            <span>{t('welcome.heroTagline')}</span>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
            {t('welcome.heroTitle')}
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            {t('welcome.heroDescription')}
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              to="/register"
              className="px-8 py-4 bg-pink-500 hover:bg-pink-600 text-white font-bold text-lg rounded-xl transition-colors shadow-xl shadow-pink-500/30 flex items-center gap-2"
            >
              {t('welcome.startFree')}
              <ArrowRight size={20} />
            </Link>
            <Link
              to="/login"
              className="px-8 py-4 bg-white hover:bg-gray-50 text-gray-700 font-bold text-lg rounded-xl transition-colors border border-gray-200 shadow-xl"
            >
              {t('welcome.login')}
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
            {t('welcome.sectionTitle')}
          </h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            {t('welcome.sectionDescription')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon
              return (
                <div
                  key={i}
                  className="p-6 bg-gray-50 rounded-2xl hover:bg-pink-50 transition-colors border border-gray-100 hover:border-pink-100"
                >
                  <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center mb-4">
                    <Icon size={24} className="text-pink-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{t(feature.titleKey)}</h3>
                  <p className="text-gray-600 text-sm">{t(feature.descKey)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            {t('welcome.ctaTitle')}
          </h2>
          <p className="text-gray-600 mb-8">
            {t('welcome.ctaDescription')}
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-pink-500 hover:bg-pink-600 text-white font-bold text-lg rounded-xl transition-colors shadow-xl shadow-pink-500/30"
          >
            {t('welcome.signUpNow')}
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-200">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          <p>{t('welcome.copyright')}</p>
        </div>
      </footer>
    </div>
  )
}
