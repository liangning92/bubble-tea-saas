import {applyPosterDesignPatch,posterControlDesign} from '../../../../shared/utils/posterControls'
import { PosterElementInspector, type PosterSelection } from './PosterElementInspector'
import { PosterCanvasEditor } from './PosterCanvasEditor'
import { renderActivityPoster, defaultPosterCards, DEFAULT_POSTER_DESIGN, type PosterInput } from '../../../../shared/utils/activityPoster'
import { MediaPicker } from '../MediaLibrary'
import { receiptMediaUrl } from '../../services/api'
import { useState } from 'react'
import { ActivityPosterConfig, PosterDesignConfig } from '../../../../shared/utils/activities'
import {
  Monitor,
  LayoutGrid,
  Sparkles,
  Sliders,
  Eye,
  Palette,
  Type,
  Image as ImageIcon,
  MoveHorizontal,
  Sun,
  RotateCcw,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  AlignCenter,
  AlignLeft,
  AlignRight,
} from 'lucide-react'

export interface ActivityPosterEditorProps {
  value?: ActivityPosterConfig
  onChange: (config: ActivityPosterConfig) => void
  activityName?: string
  activityType?: string
  products?: Array<{
    id: string
    name: string
    image?: string
    imageVariants?: Array<{url:string;width?:number;height?:number}>
    price?: number
    specialPrice?: number
  }>
  activity?: PosterInput
  language?: number // 0 = zh, 1 = en, 2 = id
}

export const DEFAULT_DAYS = [
  { day: 1, labelZh: '周一', labelEn: 'Mon', labelId: 'Senin', defaultColor: '#FFC4C4', activeColor: '#FFF0F2', titleColor: '#9F1239' },
  { day: 2, labelZh: '周二', labelEn: 'Tue', labelId: 'Selasa', defaultColor: '#FFF0F3', activeColor: '#FFF5F7', titleColor: '#BE123C' },
  { day: 3, labelZh: '周三', labelEn: 'Wed', labelId: 'Rabu', defaultColor: '#D4EDDA', activeColor: '#EDFAEF', titleColor: '#166534' },
  { day: 4, labelZh: '周四', labelEn: 'Thu', labelId: 'Kamis', defaultColor: '#FDE6D5', activeColor: '#FEF0E6', titleColor: '#9A3412' },
  { day: 5, labelZh: '周五', labelEn: 'Fri', labelId: 'Jumat', defaultColor: '#FEF3C7', activeColor: '#FFFBEB', titleColor: '#854D0E' },
  { day: 6, labelZh: '周六', labelEn: 'Sat', labelId: 'Sabtu', defaultColor: '#E0E7FF', activeColor: '#EEF2FF', titleColor: '#3730A3' },
  { day: 0, labelZh: '周日', labelEn: 'Sun', labelId: 'Minggu', defaultColor: '#FCE7F3', activeColor: '#FDF2F8', titleColor: '#9D174D' },
]

export const DEFAULT_DESIGN_CONFIG: PosterDesignConfig = DEFAULT_POSTER_DESIGN

export const THEME_PRESETS = [
  {
    id: 'pastel',
    nameZh: '🍬 马卡龙多巴胺（推荐）',
    nameEn: 'Pastel Dopamine',
    nameId: 'Pastel Dopamin',
    desc: '温柔清爽马卡龙粉、绿、橙多色组合，食欲感强',
    bg: '#121214',
    highlightColor: '#FF2E63',
    priceBoxBg: '#ffffff',
    cardColors: ['#FFC4C4', '#FFF0F3', '#D4EDDA', '#FDE6D5', '#FEF3C7', '#E0E7FF', '#FCE7F3'],
    titleColors: ['#9F1239', '#BE123C', '#166534', '#9A3412', '#854D0E', '#3730A3', '#9D174D'],
  },
  {
    id: 'dopamine',
    nameZh: '⚡ 高饱和多巴胺',
    nameEn: 'Vibrant Pop',
    nameId: 'Pop Cerah',
    desc: '明亮鲜艳高对比色块，吸睛力极强',
    bg: '#0F172A',
    highlightColor: '#FF0055',
    priceBoxBg: '#ffffff',
    cardColors: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#FF9F43', '#A8E6CF', '#C7ECEE', '#FF8ED4'],
    titleColors: ['#ffffff', '#ffffff', '#854D0E', '#ffffff', '#166534', '#130f40', '#ffffff'],
  },
  {
    id: 'dark_gold',
    nameZh: '🌌 奢华深黑金',
    nameEn: 'Dark Luxury Gold',
    nameId: 'Hitam Emas Mewah',
    desc: '深邃哑光背景 + 暖金字体，高端轻奢质感',
    bg: '#0A0A0C',
    highlightColor: '#F59E0B',
    priceBoxBg: 'rgba(25, 25, 30, 0.95)',
    cardColors: ['#1E1C20', '#1F2228', '#1C2420', '#251F1A', '#221D28', '#1B212B', '#261B22'],
    titleColors: ['#FDE68A', '#93C5FD', '#86EFAC', '#FDBA74', '#DDD6FE', '#BAE6FD', '#FBCFE8'],
  },
  {
    id: 'sunset',
    nameZh: '🌅 日落蜜桃珊瑚',
    nameEn: 'Sunset Coral',
    nameId: 'Karang Matahari Terbenam',
    desc: '夕阳蜜桃与珊瑚暖色系，甜品店温馨氛围',
    bg: '#181216',
    highlightColor: '#E11D48',
    priceBoxBg: '#ffffff',
    cardColors: ['#FFD3B6', '#FFAAA6', '#FF8B94', '#FFD3B6', '#FFAAA6', '#FFD3B6', '#FFAAA6'],
    titleColors: ['#9F1239', '#881337', '#701A75', '#9F1239', '#881337', '#9F1239', '#881337'],
  },
  {
    id: 'clean',
    nameZh: '🧊 极简白霜轻奢',
    nameEn: 'Clean White Frost',
    nameId: 'Putih Bersih Minimalis',
    desc: '简约透亮纯白卡片，突出商品本体照片',
    bg: '#020617',
    highlightColor: '#0EA5E9',
    priceBoxBg: '#F8FAFC',
    cardColors: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'],
    titleColors: ['#0F172A', '#0F172A', '#0F172A', '#0F172A', '#0F172A', '#0F172A', '#0F172A'],
  },
]

export const DEFAULT_POSTER_CONFIG: ActivityPosterConfig = {
  template: 'daily_specials',
  headline: '',
  subheadline: '',
  columns: 5,
  rows: 1,
  layoutMode: 'row_cards',
  highlightToday: true,
  themeColor: '#FF4B72',
  backgroundColor: '#121214',
  designConfig: DEFAULT_DESIGN_CONFIG,
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
  activity = {},
  activityType: _activityType = 'special_price',
  products = [],
  language = 0,
}: ActivityPosterEditorProps) {
  const l = (zh: string, en: string, id: string) => [zh, en, id][language] || zh

  const config: ActivityPosterConfig = {
    ...DEFAULT_POSTER_CONFIG,
    ...value,
    designConfig: {
      ...DEFAULT_DESIGN_CONFIG,
      ...(value?.designConfig || {}),
    },
    showFields: {
      ...DEFAULT_POSTER_CONFIG.showFields,
      ...(value?.showFields || {}),
    },
  }

  const design = {...DEFAULT_DESIGN_CONFIG,...posterControlDesign(config)}

  const [activeTab, setActiveTab] = useState<'cards' | 'positions' | 'colors' | 'effects' | 'image' | 'spacing' | 'elements'>('elements')
  const [elementSelection, setElementSelection] = useState<PosterSelection>({key:'productName'})
  const [imageCard, setImageCard] = useState<number | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewRatio, setPreviewRatio] = useState('16 / 9')
  const [history, setHistory] = useState<ActivityPosterConfig[]>([])
  const [future, setFuture] = useState<ActivityPosterConfig[]>([])
  const [previewDay, setPreviewDay] = useState<number>(1) // Default preview Monday (Senin)

  const update = (patch: Partial<ActivityPosterConfig>) => {
    setHistory(h => [...h.slice(-29), config])
    setFuture([])
    onChange({ ...config, cardItems: currentCards, ...patch })
  }

  const updateDesign = (patch: Partial<PosterDesignConfig>) => {
    update(applyPosterDesignPatch({...config,cardItems:currentCards},patch))
  }

  const updateField = (field: keyof NonNullable<ActivityPosterConfig['showFields']>, checked: boolean) => {
    update({
      showFields: {
        ...config.showFields,
        [field]: checked,
      },
    })
  }

  // Resolves the list of cards: user-defined cards or derived from DEFAULT_DAYS
  const resolveCards = (): Array<any> => {
    if (config.cardItems !== undefined) {
      return config.cardItems
    }
    return defaultPosterCards({...activity,products,posterConfig:config}).map((card,i)=>({...card,color:card.color||DEFAULT_DAYS[i%7].defaultColor}))
  }

  const currentCards = resolveCards()

  // 1. Add a card / column freely
  const handleAddCard = () => {
    if (currentCards.length >= 30) return
    const nextIdx = currentCards.length + 1
    const def = DEFAULT_DAYS[(nextIdx - 1) % DEFAULT_DAYS.length]
    const newCard = {
      id: `card_${Date.now()}`,
      dayOfWeek: def.day,
      dayLabel: `${l('卡片', 'Card', 'Item')} #${nextIdx}`,
      productName: '',

      color: def.defaultColor,
      activeColor: def.activeColor,
      titleColor: def.titleColor,
    }
    const nextList = [...currentCards, newCard]
    update({
      cardItems: nextList,
      columns: Math.max(1, Math.min(10, nextList.length)),
    })
  }

  // 2. Delete a card
  const handleDeleteCard = (index: number) => {
    const nextList = currentCards.filter((_, i) => i !== index)
    update({
      cardItems: nextList,
      columns: Math.max(1, Math.min(10, nextList.length)),
    })
  }

  // 3. Move card left or right
  const handleMoveCard = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= currentCards.length) return
    const nextList = [...currentCards]
    const temp = nextList[index]
    nextList[index] = nextList[targetIdx]
    nextList[targetIdx] = temp
    update({ cardItems: nextList })
  }

  // 4. Change a card field
  const handleCardFieldChange = (index: number, patch: any) => {
    const nextList = [...currentCards]
    const elements={...nextList[index].elements}
    if(patch.color!==undefined)elements.card={...elements.card,backgroundColor:patch.color}
    if(patch.titleColor!==undefined)elements.productName={...elements.productName,color:patch.titleColor}
    if(patch.pillBg!==undefined)elements.priceBox={...elements.priceBox,backgroundColor:patch.pillBg}
    nextList[index] = { ...nextList[index], ...patch,...(config.freeform?{elements}:{}) }
    update({ cardItems: nextList })
  }

  // 5. Select product from catalog for a card
  const handleProductSelect = (index: number, prodId: string) => {
    const selectedProd = products.find((p) => p.id === prodId)
    if (!selectedProd) { handleCardFieldChange(index, {productId:undefined}); return }

    const origPrice = selectedProd.price
    const specPrice = selectedProd.specialPrice
    const saving = origPrice !== undefined && specPrice !== undefined ? Math.max(0, origPrice - specPrice) : undefined
    const imgUrl = selectedProd.image || ''

    handleCardFieldChange(index, {
      imageMode: 'auto',
      productId: selectedProd.id,
      productName: selectedProd.name,
      imageUrl: imgUrl,
      originalPrice: origPrice,
      specialPrice: specPrice,
      saving: saving,
    })
  }

  // 6. Quick presets for schedule & column counts
  const applyPresetColumns = (cols: number) => {
    const daysToUse = DEFAULT_DAYS.slice(0, cols)
    const newCards = daysToUse.map((d, i) => {
      const existing = currentCards[i] || {}
      return {
        ...existing,
        id: `card_${d.day}`,
        dayOfWeek: d.day,
        dayLabel: [d.labelZh, d.labelEn, d.labelId][language] || d.labelId,
        color: existing.color || d.defaultColor,
        activeColor: existing.activeColor || d.activeColor,
        titleColor: existing.titleColor || d.titleColor,
      }
    })
    update({
      columns: cols,
      cardItems: newCards,
    })
  }

  const applyThemePreset = (preset: typeof THEME_PRESETS[0]) => {
    const newCards = currentCards.map((c, i) => ({
      ...c,
      color: preset.cardColors[i % preset.cardColors.length],
      activeColor:preset.highlightColor,
      elements:{...c.elements,card:{...c.elements?.card,backgroundColor:preset.cardColors[i%preset.cardColors.length]},productName:{...c.elements?.productName,color:preset.titleColors[i%preset.titleColors.length]},priceBox:{...c.elements?.priceBox,backgroundColor:preset.priceBoxBg}},
      titleColor: preset.titleColors[i % preset.titleColors.length],
    }))

    update({
      elements:{...config.elements,headline:{...config.elements?.headline,color:preset.highlightColor},subheadline:{...config.elements?.subheadline,color:preset.highlightColor},highlight:{...config.elements?.highlight,borderColor:preset.highlightColor,backgroundColor:preset.highlightColor}},
      themeColor: preset.highlightColor,
      backgroundColor: preset.bg,
      cardItems: newCards,
      designConfig: {
        ...design,
        themePreset: preset.id as any,
        priceBoxBg: preset.priceBoxBg,
        highlightColor: preset.highlightColor,
      },
    })
  }

  const rowCount = design.rows || config.rows || 1

  return (
    <div className="space-y-6">
      {/* Top Banner / Studio Control Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-md">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base flex flex-wrap items-center gap-2">
              {l('自由海报设计工作室 · 全元素自主可控', 'Freeform Poster Design Studio · Fully Customizable', 'Studio Desain Poster Layar Bebas')}
              <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-bold border border-red-200">
                {l('自由添加行/列 · 胶囊色彩 · 位置随心移', 'Freely Add Rows/Cols, Capsule Colors & Positions', 'Tambah Baris/Kolom & Bebas Atur')}
              </span>
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">
              {l(
                '不局限于任何固定模版：支持自由增减列数、1行/2行网格切换、文字与胶囊颜色自由选取、图文位置随意调动。',
                'No fixed templates: Add/remove columns, toggle 1 or 2 rows, customize text & capsule colors, and rearrange item positions freely.',
                'Tidak terbatas template kaku: Tambah/hapus kolom, ubah 1/2 baris, sesuaikan warna kapsul & teks, dan atur posisi bebas.'
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => update({ ...DEFAULT_POSTER_CONFIG, headline: activityName, cardItems: currentCards })}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-white flex items-center gap-1.5 transition-colors shadow-sm"
          title={l('恢复推荐设计预设', 'Reset to Recommended', 'Reset ke Pengaturan Default')}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {l('重置默认风格', 'Reset Default', 'Reset Default')}
        </button>
      </div>

      <div className="rounded-xl border bg-white p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" disabled={!history.length} onClick={()=>{const prior=history[history.length-1];setFuture(f=>[config,...f]);setHistory(h=>h.slice(0,-1));onChange(prior)}}>{l('撤销','Undo','Urungkan')}</button>
          <button type="button" className="btn-secondary" disabled={!future.length} onClick={()=>{setHistory(h=>[...h,config]);onChange(future[0]);setFuture(f=>f.slice(1))}}>{l('重做','Redo','Ulangi')}</button>
          <label className="flex items-center gap-2 text-sm">{l('设计起点','Starting layout','Tata letak awal')}<select className="input w-auto" value={config.template} onChange={e=>{const template=e.target.value as ActivityPosterConfig['template'];const rows=template==='featured_grid'?2:1;update({template,columns:template==='bogo_duo'?2:template==='lucky_wheel'?3:5,rows,designConfig:{...design,rows}})}}>{[['daily_specials',l('每日周历','Daily calendar','Kalender harian')],['featured_grid',l('商品展架','Product grid','Kisi produk')],['bogo_duo',l('买赠活动','Buy and get','Beli dan gratis')],['lucky_wheel',l('抽奖宣传','Lottery promotion','Promosi undian')],['tiered_milestone',l('阶梯优惠','Tiered offer','Promo bertingkat')]].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label className="text-sm flex items-center gap-2">{l('每行列数','Columns per row','Kolom per baris')}<input type="number" min={1} max={10} className="input w-20" value={config.columns||5} onChange={e=>update({columns:Math.max(1,Math.min(10,Number(e.target.value)))})}/></label>
        </div>
        <p className="text-xs text-gray-500">{l('先选商品和优惠，再调整海报内容、版式与效果。每个活动独立保存，卡片最多30张；超出画布容量自动分页。','Choose products and rules, then edit content, layout and effects. Each activity saves its own design. Up to 30 cards with automatic pagination.','Pilih produk dan aturan, lalu atur konten, tata letak dan efek. Desain tersimpan per aktivitas. Maksimal 30 kartu dengan halaman otomatis.')}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Design Controls Studio Tabs */}
        <div className="lg:col-span-5 space-y-4">
          {/* Studio Navigation Tabs */}
          <div className="grid grid-cols-3 gap-1.5 bg-gray-100 p-1.5 rounded-xl border border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('cards')}
              className={`py-2 px-1 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'cards'
                  ? 'bg-white text-red-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {l('卡片与行列', 'Cards & Rows', 'Kartu & Baris')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('positions')}
              className={`py-2 px-1 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'positions'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              <MoveHorizontal className="w-3.5 h-3.5" />
              {l('位置与排布', 'Positions', 'Posisi Tata Letak')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('colors')}
              className={`py-2 px-1 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'colors'
                  ? 'bg-white text-purple-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              {l('文字与胶囊色彩', 'Colors & Pills', 'Warna Teks & Kapsul')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('effects')}
              className={`py-2 px-1 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'effects'
                  ? 'bg-white text-pink-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {l('视觉与描边特效', 'Effects', 'Efek & Bayangan')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className={`py-2 px-1 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'image'
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {l('产品图片控制', 'Image Area', 'Area Gambar')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('spacing')}
              className={`py-2 px-1 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'spacing'
                  ? 'bg-white text-amber-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              {l('间距与字号', 'Spacing & Font', 'Jarak & Font')}
            </button>
          </div>

          <button type="button" className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold ${activeTab==='elements'?'bg-sky-50 border-sky-400 text-sky-800':'bg-white'}`} onClick={()=>setActiveTab('elements')}>{l('图层与自由编辑','Layers & free positioning','Lapisan & posisi bebas')}</button>
          {activeTab==='elements'&&<PosterElementInspector value={{...config,cardItems:currentCards}} onChange={update} selection={elementSelection} onSelect={setElementSelection} language={language}/>}
          {/* TAB 1: CARDS & ROWS (Add/Delete/Reorder Columns & Rows) */}
          {activeTab === 'cards' && (
            <div className="space-y-4">
              {/* Rows & Columns Quick Actions */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-red-500" />
                    {l('行列排布设置', 'Rows & Columns Structure', 'Struktur Baris & Kolom')}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-red-600">
                      {rowCount} {l('行', 'Row(s)', 'Baris')} × {config.columns || 5} {l('列', 'Cols', 'Kolom')}
                    </span>
                  </div>
                </div>

                {/* Row switch: 1 row vs 2 rows */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      update({ rows: 1, designConfig:{...design,rows:1} })
                    }}
                    className={`p-2.5 rounded-xl border font-bold text-center transition-all ${
                      rowCount === 1
                        ? 'border-red-500 bg-red-50 text-red-700 shadow-sm ring-1 ring-red-400'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {l('🔲 单行平铺横排 (1 行)', 'Single Row (1 Row)', '1 Baris Tunggal')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      update({ rows: 2, designConfig:{...design,rows:2} })
                    }}
                    className={`p-2.5 rounded-xl border font-bold text-center transition-all ${
                      rowCount === 2
                        ? 'border-red-500 bg-red-50 text-red-700 shadow-sm ring-1 ring-red-400'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {l('🔳 双行网格排布 (2 行)', 'Two Rows Grid (2 Rows)', '2 Baris Kisi-kisi')}
                  </button>
                </div>

                {/* Quick Presets for Days / Columns */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="text-xs text-gray-500 font-semibold block mb-1.5">
                    {l('快速套用周期列数预设:', 'Quick Column Presets:', 'Preset Jumlah Hari:')}
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { cols: 7, label: l('7天全周 (7列)', '7 Days (7 cols)', '7 Hari (7 Kolom)') },
                      { cols: 5, label: l('5天工作日 (5列)', '5 Days (5 cols)', '5 Hari (5 Kolom)') },
                      { cols: 6, label: l('6天特惠 (6列)', '6 Days (6 cols)', '6 Hari (6 Kolom)') },
                      { cols: 4, label: l('4天组合 (4列)', '4 Days (4 cols)', '4 Hari (4 Kolom)') },
                    ].map((btn) => (
                      <button
                        key={btn.cols}
                        type="button"
                        onClick={() => applyPresetColumns(btn.cols)}
                        className={`py-1.5 px-1 text-center rounded-lg border font-bold transition-all text-[11px] ${
                          currentCards.length === btn.cols
                            ? 'border-red-500 bg-red-50 text-red-600 shadow-sm'
                            : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main Titles */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1 font-semibold">
                      {l('海报主标题文案', 'Main Headline Text', 'Teks Judul Utama')}
                    </label>
                    <input
                      type="text"
                      className="input w-full text-sm font-bold"
                      value={config.headline || ''}
                      placeholder={activityName || 'Spesial Harian'}
                      onChange={(e) => update({ headline: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1 font-semibold">
                      {l('海报副标 / 优惠说明', 'Subheadline / Slogan', 'Subjudul / Slogan')}
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

              {/* Dynamic Cards Management: Add/Remove/Reorder & Auto-binding */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <LayoutGrid className="w-4 h-4 text-emerald-500" />
                      {l('卡片自由列表管理', 'Freeform Cards List', 'Daftar Kartu Bebas')}
                    </label>
                    <p className="text-[11px] text-gray-500">
                      {l('可自由添加列、删除列、移动顺序与单独定制颜色', 'Add/delete cols, reorder & customize colors', 'Bebas tambah/hapus kolom & atur posisi')}
                    </p>
                  </div>

                  {/* Add Column Button */}
                  <button
                    type="button"
                    onClick={handleAddCard}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 shadow-sm hover:bg-emerald-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {l('➕ 添加一列 / 卡片', 'Add Column / Card', 'Tambah Kolom')}
                  </button>
                </div>

                <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                  {currentCards.map((card, idx) => {
                    const fallbackProd = products.find(p => p.id === card.productId)
                    const currentProdId = card.productId || fallbackProd?.id || ''
                    const currentImg = card.imageUrl || fallbackProd?.image || ''
                    const currentName = card.productName ?? fallbackProd?.name ?? ''
                    const currentOrig = card.originalPrice ?? fallbackProd?.price ?? ''
                    const currentSpec = card.specialPrice !== undefined ? card.specialPrice : (fallbackProd?.specialPrice ?? '')
                    const currentLabel = card.dayLabel || `Day ${idx + 1}`

                    return (
                      <div
                        key={card.id || idx}
                        className="p-3 rounded-xl border border-gray-200 bg-gray-50/80 space-y-2.5 hover:border-gray-300 transition-colors relative"
                      >
                        {/* Header: Label, Reorder, Delete */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: card.color || '#FFC4C4' }} />
                            <span className="text-[11px] font-mono text-gray-400 font-bold">#{idx + 1}</span>
                            <input
                              type="text"
                              className="input text-xs font-black py-0.5 px-1.5 min-w-0 w-full max-w-32 bg-white border border-gray-300 rounded"
                              value={currentLabel}
                              title={l('自定义此卡片标签文字', 'Custom label text', 'Ubah teks label')}
                              onChange={(e) => handleCardFieldChange(idx, { dayLabel: e.target.value })}
                            />
                          </div>

                          {/* Reorder & Delete actions */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveCard(idx, 'left')}
                              className="p-1 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={l('向前移动一列', 'Move Left', 'Pindah Kiri')}
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === currentCards.length - 1}
                              onClick={() => handleMoveCard(idx, 'right')}
                              className="p-1 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={l('向后移动一列', 'Move Right', 'Pindah Kanan')}
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={false}
                              onClick={() => handleDeleteCard(idx)}
                              className="p-1 rounded bg-white border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed ml-1"
                              title={l('删除这一列', 'Delete Column', 'Hapus Kolom')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Product Selector Dropdown */}
                        <div className="flex items-center gap-2">
                          {currentImg ? (
                            <img
                              src={currentImg}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0 bg-white"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center text-sm flex-shrink-0">
                              🥤
                            </div>
                          )}

                          <select
                            className="input flex-1 min-w-0 text-xs py-1.5 px-2 bg-white font-medium"
                            value={currentProdId}
                            onChange={(e) => handleProductSelect(idx, e.target.value)}
                          >
                            <option value="">{l('-- 关联商品库 (自动填充品名与价格) --', '-- Auto-bind from Catalog --', '-- Pilih Produk --')}</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (Rp {(p.specialPrice || p.price || 0).toLocaleString('id-ID')})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Editable Name & Price Overrides */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-gray-200/60 text-xs">
                          <div className="col-span-1">
                            <label className="text-[10px] text-gray-500 block mb-0.5">{l('品名文案', 'Name Override', 'Nama')}</label>
                            <input
                              type="text"
                              className="input w-full text-xs py-1 px-1.5 bg-white"
                              value={currentName}
                              onChange={(e) => handleCardFieldChange(idx, { productName: e.target.value })}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-gray-500 block mb-0.5">{l('原价 Rp', 'Normal Price', 'Harga Normal')}</label>
                            <input
                              type="number"
                              className="input w-full text-xs py-1 px-1.5 bg-white font-mono"
                              value={currentOrig}
                              onChange={(e) => handleCardFieldChange(idx, { originalPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-red-500 font-bold block mb-0.5">{l('特价 Rp', 'Special Price', 'Harga Spesial')}</label>
                            <input
                              type="number"
                              className="input w-full text-xs py-1 px-1.5 bg-white font-mono font-bold text-red-600"
                              value={currentSpec}
                              onChange={(e) => handleCardFieldChange(idx, { specialPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
                            />
                          </div>
                        </div>

                        <details className="rounded-lg border p-2 text-xs bg-white">
                          <summary className="cursor-pointer font-semibold">{l('图片、星期与更多内容','Image, day & more','Gambar, hari & lainnya')}</summary>
                          <div className="grid gap-2 pt-3">
                            <label>{l('高亮星期（只影响海报）','Highlight day (visual only)','Hari sorotan (visual saja)')}<select className="input" aria-label={l('高亮星期','Highlight day','Hari sorotan')} value={card.dayOfWeek ?? ''} onChange={e=>handleCardFieldChange(idx,{dayOfWeek:e.target.value===''?undefined:Number(e.target.value)})}><option value="">{l('无','None','Tidak ada')}</option>{DEFAULT_DAYS.map(day=><option key={day.day} value={day.day}>{[day.labelZh,day.labelEn,day.labelId][language]}</option>)}</select></label>
                            <label>{l('副标题 / 规格','Subtitle / size','Subjudul / ukuran')}<input className="input" value={card.specName ?? ''} onChange={e=>handleCardFieldChange(idx,{specName:e.target.value})}/></label>
                            <label>{l('图片地址','Image URL','URL gambar')}<input className="input" value={card.imageUrl ?? ''} onChange={e=>handleCardFieldChange(idx,{imageUrl:e.target.value,imageMode:'manual'})}/></label>
                            <button type="button" className="btn-secondary" onClick={()=>setImageCard(idx)}>{l('从素材库选择图片','Choose image from library','Pilih gambar dari pustaka')}</button>
                            <button type="button" className="btn-secondary" disabled={currentCards.length>=30} onClick={()=>{const list=[...currentCards];list.splice(idx+1,0,{...card,id:crypto.randomUUID()});update({cardItems:list})}}>{l('复制此卡片','Duplicate card','Salin kartu')}</button>
                          </div>
                        </details>
                        {/* Individual Card Color Overrides */}
                        <div className="flex flex-wrap gap-2 items-center justify-between pt-1 text-[11px] text-gray-500 border-t border-gray-200/40">
                          <span className="font-semibold">{l('单独微调此卡片色彩:', 'Card Color Overrides:', 'Warna Khusus Kartu:')}</span>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 cursor-pointer" title={l('卡片底色', 'Card Background', 'Warna Latar')}>
                              <span className="text-[10px]">{l("底色","Background","Latar")}</span>
                              <input
                                type="color"
                                className="w-5 h-5 rounded cursor-pointer border"
                                value={card.color || '#ffffff'}
                                onChange={(e) => handleCardFieldChange(idx, { color: e.target.value })}
                              />
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer" title={l('品名文字颜色', 'Title Text Color', 'Warna Judul')}>
                              <span className="text-[10px]">{l("字色","Text","Teks")}</span>
                              <input
                                type="color"
                                className="w-5 h-5 rounded cursor-pointer border"
                                value={card.titleColor || '#ffffff'}
                                onChange={(e) => handleCardFieldChange(idx, { titleColor: e.target.value })}
                              />
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer" title={l('胶囊底色', 'Capsule Bg', 'Warna Kapsul')}>
                              <span className="text-[10px]">{l("胶囊","Pill","Kapsul")}</span>
                              <input
                                type="color"
                                className="w-5 h-5 rounded cursor-pointer border"
                                value={card.pillBg || '#ffffff'}
                                onChange={(e) => handleCardFieldChange(idx, { pillBg: e.target.value })}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: POSITIONS & LAYOUT (Custom Positions of Title, Price, Badge, Alignment) */}
          {activeTab === 'positions' && (
            <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
              <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <MoveHorizontal className="w-4 h-4 text-indigo-500" />
                {l('元素位置与排版定制', 'Element Positions & Alignment', 'Kustomisasi Posisi & Tata Letak')}
              </label>

              {/* 1. Card Layout Mode */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 block">
                  {l('卡片整体设计风格', 'Overall Card Design Style', 'Gaya Desain Kartu')}
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => updateDesign({ cardLayout: 'overlay', imageBleed: true, titlePosition: 'overlay' })}
                    className={`p-2.5 rounded-xl border font-bold text-left transition-all ${
                      design.cardLayout === 'overlay'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-400'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-bold">🌟 {l('文字悬浮在图片上', 'Text Overlay on Image', 'Teks Di Atas Gambar')}</div>
                    <p className="text-[10px] text-gray-500 font-normal mt-0.5">
                      {l('参考海报同款：通顶饮品大图 + 悬浮标题 + 底部清单价格', 'Full-bleed drink image with floating title and list prices', 'Gambar penuh dengan teks melayang')}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateDesign({ cardLayout: 'standard', imageBleed: false, titlePosition: 'top' })}
                    className={`p-2.5 rounded-xl border font-bold text-left transition-all ${
                      design.cardLayout === 'standard'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-400'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-bold">📦 {l('独立分层方块', 'Standard Boxed Stack', 'Kotak Terpisah Bertingkat')}</div>
                    <p className="text-[10px] text-gray-500 font-normal mt-0.5">
                      {l('顶部独立标题框 + 中间独立图片框 + 底部白色价格框', 'Separate header, middle picture, and bottom price box', 'Kotak terpisah atas, tengah, bawah')}
                    </p>
                  </button>
                </div>
              </div>

              {/* 2. Product Title Position */}
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 block">
                  {l('商品品名位置 (Title Position)', 'Product Title Position', 'Posisi Nama Produk')}
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'overlay', name: l('图片顶部悬浮', 'Top Overlay', 'Melayang Atas') },
                    { id: 'top', name: l('卡片顶部独立区', 'Top Header', 'Kotak Atas') },
                    { id: 'bottom', name: l('图片下方', 'Below Image', 'Bawah Gambar') },
                  ].map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => updateDesign({ titlePosition: pos.id as any })}
                      className={`p-2 rounded-lg border text-center font-semibold transition-all ${
                        (design.titlePosition || 'overlay') === pos.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {pos.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Price & Capsule Position */}
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 block">
                  {l('特价与胶囊位置 (Price / Capsule Position)', 'Price / Pill Position', 'Posisi Harga & Kapsul')}
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'bottom', name: l('卡片底部悬浮', 'Bottom Overlay', 'Melayang Bawah') },
                    { id: 'middle', name: l('居中悬浮', 'Center Overlay', 'Melayang Tengah') },
                    { id: 'top', name: l('顶部悬浮', 'Top Overlay', 'Melayang Atas') },
                  ].map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => updateDesign({ pricePosition: pos.id as any })}
                      className={`p-2 rounded-lg border text-center font-semibold transition-all ${
                        (design.pricePosition || 'bottom') === pos.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {pos.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Day Badge Position */}
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 block">
                  {l('底部星期/标签位置 (Badge Position)', 'Weekday Badge Position', 'Posisi Label Hari')}
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {[
                    { id: 'bottom_bar', name: l('底部通栏条', 'Bottom Bar', 'Bilah Bawah') },
                    { id: 'top_pill', name: l('顶部药丸', 'Top Pill', 'Kapsul Atas') },
                    { id: 'top_right_ribbon', name: l('右上角角标', 'Corner Ribbon', 'Pita Pojok') },
                    { id: 'hidden', name: l('隐藏不显', 'Hidden', 'Sembunyikan') },
                  ].map((bp) => (
                    <button
                      key={bp.id}
                      type="button"
                      onClick={() => updateDesign({ badgePosition: bp.id as any })}
                      className={`py-1.5 px-1 rounded-lg border text-center font-semibold text-[11px] transition-all ${
                        (design.badgePosition || 'bottom_bar') === bp.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {bp.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Horizontal Text Alignment */}
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 block">
                  {l('文字水平对齐方式', 'Text Horizontal Alignment', 'Perataan Teks')}
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'center', icon: AlignCenter, name: l('居中对齐', 'Center', 'Tengah') },
                    { id: 'left', icon: AlignLeft, name: l('靠左对齐', 'Left', 'Kiri') },
                    { id: 'right', icon: AlignRight, name: l('靠右对齐', 'Right', 'Kanan') },
                  ].map((al) => {
                    const Icon = al.icon
                    return (
                      <button
                        key={al.id}
                        type="button"
                        onClick={() => updateDesign({ textAlign: al.id as any })}
                        className={`p-2 rounded-lg border flex items-center justify-center gap-1.5 font-semibold transition-all ${
                          (design.textAlign || 'center') === al.id
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{al.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: COLORS & CAPSULES (Full Color Palette for Texts, Capsules, Badges, Screens) */}
          {activeTab === 'colors' && (
            <div className="space-y-4">
              {/* Presets Quick Theme */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Sun className="w-4 h-4 text-purple-500" />
                  {l('一键主题色彩预设', 'Quick Color Palette Presets', 'Preset Tema Warna')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {THEME_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      onClick={() => applyThemePreset(preset)}
                      className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                        design.themePreset === preset.id
                          ? 'border-purple-500 bg-purple-50/60 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xs font-bold text-gray-800">
                        {[preset.nameZh, preset.nameEn, preset.nameId][language] || preset.nameZh}
                      </span>
                      <div className="flex items-center gap-1">
                        {preset.cardColors.slice(0, 3).map((col, ci) => (
                          <div key={ci} className="w-3 h-3 rounded-full border border-black/10 shadow-xs" style={{ backgroundColor: col }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Text Colors Palette */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-purple-500" />
                  {l('文字色彩自主定制 (Text Colors)', 'Text Colors Customization', 'Warna Teks Bebas')}
                </label>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Product Title Color */}
                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">
                      {l('商品名称字色', 'Product Title Color', 'Warna Judul Produk')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-7 h-7 rounded border cursor-pointer"
                        value={design.titleColor?.startsWith('#') ? design.titleColor : '#ffffff'}
                        onChange={(e) => updateDesign({ titleColor: e.target.value })}
                      />
                      <span className="font-mono text-gray-600">{design.titleColor || '#ffffff'}</span>
                    </div>
                  </div>

                  {/* Special Price Color */}
                  <div>
                    <label className="font-semibold text-red-600 block mb-1">
                      {l('特惠价格字色', 'Special Price Color', 'Warna Harga Spesial')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-7 h-7 rounded border cursor-pointer"
                        value={design.priceColor || '#FF2E63'}
                        onChange={(e) => updateDesign({ priceColor: e.target.value })}
                      />
                      <span className="font-mono text-gray-600">{design.priceColor || '#FF2E63'}</span>
                    </div>
                  </div>

                  {/* Normal Price Color */}
                  <div>
                    <label className="font-semibold text-gray-600 block mb-1">
                      {l('原价参考字色', 'Normal Price Color', 'Warna Harga Normal')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-7 h-7 rounded border cursor-pointer"
                        value={design.normalPriceColor?.startsWith('#') ? design.normalPriceColor : '#e2e8f0'}
                        onChange={(e) => updateDesign({ normalPriceColor: e.target.value })}
                      />
                      <span className="font-mono text-gray-600">{design.normalPriceColor || '#e2e8f0'}</span>
                    </div>
                  </div>

                  {/* Saving Amount Color */}
                  <div>
                    <label className="font-semibold text-pink-600 block mb-1">
                      {l('立省金额字色', 'Saving Text Color', 'Warna Teks Hemat')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-7 h-7 rounded border cursor-pointer"
                        value={design.savingColor || '#f472b6'}
                        onChange={(e) => updateDesign({ savingColor: e.target.value })}
                      />
                      <span className="font-mono text-gray-600">{design.savingColor || '#f472b6'}</span>
                    </div>
                  </div>

                  {/* Headline Color */}
                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">
                      {l('海报大标题颜色', 'Headline Color', 'Warna Judul Utama')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-7 h-7 rounded border cursor-pointer"
                        value={design.headlineColor || config.themeColor || '#FF4B72'}
                        onChange={(e) => updateDesign({ headlineColor: e.target.value })}
                      />
                      <span className="font-mono text-gray-600">{design.headlineColor || '#FF4B72'}</span>
                    </div>
                  </div>

                  {/* TV Screen Background */}
                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">
                      {l('电视背景全屏底色', 'TV Screen Global Bg', 'Latar TV Global')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-7 h-7 rounded border cursor-pointer"
                        value={config.backgroundColor || '#121214'}
                        onChange={(e) => update({ backgroundColor: e.target.value })}
                      />
                      <span className="font-mono text-gray-600">{config.backgroundColor || '#121214'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Capsule & Pill Colors Palette */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-pink-500" />
                  {l('价格胶囊与底部徽章颜色 (Capsule & Badge)', 'Capsule & Badge Colors', 'Warna Kapsul & Lencana')}
                </label>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Capsule Background */}
                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">
                      {l('价格胶囊底色', 'Capsule Bg Color', 'Warna Latar Kapsul')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-7 h-7 rounded border cursor-pointer"
                        value={design.priceBoxBg?.startsWith('#') ? design.priceBoxBg : '#ffffff'}
                        onChange={(e) => updateDesign({ priceBoxBg: e.target.value })}
                      />
                      <span className="font-mono text-gray-600">{design.priceBoxBg || '#ffffff'}</span>
                    </div>
                  </div>

                  {/* Capsule Radius */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-gray-700">{l('胶囊圆角弧度', 'Capsule Radius', 'Sudut Kapsul')}</label>
                      <span className="font-mono text-pink-600 font-bold">{design.priceBoxRadius ?? 12}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="24"
                      className="w-full accent-pink-600"
                      value={design.priceBoxRadius ?? 12}
                      onChange={(e) => updateDesign({ priceBoxRadius: Number(e.target.value) })}
                    />
                  </div>

                  {/* Day Badge / Footer Bar Background */}
                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">
                      {l('底部星期/标签底色', 'Day Badge / Footer Bg', 'Warna Latar Hari')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-7 h-7 rounded border cursor-pointer"
                        value={design.dayBadgeBg || 'rgba(71, 85, 105, 0.95)'}
                        onChange={(e) => updateDesign({ dayBadgeBg: e.target.value })}
                      />
                      <span className="font-mono text-gray-600">{design.dayBadgeBg || 'Default'}</span>
                    </div>
                  </div>

                  {/* Day Badge Text Color */}
                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">
                      {l('底部星期/标签字色', 'Day Badge Text Color', 'Warna Teks Hari')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-7 h-7 rounded border cursor-pointer"
                        value={design.dayBadgeColor || '#ffffff'}
                        onChange={(e) => updateDesign({ dayBadgeColor: e.target.value })}
                      />
                      <span className="font-mono text-gray-600">{design.dayBadgeColor || '#ffffff'}</span>
                    </div>
                  </div>
                </div>

                {/* Price Display Format */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5">
                    {l('价格展现形态', 'Price Style Mode', 'Bentuk Gaya Harga')}
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => updateDesign({ priceStyle: 'list' })}
                      className={`p-2 rounded-lg border text-left font-semibold transition-all ${
                        (design.priceStyle ?? 'list') === 'list'
                          ? 'border-pink-500 bg-pink-50 text-pink-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-bold">📋 {l('3 行对比清单 (推荐)', '3-Line List (Reference)', 'Daftar 3 Baris')}</div>
                      <p className="text-[10px] text-gray-500 font-normal mt-0.5">
                        Harga Normal / Spesial / Hemat 对齐排版
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateDesign({ priceStyle: 'pill' })}
                      className={`p-2 rounded-lg border text-left font-semibold transition-all ${
                        design.priceStyle === 'pill'
                          ? 'border-pink-500 bg-pink-50 text-pink-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-bold">💊 {l('独立药丸胶囊', 'Floating Pill Capsule', 'Kapsul Melayang')}</div>
                      <p className="text-[10px] text-gray-500 font-normal mt-0.5">
                        白底或半透圆角胶囊容器
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: EFFECTS & STROKES (Neon Glow, Stroke, Shadows, Borders, Scrim) */}
          {activeTab === 'effects' && (
            <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
              <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-pink-500" />
                {l('视觉特效与描边发光 (Custom Effects)', 'Visual Effects & Polish', 'Efek & Bayangan Visual')}
              </label>

              {/* Text Glow & Stroke */}
              <div className="space-y-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                <div className="font-bold text-gray-800">{l('文字强化与防背景反光', 'Text Glow & Anti-Glare', 'Cahaya & Stroke Teks')}</div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={design.textGlow !== false}
                      onChange={(e) => updateDesign({ textGlow: e.target.checked })}
                      className="rounded text-pink-600"
                    />
                    <span>{l('霓虹文字发光 (Neon Glow)', 'Text Neon Glow', 'Cahaya Neon Teks')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={design.textStroke !== false}
                      onChange={(e) => updateDesign({ textStroke: e.target.checked })}
                      className="rounded text-pink-600"
                    />
                    <span>{l('文字深色描边 (Stroke)', 'Text Stroke', 'Stroke Garis Teks')}</span>
                  </label>
                </div>

                {/* Stroke Color & Width */}
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-200/60">
                  <div>
                    <label className="text-[11px] text-gray-600 block mb-1">{l('描边颜色', 'Stroke Color', 'Warna Stroke')}</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        className="w-6 h-6 rounded border cursor-pointer"
                        value={design.textStrokeColor || '#ff2e63'}
                        onChange={(e) => updateDesign({ textStrokeColor: e.target.value })}
                      />
                      <span className="font-mono text-[11px] text-gray-600">{design.textStrokeColor || '#ff2e63'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-600 block mb-1">{l('描边粗细', 'Stroke Width', 'Tebal Stroke')}</label>
                    <select
                      className="input w-full text-xs py-1 px-1.5 bg-white"
                      value={design.textStrokeWidth ?? 1}
                      onChange={(e) => updateDesign({ textStrokeWidth: Number(e.target.value) })}
                    >
                      <option value="0.5">0.5 px (细微)</option>
                      <option value="1">1.0 px (适中清晰)</option>
                      <option value="2">2.0 px (粗体重彩)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Scrim Opacity Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700">
                    {l('背景防眩光渐变浓度 (Gradient Scrim)', 'Gradient Scrim Opacity', 'Kepekatan Gradasi Bayangan')}
                  </span>
                  <span className="font-mono text-pink-600 font-bold">{design.overlayGradientOpacity ?? 70}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  className="w-full accent-pink-600"
                  value={design.overlayGradientOpacity ?? 70}
                  onChange={(e) => updateDesign({ overlayGradientOpacity: Number(e.target.value) })}
                />
                <p className="text-[10px] text-gray-500">
                  {l('文字下方渐变黑影浓度，数值越高文字越醒目易读', 'Darker scrim ensures text is ultra-legible on bright drink photos', 'Meningkatkan keterbacaan teks')}
                </p>
              </div>

              {/* Card Border & Shadow */}
              <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
                <label className="font-semibold text-gray-700 block">
                  {l('卡片外边框样式 (Card Border)', 'Card Border Style', 'Garis Tepi Kartu')}
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'solid', name: l('实线', 'Solid', 'Padat') },
                    { id: 'dashed', name: l('虚线', 'Dashed', 'Putus') },
                    { id: 'glow', name: l('霓虹边', 'Glow', 'Neon') },
                    { id: 'none', name: l('无边框', 'None', 'Tanpa') },
                  ].map((bs) => (
                    <button
                      key={bs.id}
                      type="button"
                      onClick={() => updateDesign({ cardBorderStyle: bs.id as any })}
                      className={`py-1.5 px-1 rounded-lg border text-center font-semibold text-[11px] transition-all ${
                        (design.cardBorderStyle || 'solid') === bs.id
                          ? 'border-pink-500 bg-pink-50 text-pink-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {bs.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shadow Depth */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-semibold text-gray-700 block">
                  {l('卡片悬浮立体投影 (Shadow Depth)', 'Card Shadow Depth', 'Ketebalan Bayangan')}
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {[
                    { id: 'none', name: l('无投影', 'None', 'None') },
                    { id: 'soft', name: l('柔和', 'Soft', 'Lembut') },
                    { id: 'medium', name: l('立体适中', 'Medium', 'Sedang') },
                    { id: 'deep', name: l('深邃悬浮', 'Deep', 'Tebal') },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => updateDesign({ cardShadow: s.id as any })}
                      className={`py-1.5 px-1 rounded-lg border text-center font-semibold text-[11px] transition-all ${
                        (design.cardShadow || 'medium') === s.id
                          ? 'border-pink-500 bg-pink-50 text-pink-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Smart Today Highlight Effect */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 block">
                  {l('当天活动卡片高亮动效 (Today Focus Mode)', 'Today Focus Mode', 'Sorotan Hari Ini')}
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {[
                    { id: 'popout', name: l('🚀 浮起上移', 'Pop-out', 'Mengapung') },
                    { id: 'glow', name: l('💡 霓虹光晕', 'Glow', 'Cahaya') },
                    { id: 'ribbon', name: l('🏷️ 缎带角标', 'Ribbon', 'Pita') },
                    { id: 'border_only', name: l('🔲 加粗边框', 'Border', 'Garis') },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => updateDesign({ highlightMode: m.id as any })}
                      className={`py-1.5 px-1 rounded-lg border text-center font-semibold text-[11px] transition-all ${
                        (design.highlightMode ?? 'popout') === m.id
                          ? 'border-pink-500 bg-pink-50 text-pink-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: IMAGE AREA (Full Bleed, Coverage, Height Ratio Slider) */}
          {activeTab === 'image' && (
            <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
              <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-emerald-500" />
                {l('产品图片铺满与比例控制', 'Product Image Display & Coverage', 'Area Gambar Produk')}
              </label>

              {/* Image Bleed vs Inset */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 block">
                  {l('图片铺满方式 (Image Coverage)', 'Image Coverage Mode', 'Mode Luas Gambar')}
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => updateDesign({ imageBleed: true, cardLayout: 'overlay' })}
                    className={`p-2.5 rounded-xl border font-bold text-left transition-all ${
                      design.imageBleed !== false
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-400'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-bold">🖼️ {l('无缝铺满整个卡片', 'Full Bleed Coverage', 'Penuh Menutupi Kartu')}</div>
                    <p className="text-[10px] text-gray-500 font-normal mt-0.5">
                      {l('零内缩、零白边，图片 100% 顶边填满整张卡片', '0 margin, 0 padding, image expands to full card edge', 'Gambar menutup penuh tepi')}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateDesign({ imageBleed: false, cardLayout: 'standard' })}
                    className={`p-2.5 rounded-xl border font-bold text-left transition-all ${
                      design.imageBleed === false
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-400'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-bold">📦 {l('独立内缩方框', 'Inset Box', 'Kotak Terpisah')}</div>
                    <p className="text-[10px] text-gray-500 font-normal mt-0.5">
                      {l('居中内缩方块，四周保留卡片底色内边距', 'Standard boxed container with padding around image', 'Gambar di dalam kotak')}
                    </p>
                  </button>
                </div>
              </div>

              {/* Image Height Ratio */}
              <div className="space-y-1 pt-1 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700">
                    {l('图片高度占比 (Height Ratio)', 'Image Height Ratio', 'Proporsi Tinggi Gambar')}
                  </span>
                  <span className="font-mono text-emerald-600 font-bold">{design.imageHeightRatio ?? 75}%</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  className="w-full accent-emerald-600"
                  value={design.imageHeightRatio ?? 75}
                  onChange={(e) => updateDesign({ imageHeightRatio: Number(e.target.value) })}
                />
                <p className="text-[10px] text-gray-500">
                  {l('拖动滑块可增大饮品实物图片高度，最大可达 100% 满屏', 'Slide up to 100% for full-screen photo height', 'Atur hingga 100% untuk gambar penuh')}
                </p>
              </div>

              {/* Image Fit */}
              <div className="space-y-1.5 pt-1 border-t border-gray-100 text-xs">
                <label className="font-semibold text-gray-700 block">
                  {l('图片填充剪裁模式 (Object Fit)', 'Image Fit Mode', 'Mode Potong Gambar')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cover', name: l('Cover (裁切满格)', 'Cover', 'Penuh') },
                    { id: 'contain', name: l('Contain (完整保留)', 'Contain', 'Muat') },
                    { id: 'fill', name: l('Fill (拉伸填满)', 'Fill', 'Isi') },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => updateDesign({ imageFit: f.id as any })}
                      className={`p-2 rounded-lg border text-center font-semibold transition-all ${
                        (design.imageFit || 'cover') === f.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SPACING & FONT SIZES */}
          {activeTab === 'spacing' && (
            <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
              <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Type className="w-4 h-4 text-amber-500" />
                {l('字号尺寸与间距边距', 'Font Sizes & Spacing', 'Ukuran Font & Jarak')}
              </label>

              <div className="grid grid-cols-2 gap-3">{([['headlineFontSize',l('主标题字号','Headline size','Ukuran judul utama'),55],['subheadlineFontSize',l('副标题字号','Subheadline size','Ukuran subjudul'),23]] as const).map(([key,label,defaultValue])=><label key={key} className="text-xs">{label}<input type="number" className="input" min={0} max={300} value={design[key]??defaultValue} onChange={e=>updateDesign({[key]:Math.max(0,Math.min(300,Number(e.target.value)))})}/></label>)}</div>
              {/* Card Gap */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700">{l('卡片横向间距 (Gap)', 'Card Gap', 'Jarak Antar Kartu')}</span>
                  <span className="font-mono text-amber-600 font-bold">{design.cardGap ?? 14} px</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="36"
                  className="w-full accent-amber-600"
                  value={design.cardGap ?? 14}
                  onChange={(e) => updateDesign({ cardGap: Number(e.target.value) })}
                />
              </div>

              {/* Card Border Radius */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700">{l('卡片外框圆角 (Radius)', 'Card Radius', 'Sudut Kartu')}</span>
                  <span className="font-mono text-amber-600 font-bold">{design.cardBorderRadius ?? 16} px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="32"
                  className="w-full accent-amber-600"
                  value={design.cardBorderRadius ?? 16}
                  onChange={(e) => updateDesign({ cardBorderRadius: Number(e.target.value) })}
                />
              </div>

              {/* Title Font Size */}
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700">{l('品名字号大小', 'Product Title Size', 'Ukuran Judul Produk')}</span>
                  <span className="font-mono text-indigo-600 font-bold">{design.titleFontSize ?? 24} px</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="40"
                  className="w-full accent-indigo-600"
                  value={design.titleFontSize ?? 24}
                  onChange={(e) => updateDesign({ titleFontSize: Number(e.target.value) })}
                />
              </div>

              {/* Price Font Size */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700">{l('特惠价格字号', 'Special Price Size', 'Ukuran Harga Spesial')}</span>
                  <span className="font-mono text-red-600 font-bold">{design.priceFontSize ?? 36} px</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="56"
                  step="2"
                  className="w-full accent-red-600"
                  value={design.priceFontSize ?? 36}
                  onChange={(e) => updateDesign({ priceFontSize: Number(e.target.value) })}
                />
              </div>

              {/* Fields Display Checklist */}
              <div className="pt-2 border-t border-gray-100">
                <label className="text-xs font-bold text-gray-800 block mb-2">
                  {l('信息项显隐开关', 'Field Visibility Toggles', 'Pengaturan Tampilan Data')}
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showFields?.productImage ?? true}
                      onChange={(e) => updateField('productImage', e.target.checked)}
                    />
                    {l('商品大图', 'Product Image', 'Gambar')}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showFields?.productName ?? true}
                      onChange={(e) => updateField('productName', e.target.checked)}
                    />
                    {l('商品名称', 'Product Name', 'Nama')}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showFields?.originalPrice ?? true}
                      onChange={(e) => updateField('originalPrice', e.target.checked)}
                    />
                    {l('原价 (Normal)', 'Original Price', 'Normal')}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showFields?.specialPrice ?? true}
                      onChange={(e) => updateField('specialPrice', e.target.checked)}
                    />
                    {l('特价 (Spesial)', 'Special Price', 'Spesial')}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showFields?.savingAmount ?? true}
                      onChange={(e) => updateField('savingAmount', e.target.checked)}
                    />
                    {l('立省标签 (Hemat)', 'Saving Amount', 'Hemat')}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showFields?.dayBadge ?? true}
                      onChange={(e) => updateField('dayBadge', e.target.checked)}
                    />
                    {l('周期标签 (Day)', 'Day Badge', 'Hari')}
                  </label>
                </div>
              </div>
            </div>
          )}
          <details className="bg-white border rounded-xl p-3">
            <summary className="font-semibold text-sm cursor-pointer">{l('高级尺寸与显示设置','Advanced sizes & visibility','Ukuran & tampilan lanjutan')}</summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
              {([
                ['normalPriceFontSize',l('原价字号','Original price size','Ukuran harga normal'),14,0,300],
                ['savingFontSize',l('节省金额字号','Savings size','Ukuran hemat'),13,0,300],
                ['dayBadgeFontSize',l('标签字号','Badge size','Ukuran label'),20,0,300],
                ['containerPaddingX',l('画布左右留白','Canvas side padding','Jarak sisi kanvas'),20,0,100],
                ['containerPaddingY',l('画布上下留白','Canvas vertical padding','Jarak vertikal kanvas'),16,0,100],
                ['cardPadding',l('卡片内边距','Card padding','Jarak dalam kartu'),0,0,50],
                ['imagePadding',l('图片留白','Image padding','Jarak gambar'),0,0,50],
                ['imageBorderRadius',l('图片圆角','Image corners','Sudut gambar'),16,0,50],
                ['cardBorderWidth',l('边框粗细','Border width','Tebal bingkai'),1,0,12],
                ['highlightScale',l('当天放大倍数','Today scale','Skala hari ini'),1.04,1,1.15],
              ] as const).map(([key,label,defaultValue,min,max])=><label className="text-xs" key={key}>{label}<input type="number" className="input" min={Math.min(min,design[key]??defaultValue)} max={Math.max(max,design[key]??defaultValue)} step="any" value={design[key]??defaultValue} onChange={e=>updateDesign({[key]:Math.max(min,Math.min(max,Number(e.target.value)))})}/></label>)}
              <label className="text-xs">{l('字体','Font family','Jenis font')}<select className="input" value={design.fontStyle||'sans'} onChange={e=>updateDesign({fontStyle:e.target.value as PosterDesignConfig['fontStyle']})}><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>
              <label className="text-xs">{l('价格框阴影','Price box shadow','Bayangan kotak harga')}<select className="input" value={design.priceBoxShadow||'medium'} onChange={e=>updateDesign({priceBoxShadow:e.target.value as PosterDesignConfig['priceBoxShadow']})}><option value="none">{l('无','None','Tidak ada')}</option><option value="soft">{l('柔和','Soft','Lembut')}</option><option value="medium">{l('中等','Medium','Sedang')}</option></select></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.showFields?.productSubname!==false} onChange={e=>updateField('productSubname',e.target.checked)}/>{l('显示规格副标题','Show size subtitle','Tampilkan subjudul ukuran')}</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!config.showFields?.discountTag} onChange={e=>updateField('discountTag',e.target.checked)}/>{l('显示折扣角标','Show discount tag','Tampilkan label diskon')}</label>
            </div>
          </details>
        </div>

        <div className="lg:col-span-7 min-w-0">
          <div className="lg:sticky lg:top-20 space-y-3">
            <div className="flex flex-wrap justify-between gap-2 items-center">
              <h4 className="font-semibold flex gap-2"><Eye size={16}/>{l('实际播放预览','Playback preview','Pratinjau pemutaran')}</h4>
              <select className="input w-auto text-xs" aria-label={l('画布比例','Canvas ratio','Rasio kanvas')} value={previewRatio} onChange={e=>{setPreviewRatio(e.target.value);if(config.freeform){const parts=e.target.value.split('/').map(Number);update({canvasWidth:parts[0]===9?1080:parts[0]===1?1080:1920,canvasHeight:parts[0]===9?1920:1080})}}}><option value="16 / 9">16:9</option><option value="9 / 16">9:16</option><option value="1 / 1">1:1</option></select>
            </div>
            <div className="flex flex-wrap gap-1">{DEFAULT_DAYS.map(day=><button type="button" className={`px-2 py-1 rounded text-xs ${previewDay===day.day?'bg-red-600 text-white':'bg-gray-100'}`} key={day.day} onClick={()=>setPreviewDay(day.day)}>{[day.labelZh,day.labelEn,day.labelId][language]}</button>)}</div>
            <PosterCanvasEditor language={language} page={previewPage} title={l('活动海报预览','Activity poster preview','Pratinjau poster aktivitas')} value={{...config,cardItems:currentCards}} selection={elementSelection} onSelect={setElementSelection} onBegin={()=>{setHistory(h=>[...h.slice(-29),config]);setFuture([])}} onDirectChange={onChange} aspectRatio={config.freeform?`${config.canvasWidth||1920} / ${config.canvasHeight||1080}`:previewRatio} html={renderActivityPoster({...activity,name:activityName,posterConfig:{...config,cardItems:currentCards},products},{language,day:previewDay,assetUrl:receiptMediaUrl,page:previewPage,aspectRatio:Number(previewRatio.split('/')[0])/Number(previewRatio.split('/')[1])})}/>

            {currentCards.length>(config.columns||5)*rowCount&&<button type="button" className="btn-secondary" onClick={()=>setPreviewPage(p=>p+1)}>{l('预览下一页','Preview next page','Pratinjau halaman berikutnya')}</button>}
            <p className="text-xs text-gray-500">{l('与电视和副屏共用同一渲染器。海报编辑不会修改优惠规则；发布后按实际活动时间播放。','Uses the same renderer as TV and customer displays. Poster edits do not change pricing rules; playback follows the activity schedule.','Renderer sama dengan TV dan layar pelanggan. Desain tidak mengubah aturan harga; tayang mengikuti jadwal aktivitas.')}</p>
          </div>
        </div>
      </div>
      {imageCard!==null&&<MediaPicker scene="tv" imagesOnly max={1} onClose={()=>setImageCard(null)} onSelect={assets=>{if(assets[0])handleCardFieldChange(imageCard,{imageUrl:assets[0].url,imageMode:'manual'});setImageCard(null)}}/>}
    </div>
  )
}
