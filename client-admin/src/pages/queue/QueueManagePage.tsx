import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Ticket,
  Plus,
  Bell,
  Volume2,
  VolumeX,
  ChevronRight,
  CheckCircle,
  XCircle
} from 'lucide-react'

interface QueueTicket {
  id: string
  ticketNumber: number
  status: 'waiting' | 'called' | 'served' | 'cancelled'
  customerName?: string
  phone?: string
  orderCount?: number
  createdAt: string
}

export function QueueManagePage() {
  const { t } = useTranslation()
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [nextNumber, setNextNumber] = useState<number>(53)
  const [tickets, setTickets] = useState<QueueTicket[]>([
    { id: 'Q001', ticketNumber: 47, status: 'served', customerName: 'Ahmad', orderCount: 2, createdAt: new Date(Date.now() - 30 * 60000).toISOString() },
    { id: 'Q002', ticketNumber: 48, status: 'served', customerName: 'Siti', orderCount: 1, createdAt: new Date(Date.now() - 25 * 60000).toISOString() },
    { id: 'Q003', ticketNumber: 49, status: 'waiting', customerName: 'Budi', orderCount: 3, createdAt: new Date(Date.now() - 15 * 60000).toISOString() },
    { id: 'Q004', ticketNumber: 50, status: 'waiting', orderCount: 2, createdAt: new Date(Date.now() - 10 * 60000).toISOString() },
    { id: 'Q005', ticketNumber: 51, status: 'waiting', orderCount: 1, createdAt: new Date(Date.now() - 5 * 60000).toISOString() },
    { id: 'Q006', ticketNumber: 52, status: 'waiting', orderCount: 4, createdAt: new Date().toISOString() },
  ])

  // Get current called ticket
  const currentTicket = tickets.find(t => t.status === 'called')
  const waitingTickets = tickets.filter(t => t.status === 'waiting')

  // Generate new ticket
  const handleGenerateTicket = () => {
    const newTicket: QueueTicket = {
      id: `Q${nextNumber.toString().padStart(3, '0')}`,
      ticketNumber: nextNumber,
      status: 'waiting',
      orderCount: Math.floor(Math.random() * 3) + 1,
      createdAt: new Date().toISOString()
    }
    setTickets([...tickets, newTicket])
    setNextNumber(nextNumber + 1)
  }

  // Call next ticket
  const handleCallNext = () => {
    if (waitingTickets.length === 0) return

    const next = waitingTickets[0]
    setTickets(tickets.map(t =>
      t.id === next.id ? { ...t, status: 'called' } : t
    ))
  }

  // Mark as served
  const handleMarkServed = (ticketId: string) => {
    setTickets(tickets.map(t =>
      t.id === ticketId ? { ...t, status: 'served' } : t
    ))
  }

  // Cancel ticket
  const handleCancel = (ticketId: string) => {
    setTickets(tickets.map(t =>
      t.id === ticketId ? { ...t, status: 'cancelled' } : t
    ))
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
            <Ticket className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('queue.queueManagement')}</h1>
            <p className="text-gray-500">{t('queue.manage')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-3 rounded-xl ${soundEnabled ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
          </button>
          <button
            onClick={handleGenerateTicket}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-hover font-medium"
          >
            <Plus size={20} />
            {t('queue.createNew')} ({nextNumber})
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Called Ticket */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <h2 className="font-bold text-gray-900 mb-4">{t('queue.currentlyServing')}</h2>

            {currentTicket ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-primary rounded-2xl flex items-center justify-center">
                    <span className="text-4xl font-bold text-white">{currentTicket.ticketNumber}</span>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      {currentTicket.customerName || `${t('queue.nomor')} ${currentTicket.ticketNumber}`}
                    </p>
                    <p className="text-gray-500">{currentTicket.orderCount} {t('queue.item')}</p>
                    <p className="text-sm text-gray-400">
                      {t('queue.calledAt')} {new Date(currentTicket.createdAt).toLocaleTimeString('id-ID')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleMarkServed(currentTicket.id)}
                  className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 font-medium"
                >
                  <CheckCircle size={20} />
                  {t('queue.served')}
                </button>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Ticket size={48} className="mx-auto mb-4 opacity-50" />
                <p>{t('queue.noCustomerCalled')}</p>
              </div>
            )}
          </div>

          {/* Waiting Queue */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">{t('queue.waitingList')}</h2>
              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                {waitingTickets.length} {t('queue.nomor')}
              </span>
            </div>

            <div className="space-y-3">
              {waitingTickets.map((ticket, idx) => (
                <div
                  key={ticket.id}
                  className={`flex items-center justify-between p-4 rounded-xl ${
                    idx === 0 ? 'bg-orange-50 border-2 border-orange-300' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                      idx === 0 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {ticket.ticketNumber}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {ticket.customerName || `${t('queue.nomor')} ${ticket.ticketNumber}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {ticket.orderCount} {t('queue.item')} • {Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000)} {t('queue.minutesAgo')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {idx === 0 && (
                      <button
                        onClick={() => handleCallNext()}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium"
                      >
                        <Bell size={18} />
                        {t('queue.panggil')}
                      </button>
                    )}
                    <button
                      onClick={() => handleCancel(ticket.id)}
                      className="p-2 text-gray-400 hover:text-red-500"
                    >
                      <XCircle size={20} />
                    </button>
                  </div>
                </div>
              ))}

              {waitingTickets.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <p>{t('queue.noWaiting')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Side Panel - Stats & Actions */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <h3 className="font-bold text-gray-900 mb-4">{t('queue.quickActions')}</h3>
            <div className="space-y-3">
              <button
                onClick={handleCallNext}
                disabled={waitingTickets.length === 0}
                className="w-full flex items-center justify-between p-4 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                <span>{t('queue.callNext')}</span>
                <ChevronRight size={20} />
              </button>
              <button
                onClick={handleGenerateTicket}
                className="w-full flex items-center justify-between p-4 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 font-medium"
              >
                <span>{t('queue.createNew')}</span>
                <Plus size={20} />
              </button>
            </div>
          </div>

          {/* Today's Stats */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <h3 className="font-bold text-gray-900 mb-4">{t('queue.todayStats')}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{t('queue.totalServed')}</span>
                <span className="font-bold text-gray-900">46</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{t('queue.nowWaiting')}</span>
                <span className="font-bold text-orange-600">{waitingTickets.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{t('queue.avgWait')}</span>
                <span className="font-bold text-gray-900">12 {t('queue.minutes')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{t('queue.cancelled')}</span>
                <span className="font-bold text-red-600">3</span>
              </div>
            </div>
          </div>

          {/* Sound Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-border p-6">
            <h3 className="font-bold text-gray-900 mb-4">{t('queue.soundSettings')}</h3>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">{t('queue.notificationSound')}</span>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  soundEnabled ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    soundEnabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}