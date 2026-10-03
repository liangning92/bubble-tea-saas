import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface Channel {
  id: string
  nameKey: string
  icon: string
  code: string
}

interface PosLayout {
  channelDineIn: boolean
  channelGoFood: boolean
  channelGrab: boolean
  channelShopee: boolean
}

interface ChannelSelectModalProps {
  channels: Channel[]
  posLayout: PosLayout
  channelSettings: Record<string, { enabled: boolean }>
  selectedChannel: Channel | null
  onSelectChannel: (ch: Channel) => void
  dineInCount: number
  onDineInCountChange: (count: number) => void
  tableNumber: string
  onTableNumberChange: (value: string) => void
  platformOrderId: string
  onPlatformOrderIdChange: (value: string) => void
  onConfirm: () => void
  t: (key: string) => string
}

export function ChannelSelectModal({
  channels,
  posLayout,
  channelSettings,
  selectedChannel,
  onSelectChannel,
  dineInCount,
  onDineInCountChange,
  tableNumber,
  onTableNumberChange,
  platformOrderId,
  onPlatformOrderIdChange,
  onConfirm,
  t
}: ChannelSelectModalProps) {
  const [tableInput, setTableInput] = useState('')
  const [activeInput, setActiveInput] = useState<'count' | 'table'>('count')

  const availableChannels = channels.filter(ch => {
    // POS 是收银机终端本身而非顾客消费/销售渠道，不在渠道弹窗中显示
    if (ch.code === 'POS' || ch.id === 'pos' || (ch as any).name === 'POS收银') return false

    // Use ch.code (e.g., 'DINE_IN') to map to channelSettings key (e.g., 'dineIn')
    const codeToKeyMap: Record<string, string> = {
      'DINE_IN': 'dineIn',
      'GOFOOD': 'gofood',
      'GRAB': 'grab',
      'SHOPEE': 'shopee',
    }
    const codeToLayoutMap: Record<string, keyof PosLayout> = {
      'DINE_IN': 'channelDineIn',
      'GOFOOD': 'channelGoFood',
      'GRAB': 'channelGrab',
      'SHOPEE': 'channelShopee',
    }
    const adminKey = codeToKeyMap[ch.code]
    if (adminKey && channelSettings?.[adminKey]) {
      if (channelSettings[adminKey].enabled === false) return false
    }
    const layoutKey = codeToLayoutMap[ch.code]
    if (layoutKey && posLayout?.[layoutKey] === false) return false
    return true
  })

  useEffect(() => {
    if (!tableNumber && !tableInput) return
    if (tableNumber !== tableInput) {
      setTableInput(tableNumber)
    }
  }, [tableNumber])

  const handleNumberPad = (num: string) => {
    if (activeInput === 'count') {
      const current = dineInCount === 0 ? '' : String(dineInCount)
      const newValue = current + num
      const numVal = parseInt(newValue)
      if (!isNaN(numVal) && numVal > 0 && numVal <= 99) {
        onDineInCountChange(numVal)
      }
    } else {
      if (tableInput.length < 4) {
        const newValue = tableInput + num
        setTableInput(newValue)
        onTableNumberChange(newValue)
      }
    }
  }

  const handleBackspace = () => {
    if (activeInput === 'count') {
      const newCount = Math.floor(dineInCount / 10)
      onDineInCountChange(Math.max(1, newCount))
    } else {
      const newValue = tableInput.slice(0, -1)
      setTableInput(newValue)
      onTableNumberChange(newValue)
    }
  }

  const handleClear = () => {
    if (activeInput === 'count') {
      onDineInCountChange(1)
    } else {
      setTableInput('')
      onTableNumberChange('')
    }
  }

  const quickNumbers = [1, 2, 3, 4, 5, 10]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-white px-5 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">{t('settings.selectChannel')}</h2>
            <p className="text-xs text-white/70">{t('settings.selectChannelHint')}</p>
          </div>
          <button
            onClick={onConfirm}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20"
          >
            <X size={24} />
          </button>
        </div>

        {/* Channel Grid */}
        <div className="p-4">
          <div className="grid grid-cols-4 gap-3">
            {availableChannels.map(ch => {
              const codeToKeyMap: Record<string, string> = {
                'DINE_IN': 'dineIn',
                'GOFOOD': 'gofood',
                'GRAB': 'grab',
                'SHOPEE': 'shopee',
              }
              const adminKey = codeToKeyMap[ch.code]
              let customName = (ch as any).name || (adminKey && (channelSettings as any)?.[adminKey]?.name)
              const legacyMap: Record<string, string> = {
                '堂食': 'pos.dineIn',
                '外卖': 'pos.takeaway',
                '自提': 'pos.takeaway',
                '柜台': 'pos.counter',
              }
              if (!customName || legacyMap[customName] || customName === 'DINE_IN' || customName === 'GOFOOD' || customName === 'GRAB' || customName === 'SHOPEE') {
                if (customName && legacyMap[customName]) {
                  customName = (t as any)(legacyMap[customName]) || customName
                } else {
                  let k = (ch as any).nameKey || adminKey || ch.code
                  if (typeof k === 'string' && k.startsWith('pos.')) {
                    k = k.substring(4)
                  }
                  customName = t(`pos.${k}`) || t(`pos.channel.${k}`) || ch.code
                }
              }
              const customIcon = (ch as any).icon || (adminKey && (channelSettings as any)?.[adminKey]?.icon) || ch.icon
              return (
                <button
                  key={ch.id}
                  onClick={() => onSelectChannel(ch)}
                  className={`min-h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                    selectedChannel?.id === ch.id
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-3xl">{customIcon}</span>
                  <span className="text-xs font-medium text-gray-700">{customName}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Dine-in Options - 仅堂食显示 */}
        {selectedChannel && selectedChannel.code === 'DINE_IN' && (
          <div className="px-4 pb-4">
            <div className="bg-gray-50 rounded-xl p-4">
              {/* Tab切换 */}
              <div className="flex mb-4 bg-white rounded-lg p-1">
                <button
                  onClick={() => setActiveInput('count')}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeInput === 'count' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  👥 {t('pos.dineInCount')}
                </button>
                <button
                  onClick={() => setActiveInput('table')}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeInput === 'table' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  🪑 {t('pos.tableNumber')}
                </button>
              </div>

              {/* 当前值显示 */}
              <div className="bg-white rounded-lg py-3 mb-4 text-center border border-gray-200">
                <span className="text-4xl font-bold text-primary">
                  {activeInput === 'count' ? dineInCount : (tableInput || '-')}
                </span>
              </div>

              {/* 人数快捷按钮 */}
              {activeInput === 'count' && (
                <div className="flex gap-2 mb-4">
                  {quickNumbers.map(n => (
                    <button
                      key={n}
                      onClick={() => onDineInCountChange(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        dineInCount === n
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {/* 数字键盘 */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button
                    key={n}
                    onClick={() => handleNumberPad(String(n))}
                    className="py-3 rounded-lg bg-white border border-gray-300 text-lg font-medium hover:bg-gray-50 active:bg-gray-100"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={handleClear}
                  className="py-3 rounded-lg bg-gray-100 border border-gray-300 text-base font-medium hover:bg-gray-200"
                >
                  C
                </button>
                <button
                  onClick={() => handleNumberPad('0')}
                  className="py-3 rounded-lg bg-white border border-gray-300 text-lg font-medium hover:bg-gray-50"
                >
                  0
                </button>
                <button
                  onClick={handleBackspace}
                  className="py-3 rounded-lg bg-gray-100 border border-gray-300 text-base font-medium hover:bg-gray-200"
                >
                  ⌫
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 确认按钮 */}
        <div className="px-4 pb-4">
          <button
            onClick={onConfirm}
            disabled={!selectedChannel || (selectedChannel.code === 'DINE_IN' && dineInCount < 1)}
            className="w-full py-4 bg-primary text-white rounded-xl font-bold text-lg disabled:bg-gray-300 active:bg-primary/90 transition-colors"
          >
            {t('settings.confirmChannel')}
          </button>
        </div>
      </div>
    </div>
  )
}
