import { useState } from 'react'
import { ActivityPosterConfig } from '../../../../shared/utils/activities'
import { Monitor, LayoutGrid, CheckSquare, Sparkles, Sliders, Eye, Palette } from 'lucide-react'

export interface ActivityPosterEditorProps {
  value?: ActivityPosterConfig
  onChange: (config: ActivityPosterConfig) => void
  activityName?: string
  activityType?: string
  products?: Array<{
    id: string
    name: string
    image?: string
    price?: number
    specialPrice?: number
  }>
  language?: number // 0 = zh, 1 = en, 2 = id
}

const DEFAULT_DAYS = [
  { day: 1, labelZh: '周一', labelEn: 'Mon', labelId: 'Senin', defaultColor: '#FDE2E4' },
  { day: 2, labelZh: '周二', labelEn: 'Tue', labelId: 'Selasa', defaultColor: '#FFE5D9' },
  { day: 3, labelZh: '周三', labelEn: 'Wed', labelId: 'Rabu', defaultColor: '#D8F3DC' },
  { day: 4, labelZh: '周四', labelEn: 'Thu', labelId: 'Kamis', defaultColor: '#FFCAD4' },
  { day: 5, labelZh: '周五', labelEn: 'Fri', labelId: 'Jumat', defaultColor: '#FEEAFA' },
  { day: 6, labelZh: '周六', labelEn: 'Sat', labelId: 'Sabtu', defaultColor: '#E2ECE9' },
  { day: 0, labelZh: '周日', labelEn: 'Sun', labelId: 'Minggu', defaultColor: '#DFE7FD' },
]

export const DEFAULT_POSTER_CONFIG: ActivityPosterConfig = {
  template: 'daily_specials',
  headline: 'Spesial Harian',
  subheadline: 'Promo Baru Setiap Hari',
  columns: 5,
  rows: 1,
  layoutMode: 'row_cards',
  highlightToday: true,
  themeColor: '#FF4B72',
  backgroundColor: '#121214',
  showFields: {
    productImage: true,
    productName: true,
    productSubname: true,
    originalPrice: true,
    specialPrice: true,
    savingAmount: true,
    dayBadge: true,
    discountTag: false,
  },
}

export function ActivityPosterEditor({
  value,
  onChange,
  activityName = '',
  activityType: _activityType = 'special_price',
  products = [],
  language = 0,
}: ActivityPosterEditorProps) {
  const l = (zh: string, en: string, id: string) => [zh, en, id][language] || zh
  const config: ActivityPosterConfig = {
    ...DEFAULT_POSTER_CONFIG,
    ...value,
    showFields: {
      ...DEFAULT_POSTER_CONFIG.showFields,
      ...(value?.showFields || {}),
    },
  }

  const [previewDay, setPreviewDay] = useState<number>(2) // Default preview Tuesday (Selasa) matching sample image

  const update = (patch: Partial<ActivityPosterConfig>) => {
    onChange({ ...config, ...patch })
  }

  const updateField = (field: keyof NonNullable<ActivityPosterConfig['showFields']>, checked: boolean) => {
    update({
      showFields: {
        ...config.showFields,
        [field]: checked,
      },
    })
  }

  const templateOptions = [
    {
      id: 'daily_specials',
      title: l('每日特价周历流（推荐）', 'Daily Specials Cards (Recommended)', 'Spesial Harian Mingguan'),
      desc: l('横排卡片流，每天突出单品，当天自动发光高亮（如示例图）', 'Card flow with today highlighted', 'Aliran kartu dengan sorotan hari ini'),
    },
    {
      id: 'featured_grid',
      title: l('多行多列宫格', 'Product Grid Layout', 'Tata Letak Kisi Produk'),
      desc: l('自定义行列网格展示多款特价商品', 'Custom rows and columns grid', 'Tampilan baris dan kolom kustom'),
    },
    {
      id: 'bogo_duo',
      title: l('买赠/第二杯对撞海报', 'Buy-Get / Duo Contrast', 'Beli 2 Gratis 1 / Diskon Kedua'),
      desc: l('主商品与赠品视觉对撞，强化优惠角标', 'Main product vs free gift visual', 'Visual produk utama & bonus'),
    },
    {
      id: 'lucky_wheel',
      title: l('抽奖大转盘视觉', 'Lucky Wheel Poster', 'Visual Roda Keberuntungan'),
      desc: l('中央大转盘 + 周围奖品池展示', 'Central wheel with prize showcase', 'Roda di tengah dan etalase hadiah'),
    },
  ]

  const activeColumns = config.columns || 5
  const displayedDays = DEFAULT_DAYS.slice(0, activeColumns)

  return (
    <div className="space-y-6">
      {/* Top Banner / Mode Explanation */}
      <div className="bg-gradient-to-r from-red-50 to-pink-50 border border-pink-200 rounded-xl p-4 flex items-start gap-3">
        <Monitor className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-bold text-gray-800">
            {l('大屏与副屏海报视觉模版编辑器', 'Large Screen & Customer Display Poster Editor', 'Editor Template Poster TV & Layar Pelanggan')}
          </p>
          <p className="text-gray-600 mt-0.5">
            {l(
              '支持自定义显示字段、行列表格、高亮颜色与排版方式。电视大屏与收银副屏将根据配置自动渲染高品质宣传海报。',
              'Customize display fields, row/column grids, highlight themes, and alignments for TV and customer displays.',
              'Kustomisasi kolom, baris, warna sorotan, dan tata letak untuk TV dan layar kasir.'
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form & Layout Controls */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Template Selection */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
            <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-pink-500" />
              {l('海报模板风格', 'Poster Template', 'Template Poster')}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {templateOptions.map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => update({ template: opt.id as any })}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    config.template === opt.id
                      ? 'border-red-500 bg-red-50/50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{opt.title}</span>
                    <input
                      type="radio"
                      name="poster_template"
                      checked={config.template === opt.id}
                      onChange={() => update({ template: opt.id as any })}
                      className="text-red-600"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Text & Headline */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
            <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-blue-500" />
              {l('标题与副标文案', 'Headlines & Text', 'Judul & Subjudul')}
            </label>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  {l('海报主标题', 'Main Headline', 'Judul Utama')}
                </label>
                <input
                  type="text"
                  className="input w-full text-sm"
                  value={config.headline || ''}
                  placeholder={activityName || 'Spesial Harian'}
                  onChange={(e) => update({ headline: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  {l('海报副标 / 口号', 'Subheadline / Slogan', 'Subjudul / Slogan')}
                </label>
                <input
                  type="text"
                  className="input w-full text-sm"
                  value={config.subheadline || ''}
                  placeholder="Promo Baru Setiap Hari"
                  onChange={(e) => update({ subheadline: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* 3. Grid & Column Controls */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
            <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <LayoutGrid className="w-4 h-4 text-purple-500" />
              {l('网格行列与排列设置', 'Grid & Column Settings', 'Pengaturan Kisi & Kolom')}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  {l('显示列数 (天数/商品)', 'Columns / Days', 'Jumlah Kolom')}
                </label>
                <select
                  className="input w-full text-sm"
                  value={config.columns || 5}
                  onChange={(e) => update({ columns: Number(e.target.value) })}
                >
                  <option value={3}>{l('3 列 (精选推荐)', '3 Columns', '3 Kolom')}</option>
                  <option value={4}>{l('4 列 (四日轮替)', '4 Columns', '4 Kolom')}</option>
                  <option value={5}>{l('5 列 (周一至周五 · 推荐)', '5 Columns (Mon-Fri)', '5 Kolom (Senin-Jumat)')}</option>
                  <option value={7}>{l('7 列 (整周周历)', '7 Columns (Full Week)', '7 Kolom (Senin-Minggu)')}</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  {l('显示行数', 'Rows', 'Jumlah Baris')}
                </label>
                <select
                  className="input w-full text-sm"
                  value={config.rows || 1}
                  onChange={(e) => update({ rows: Number(e.target.value) })}
                >
                  <option value={1}>{l('单行横排 (1行)', '1 Row', '1 Baris')}</option>
                  <option value={2}>{l('双行网格 (2行)', '2 Rows', '2 Baris')}</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.highlightToday ?? true}
                  onChange={(e) => update({ highlightToday: e.target.checked })}
                  className="rounded text-red-600"
                />
                <span className="text-sm text-gray-700">
                  {l('启用智能焦点：电视自动高亮当天特价', 'Smart Focus: Highlight today automatically', 'Sorot otomatis hari ini di TV')}
                </span>
              </label>
            </div>
          </div>

          {/* 4. Display Fields Checklist */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
            <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-emerald-500" />
              {l('信息项自定义显示（勾选开关）', 'Fields to Display', 'Informasi yang Ditampilkan')}
            </label>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showFields?.productImage ?? true}
                  onChange={(e) => updateField('productImage', e.target.checked)}
                />
                {l('商品大图', 'Product Image', 'Gambar Produk')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showFields?.productName ?? true}
                  onChange={(e) => updateField('productName', e.target.checked)}
                />
                {l('商品名称', 'Product Name', 'Nama Produk')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showFields?.productSubname ?? true}
                  onChange={(e) => updateField('productSubname', e.target.checked)}
                />
                {l('规格/副标', 'Spec / Subname', 'Varian / Subjudul')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showFields?.originalPrice ?? true}
                  onChange={(e) => updateField('originalPrice', e.target.checked)}
                />
                {l('原价 (Harga Normal)', 'Original Price', 'Harga Normal')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showFields?.specialPrice ?? true}
                  onChange={(e) => updateField('specialPrice', e.target.checked)}
                />
                {l('特价 (Harga Spesial)', 'Special Price', 'Harga Spesial')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showFields?.savingAmount ?? true}
                  onChange={(e) => updateField('savingAmount', e.target.checked)}
                />
                {l('立省金额 (Hemat)', 'Savings (Hemat)', 'Hemat')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showFields?.dayBadge ?? true}
                  onChange={(e) => updateField('dayBadge', e.target.checked)}
                />
                {l('周期标签 (周几)', 'Day Badge', 'Label Hari')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showFields?.discountTag ?? false}
                  onChange={(e) => updateField('discountTag', e.target.checked)}
                />
                {l('折扣角标 (% OFF)', 'Discount Tag', 'Tag Diskon')}
              </label>
            </div>
          </div>

          {/* 5. Theme & Color Picker */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
            <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-amber-500" />
              {l('视觉主题与配色', 'Theme & Colors', 'Warna & Tema')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  {l('当天高亮色', 'Highlight Color', 'Warna Sorotan')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="w-8 h-8 rounded border cursor-pointer"
                    value={config.themeColor || '#FF4B72'}
                    onChange={(e) => update({ themeColor: e.target.value })}
                  />
                  <input
                    type="text"
                    className="input text-xs w-24"
                    value={config.themeColor || '#FF4B72'}
                    onChange={(e) => update({ themeColor: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">
                  {l('大屏背景色', 'Background Color', 'Warna Latar')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="w-8 h-8 rounded border cursor-pointer"
                    value={config.backgroundColor || '#121214'}
                    onChange={(e) => update({ backgroundColor: e.target.value })}
                  />
                  <input
                    type="text"
                    className="input text-xs w-24"
                    value={config.backgroundColor || '#121214'}
                    onChange={(e) => update({ backgroundColor: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: 16:9 TV Simulation Live Preview */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Eye className="w-4 h-4 text-indigo-500" />
              <span>{l('电视大屏 16:9 实时海报预览', '16:9 TV Screen Live Preview', 'Pratinjau Layar TV 16:9')}</span>
            </div>
            {/* Interactive Day Switcher */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-500 mr-1">{l('切换当天预览:', 'Simulate Day:', 'Uji Hari:')}</span>
              {displayedDays.map((d) => (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setPreviewDay(d.day)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    previewDay === d.day
                      ? 'bg-red-600 text-white font-bold'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {[d.labelZh, d.labelEn, d.labelId][language] || d.labelId}
                </button>
              ))}
            </div>
          </div>

          {/* 16:9 Screen Box */}
          <div
            className="w-full rounded-2xl shadow-2xl overflow-hidden border border-gray-800 flex flex-col justify-between p-6 transition-all duration-300 select-none relative"
            style={{
              aspectRatio: '16 / 9',
              backgroundColor: config.backgroundColor || '#121214',
              color: '#ffffff',
            }}
          >
            {/* Top Header */}
            <div className="text-center pt-2 pb-4">
              <h2
                className="text-2xl 2xl:text-3xl font-black tracking-tight"
                style={{ color: config.themeColor || '#FF4B72' }}
              >
                {config.headline || activityName || 'Spesial Harian'}
              </h2>
              <p className="text-xs 2xl:text-sm text-pink-200/90 font-medium tracking-wide mt-1">
                {config.subheadline || 'Promo Baru Setiap Hari'}
              </p>
            </div>

            {/* Middle: Weekday Cards Flow */}
            <div className="flex-1 flex items-center justify-center gap-2.5 pb-2">
              {displayedDays.map((d, idx) => {
                const isActive = config.highlightToday && previewDay === d.day
                const product = products[idx % (products.length || 1)] || {
                  name: ['Blueberry Seed Tea', 'Chocolate Oreo Smoothie Snow Top', 'Matcha Latte Ice', 'Brown Sugar Pearl Sundae', 'Ice Fresh Passion Fruit Tea'][idx % 5],
                  price: 16000,
                  specialPrice: 12000,
                }
                const saving = (product.price || 16000) - (product.specialPrice || 12000)
                const dayText = [d.labelZh, d.labelEn, d.labelId][language] || d.labelId

                // Sample Drink Photos or actual product photo
                const sampleGradients = [
                  'linear-gradient(180deg, #FAD0C4 0%, #FFD1FF 100%)',
                  'linear-gradient(180deg, #FFE5B4 0%, #FFB199 100%)',
                  'linear-gradient(180deg, #D4FC79 0%, #96E6A1 100%)',
                  'linear-gradient(180deg, #FCCB90 0%, #D57EEB 100%)',
                  'linear-gradient(180deg, #FDEB71 0%, #F8D800 100%)',
                  'linear-gradient(180deg, #A8EDEA 0%, #FED6E3 100%)',
                  'linear-gradient(180deg, #E0C3FC 0%, #8EC5FC 100%)',
                ]

                return (
                  <div
                    key={d.day}
                    onClick={() => setPreviewDay(d.day)}
                    className={`flex-1 flex flex-col justify-between rounded-xl overflow-hidden cursor-pointer transition-all duration-300 relative ${
                      isActive
                        ? 'transform -translate-y-2.5 shadow-2xl ring-4 ring-pink-500 scale-105 z-10'
                        : 'opacity-85 hover:opacity-100'
                    }`}
                    style={{
                      height: '92%',
                      background: isActive
                        ? 'linear-gradient(180deg, #FFF0F3 0%, #FFE3E8 100%)'
                        : sampleGradients[idx % sampleGradients.length],
                      color: isActive ? '#9D174D' : '#374151',
                    }}
                  >
                    {/* Top: Product Title */}
                    <div className="p-2 text-center">
                      {config.showFields?.productName && (
                        <p className={`font-black text-[11px] 2xl:text-xs leading-tight line-clamp-2 ${isActive ? 'text-red-700' : 'text-gray-900'}`}>
                          {product.name}
                        </p>
                      )}
                    </div>

                    {/* Middle: Product Photo Area */}
                    {config.showFields?.productImage && (
                      <div className="flex-1 flex items-center justify-center p-1 relative overflow-hidden">
                        <div
                          className="w-16 h-20 2xl:w-20 2xl:h-24 rounded-full flex items-center justify-center shadow-lg border-2 border-white/60 text-white font-black text-xl"
                          style={{
                            background: isActive
                              ? 'linear-gradient(135deg, #FF4B72, #FF758C)'
                              : 'linear-gradient(135deg, #4A5568, #2D3748)',
                          }}
                        >
                          🥤
                        </div>
                        {config.showFields?.discountTag && (
                          <span className="absolute top-1 right-1 bg-red-600 text-white text-[9px] font-bold px-1 rounded-full shadow">
                            SALE
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bottom: Price Breakdown */}
                    <div className="p-1.5 text-center bg-white/70 backdrop-blur-sm border-t border-white/40">
                      {config.showFields?.originalPrice && (
                        <p className="text-[9px] text-gray-500 line-through">
                          Normal: {product.price ? product.price.toLocaleString() : '16.000'}
                        </p>
                      )}
                      {config.showFields?.specialPrice && (
                        <p
                          className="text-[11px] 2xl:text-xs font-black tracking-tight"
                          style={{ color: isActive ? '#E11D48' : '#DC2626' }}
                        >
                          Rp {product.specialPrice ? product.specialPrice.toLocaleString() : '12.000'}
                        </p>
                      )}
                      {config.showFields?.savingAmount && saving > 0 && (
                        <p className="text-[9px] font-bold text-emerald-700">
                          Hemat: {saving.toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* Bottom Weekday Badge */}
                    {config.showFields?.dayBadge && (
                      <div
                        className="py-1 text-center font-black text-xs tracking-wider transition-colors"
                        style={{
                          backgroundColor: isActive ? (config.themeColor || '#FF4B72') : '#6B7280',
                          color: '#FFFFFF',
                        }}
                      >
                        {dayText}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Bottom Screen Indicator */}
            <div className="text-center text-[10px] text-gray-500 pt-1 border-t border-gray-800/60 flex items-center justify-between">
              <span>YOUME SMART TV SIGNAGE</span>
              <span>1920 × 1080 FULL HD · AUTO-SYNC</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
