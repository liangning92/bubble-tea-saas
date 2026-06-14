import { Minus, Plus } from 'lucide-react'

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
  const availableChannels = channels.filter(ch => {
    if (ch.id === 'dine_in') return posLayout.channelDineIn
    if (ch.id === 'gofood') return posLayout.channelGoFood
    if (ch.id === 'grab') return posLayout.channelGrab
    if (ch.id === 'shopee') return posLayout.channelShopee
    return true
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">{t('pos.selectChannel') || '请选择销售渠道'}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('pos.selectChannelHint') || '选择后才能开始点单'}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {availableChannels.map(ch => (
            <button
              key={ch.id}
              onClick={() => onSelectChannel(ch)}
              className={`min-h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                selectedChannel?.id === ch.id
                  ? 'border-pink-500 bg-pink-50'
                  : 'border-gray-200 hover:border-pink-300'
              }`}
            >
              <span className="text-3xl">{ch.icon}</span>
              <span className="font-bold text-sm">{t(ch.nameKey)}</span>
            </button>
          ))}
        </div>

        {/* 堂食人数选择 */}
        {selectedChannel && selectedChannel.id === 'dine_in' && (
          <div className="mb-4 p-4 bg-orange-50 rounded-xl">
            <p className="text-sm font-medium text-gray-700 mb-3">{t('pos.dineInCount') || '堂食人数'}</p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => onDineInCountChange(Math.max(1, dineInCount - 1))}
                className="w-14 h-14 rounded-full bg-white border-2 border-gray-300 font-bold text-xl hover:border-pink-400 touch-feedback"
              >
                <Minus size={24} className="mx-auto" />
              </button>
              <span className="w-16 text-center text-3xl font-bold">{dineInCount}</span>
              <button
                onClick={() => onDineInCountChange(Math.min(20, dineInCount + 1))}
                className="w-14 h-14 rounded-full bg-pink-500 text-white font-bold text-xl hover:bg-pink-600 touch-feedback"
              >
                <Plus size={24} className="mx-auto" />
              </button>
            </div>
            <div className="mt-3">
              <input
                type="text"
                placeholder={t('pos.tableNumber') || '桌号(可选)'}
                value={tableNumber}
                onChange={(e) => onTableNumberChange(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-center"
              />
            </div>
          </div>
        )}

        {/* 外卖平台单号输入 */}
        {selectedChannel && (selectedChannel.id === 'gofood' || selectedChannel.id === 'grab' || selectedChannel.id === 'shopee') && (
          <div className="mb-4 p-4 bg-blue-50 rounded-xl">
            <p className="text-sm font-medium text-gray-700 mb-2">{t('pos.platformOrderId') || '平台订单号'}</p>
            <input
              type="text"
              placeholder={t('pos.platformOrderIdHint') || '请输入平台订单号'}
              value={platformOrderId}
              onChange={(e) => onPlatformOrderIdChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        )}

        <button
          onClick={onConfirm}
          disabled={!selectedChannel || (selectedChannel.id === 'dine_in' && dineInCount < 1)}
          className="w-full py-4 bg-green-500 text-white rounded-xl font-bold text-lg disabled:bg-gray-300 touch-feedback"
        >
          {t('pos.confirmChannel') || '确认开始点单'}
        </button>
      </div>
    </div>
  )
}