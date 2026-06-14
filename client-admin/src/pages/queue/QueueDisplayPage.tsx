import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Ticket,
  Volume2,
  VolumeX,
  Clock,
  Users,
  RefreshCw
} from 'lucide-react'

interface QueueTicket {
  id: string
  ticketNumber: number
  status: 'waiting' | 'called' | 'served' | 'cancelled'
  customerName?: string
  orderCount?: number
  calledAt?: string
  servedAt?: string
  estimatedWait?: number
}

export function QueueDisplayPage() {
  const { t } = useTranslation()
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [currentNumber, setCurrentNumber] = useState<number>(0)
  const [displayQueue, setDisplayQueue] = useState<QueueTicket[]>([])

  const mockQueue: QueueTicket[] = [
    { id: 'Q001', ticketNumber: 45, status: 'served', orderCount: 2 },
    { id: 'Q002', ticketNumber: 46, status: 'served', orderCount: 1 },
    { id: 'Q003', ticketNumber: 47, status: 'called', customerName: 'Ahmad', orderCount: 3, calledAt: new Date().toISOString() },
    { id: 'Q004', ticketNumber: 48, status: 'waiting', orderCount: 2, estimatedWait: 5 },
    { id: 'Q005', ticketNumber: 49, status: 'waiting', orderCount: 1, estimatedWait: 10 },
    { id: 'Q006', ticketNumber: 50, status: 'waiting', orderCount: 4, estimatedWait: 15 },
    { id: 'Q007', ticketNumber: 51, status: 'waiting', orderCount: 2, estimatedWait: 20 },
    { id: 'Q008', ticketNumber: 52, status: 'waiting', orderCount: 1, estimatedWait: 25 },
  ]

  useEffect(() => {
    setDisplayQueue(mockQueue)
    const called = mockQueue.find(q => q.status === 'called')
    if (called) setCurrentNumber(called.ticketNumber)
  }, [])

  // Called numbers for display
  const calledNumbers = displayQueue
    .filter(q => q.status === 'called' || q.status === 'served')
    .slice(-5)
    .map(q => q.ticketNumber)

  // Waiting queue
  const waitingQueue = displayQueue.filter(q => q.status === 'waiting')

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-pink-50 to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Ticket className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('queue.queueTitle')}</h1>
              <p className="text-gray-500">{t('queue.queueSubtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 rounded-full">
              <Clock size={18} className="text-green-700" />
              <span className="text-green-700 font-medium">
                {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-3 rounded-full bg-gray-100 hover:bg-gray-200"
            >
              {soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Display */}
      <div className="flex-1 flex">
        {/* Current Called Number - Big Display */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <p className="text-gray-500 text-lg mb-2">{t('queue.nowServing')}</p>
          <div className="relative">
            <div className="w-64 h-64 bg-white rounded-3xl shadow-2xl flex items-center justify-center border-8 border-primary">
              <span className="text-8xl font-bold text-primary">
                {currentNumber || '--'}
              </span>
            </div>
            {/* Pulsing ring animation */}
            <div className="absolute inset-0 rounded-3xl border-4 border-primary animate-ping opacity-25" />
          </div>
          <p className="text-gray-500 mt-4 text-lg">
            {mockQueue.find(q => q.ticketNumber === currentNumber)?.customerName || t('queue.silakanKeKasir')}
          </p>
        </div>

        {/* Side Panel - Called History & Waiting */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          {/* Recently Called */}
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-bold text-gray-900 mb-3">{t('queue.recentlyServed')}</h2>
            <div className="flex gap-2">
              {calledNumbers.slice(0, 5).map((num, idx) => (
                <div
                  key={idx}
                  className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg ${
                    num === currentNumber
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {num}
                </div>
              ))}
            </div>
          </div>

          {/* Waiting Queue */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-900">{t('queue.waitingList')}</h2>
              <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                {waitingQueue.length} {t('queue.nomor')}
              </span>
            </div>
            <div className="space-y-2">
              {waitingQueue.slice(0, 8).map((ticket, idx) => (
                <div
                  key={ticket.id}
                  className={`flex items-center justify-between p-3 rounded-xl ${
                    idx === 0 ? 'bg-orange-50 border-2 border-orange-300' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${
                      idx === 0 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {ticket.ticketNumber}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">
                        {ticket.customerName || `${t('queue.queueNumber')} #${ticket.ticketNumber}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {ticket.orderCount} {t('queue.item')} • ~{ticket.estimatedWait} {t('queue.minutes')}
                      </p>
                    </div>
                  </div>
                  {idx === 0 && (
                    <span className="px-2 py-1 bg-orange-500 text-white rounded-full text-xs font-medium">
                      {t('queue.berikut')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Users size={16} />
              {t('queue.totalDilayaniHariIni')}: 46
            </span>
            <span>|</span>
            <span>{t('queue.avgWaitTimeMinutes')}: 12 {t('queue.minutes')}</span>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw size={14} />
            <span>{t('queue.lastUpdated')}: {new Date().toLocaleTimeString('id-ID')}</span>
          </div>
        </div>
      </footer>

    </div>
  )
}