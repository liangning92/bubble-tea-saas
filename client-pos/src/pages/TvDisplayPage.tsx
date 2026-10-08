import { DEFAULT_TV_CONFIG as DEFAULT_CONFIG, normalizeTvConfig, TvScreenConfig as TVScreenConfig } from '../../../shared/utils/tvScreenConfig'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import { tvScreenApi } from '../services/api'
import { getApiUrl } from '../config'
const mediaUrl = (url: string) => url.startsWith('/uploads/') ? getApiUrl().replace(/\/api$/, '') + url : url
import { formatCurrency, playSound } from '../utils/helpers'
import { YOUME_LOGO_RED, YOUME_LOGO_WHITE } from '../assets/logo'
import { Sparkles, Trophy, Gift, Volume2, VolumeX, RefreshCw, Wifi, WifiOff, Clock } from 'lucide-react'

interface DailySpecial {
  dayOfWeek: number
  productName: string
  originalPrice: number
  specialPrice: number
  tag?: string
  imageUrl?: string
  description?: string
}

interface LotteryPrize {
  id: string
  name: string
  code?: string
  color: string
  weight?: number
}

const DAYS_NAME = ['Minggu (Sunday)', 'Senin (Monday)', 'Selasa (Tuesday)', 'Rabu (Wednesday)', 'Kamis (Thursday)', 'Jumat (Friday)', 'Sabtu (Saturday)']

export function TvDisplayPage() {
  const [searchParams] = useSearchParams()
  const storeId = searchParams.get('storeId') || localStorage.getItem('tv_store_id') || ''
  const displayToken = searchParams.get('displayToken') || ''

  // TV Configuration & State
  const [config, setConfig] = useState<TVScreenConfig>(() => {
    try {
      const cached = localStorage.getItem(`tv_screen_cache_${storeId}`)
      if (cached) return normalizeTvConfig(JSON.parse(cached))
    } catch (e) {
      // ignore
    }
    return DEFAULT_CONFIG
  })

  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [activeBannerIndex, setActiveBannerIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Lottery Modal & Animation State
  const [lotteryActive, setLotteryActive] = useState(false)
  const [lotteryData, setLotteryData] = useState<{
    orderNumber: string
    prizeName: string
    prizeIndex: number
    customerPhone?: string
  } | null>(null)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [showPrizeCelebration, setShowPrizeCelebration] = useState(false)

  const lotteryBusy = useRef(false)
  const pendingDraws = useRef<any[]>([])
  const lotteryTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const drawHandler = useRef<(data: any) => void>(() => {})
  useEffect(() => () => { lotteryTimers.current.forEach(clearTimeout); pendingDraws.current = [] }, [])

  // Clock interval
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Save storeId to local storage if provided
  useEffect(() => {
    if (storeId) {
      localStorage.setItem('tv_store_id', storeId)
    }
  }, [storeId])

  // Fetch remote TV config with offline fallback
  const fetchConfig = async () => {
    try {
      const res = await tvScreenApi.getConfig(storeId, displayToken)
      if (res.data?.data) {
        const fetched = res.data.data
        setConfig(normalizeTvConfig(fetched))
        localStorage.setItem(`tv_screen_cache_${storeId}`, JSON.stringify(fetched))
      }
    } catch (err) {
      console.warn('[TV Display] Network offline or API unreachable, using local cache:', err)
    }
  }

  useEffect(() => {
    fetchConfig()
    // Poll every 60 seconds as weak network resilience
    const pollTimer = setInterval(fetchConfig, 60000)
    return () => clearInterval(pollTimer)
  }, [storeId])

  // Hero Banners Carousel
  const activeBanners = useMemo(() => {
    return config.mediaFiles || []
  }, [config.mediaFiles])

  useEffect(() => {
    setActiveBannerIndex(0)
    if (activeBanners.length <= 1) return
    const interval = setInterval(() => {
      setActiveBannerIndex(prev => (prev + 1) % activeBanners.length)
    }, (config.carouselIntervalSeconds || 6) * 1000)
    return () => clearInterval(interval)
  }, [activeBanners, config.carouselIntervalSeconds])

  // Determine Today's Special Item
  const todayDayOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',weekday:'short'}).format(currentTime))
  const todaySpecial = useMemo(() => {
    const match = config.dailySpecials?.find(s => s.dayOfWeek === todayDayOfWeek)
    return match
  }, [config.dailySpecials, todayDayOfWeek])

  // Tomorrow's preview
  const tomorrowDayOfWeek = (todayDayOfWeek + 1) % 7
  const tomorrowSpecial = useMemo(() => {
    return config.dailySpecials?.find(s => s.dayOfWeek === tomorrowDayOfWeek)
  }, [config.dailySpecials, tomorrowDayOfWeek])

  // Setup Real-time WebSocket connection to backend
  useEffect(() => {
    const apiUrl = getApiUrl().replace(/\/api$/, '')
    const socket: Socket = io(apiUrl, {
      transports: ['websocket', 'polling'],
      auth: { clientType: 'tv', displayToken },
      reconnectionAttempts: 100,
      reconnectionDelay: 2000
    })

    socket.on('connect', () => {
      setIsConnected(true)
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    // Listen to live TV config changes made in Admin marketing page
    socket.on('tv:config:update', (data: any) => {
      if (data) {
        const updated = normalizeTvConfig(data.data || data)
        setConfig(updated)
        localStorage.setItem(`tv_screen_cache_${storeId}`, JSON.stringify(updated))
      }
    })

    // Listen to POS checkout lottery trigger
    socket.on('tv:lottery:trigger', (payload: any) => {
      const data = payload?.data || payload
      if (!data) return
      drawHandler.current(data)
    })

    return () => {
      socket.disconnect()
    }
  }, [storeId, config.lottery])

  // Trigger Lottery Spin Animation
  const triggerLotteryAnimation = (data: {
    orderNumber: string
    prizeName: string
    prizeIndex?: number
    customerPhone?: string
  }) => {
    const prizes = config.lottery?.prizes || DEFAULT_CONFIG.lottery.prizes
    if (!prizes.length || typeof data.prizeIndex !== 'number' || data.prizeIndex < 0 || data.prizeIndex >= prizes.length) return
    if (lotteryBusy.current) { pendingDraws.current.push(data); return }
    lotteryBusy.current = true
    const targetIndex = data.prizeIndex

    setLotteryData({
      orderNumber: data.orderNumber || '#Lucky',
      prizeName: data.prizeName,
      prizeIndex: targetIndex,
      customerPhone: data.customerPhone
    })

    setLotteryActive(true)
    setIsSpinning(true)
    setShowPrizeCelebration(false)

    // Calculate rotation:
    // Wheel has prizes.length segments (each segment = 360 / N degrees)
    // Pointer is at the top (270 or 0 deg).
    const segmentAngle = 360 / prizes.length
    // Center of target segment:
    const targetSegmentCenter = targetIndex * segmentAngle + segmentAngle / 2
    // We want target segment center to align with top pointer (0 deg / 360 deg)
    // Add 5-7 full spins (1800 - 2520 deg)
    const baseSpins = 360 * 5
    const finalAngle = baseSpins + (360 - targetSegmentCenter)

    // Reset rotation before spinning
    setWheelRotation(previous => Math.floor(previous / 360) * 360 + finalAngle)

    if (soundEnabled) {
      playSound('newOrder')
    }

    // Animation finishes in 4.5 seconds
    lotteryTimers.current.push(setTimeout(() => {
      setIsSpinning(false)
      setShowPrizeCelebration(true)
      if (soundEnabled) {
        playSound('orderComplete')
      }

      // Close celebration popup after 8 seconds and return to marketing screen
      lotteryTimers.current.push(setTimeout(() => {
        setLotteryActive(false)
        setShowPrizeCelebration(false)
        setLotteryData(null)
        lotteryBusy.current = false
        const next = pendingDraws.current.shift()
        if (next) drawHandler.current(next)
      }, 8000))
    }, 4500))
  }

  drawHandler.current = triggerLotteryAnimation

  const currentBanner = activeBanners[activeBannerIndex] || activeBanners[0]
  const splitRatio = config.layout?.columns?.[0]?.width || 60
  const prizes = config.lottery?.prizes || DEFAULT_CONFIG.lottery.prizes
  const numPrizes = prizes.length
  const segmentAngle = 360 / numPrizes

  if (!displayToken || !storeId) return <div className="h-screen flex items-center justify-center bg-slate-950 text-white">Buka tautan layar dari Pengaturan TV di Admin.</div>
  if (!config.enabled) return <div className="h-screen flex items-center justify-center bg-slate-950 text-white">{config.storeName} — Layar dinonaktifkan</div>
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-white select-none font-sans">
      {/* Top TV Header Bar */}
      <header className="h-16 px-8 flex items-center justify-between bg-gradient-to-r from-red-900/90 via-slate-900 to-red-950/90 border-b border-red-800/40 shadow-xl backdrop-blur-md z-10">
        <div className="flex items-center space-x-4">
          <img src={YOUME_LOGO_WHITE} alt="YOUME" className="h-10 object-contain drop-shadow-md" />
          <div className="border-l border-red-700/50 pl-4">
            <span className="text-xl font-black tracking-widest text-red-100 uppercase">{config.storeName}</span>
            <span className="ml-3 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-600/60 text-white border border-red-400/40">
              42&quot; Smart Store Edition
            </span>
          </div>
        </div>

        {/* Live Status & Clock */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-sm text-slate-300">
            {isConnected ? (
              <span className="inline-flex items-center text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-500/40">
                <Wifi className="w-4 h-4 mr-1.5 animate-pulse" /> Terhubung (Online)
              </span>
            ) : (
              <span className="inline-flex items-center text-amber-400 bg-amber-950/60 px-3 py-1 rounded-full border border-amber-500/40">
                <WifiOff className="w-4 h-4 mr-1.5" /> Mode Offline (Cache Aktif)
              </span>
            )}
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            title="Toggle Sound"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
          </button>

          <div className="text-right">
            <div className="text-2xl font-black text-amber-300 tracking-wider">
              {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs text-slate-400 font-medium">
              {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Split Screen Area */}
      <main className="flex w-full" style={{ height: config.ticker.enabled ? 'calc(100vh - 4rem - 3rem)' : 'calc(100vh - 4rem)' }}>
        {/* Left Column: Hero Posters & Brand Promotion */}
        <section
          className="relative h-full overflow-hidden flex flex-col justify-end p-10 border-r border-slate-800 transition-all duration-500"
          style={{ width: `${splitRatio}%` }}
        >
          {/* Background Poster Image with Smooth Fade */}
          <div className="absolute inset-0 z-0 bg-slate-900">
            {activeBanners.map((banner, index) => (
              <div
                key={banner.url}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  index === activeBannerIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
                }`}
                style={{ transition: 'opacity 1s ease-in-out, transform 8s ease' }}
              >
                <img
                  src={mediaUrl(banner.url)}
                  alt={banner.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden'
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-transparent to-slate-950/50" />
              </div>
            ))}
          </div>

          {/* Banner Captions & Floating Highlights */}
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-red-600/90 text-white text-sm font-bold tracking-wide shadow-lg border border-red-400/50">
              <Sparkles className="w-4 h-4 mr-2 text-amber-300 animate-spin" />
              PROMOSI SPESIAL HARI INI
            </div>
            <h1 className="text-4xl 2xl:text-5xl font-black text-white leading-tight drop-shadow-xl">
              {currentBanner?.title}
            </h1>
            <p className="text-lg 2xl:text-xl text-slate-200 font-medium line-clamp-2 drop-shadow-md">
              {currentBanner?.subtitle}
            </p>

            {/* Indicator Dots */}
            <div className="flex space-x-2 pt-4">
              {activeBanners.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === activeBannerIndex ? 'w-10 bg-amber-400' : 'w-2.5 bg-white/40'
                  }`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Daily Special & Lucky Wheel Promotion */}
        <section
          className="relative h-full overflow-hidden p-8 flex flex-col justify-between bg-gradient-to-b from-slate-900 to-slate-950"
          style={{ width: `${100 - splitRatio}%` }}
        >
          {/* Header of Right Side: Daily Special Card */}
          <div className="space-y-4 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
                <h2 className="text-xl 2xl:text-2xl font-black text-amber-400 tracking-wide uppercase">
                  ⭐ MENU SPESIAL HARI INI
                </h2>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {DAYS_NAME[todayDayOfWeek]}
              </span>
            </div>

            {/* Main Daily Special Spotlight Card */}
            {todaySpecial ? (
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-red-950/80 via-slate-900 to-red-900/40 border-2 border-red-500/40 p-6 shadow-2xl backdrop-blur-xl flex flex-col space-y-4">
              {todaySpecial.tag && (
                <div className="absolute top-4 right-4 bg-gradient-to-r from-red-600 to-amber-600 text-white text-xs font-black px-3 py-1 rounded-full shadow-md uppercase tracking-wider">
                  🔥 {todaySpecial.tag}
                </div>
              )}

              <div className="flex items-center space-x-5">
                <div className="relative w-36 h-36 2xl:w-44 2xl:h-44 rounded-2xl overflow-hidden shadow-xl border-2 border-amber-400/50 flex-shrink-0 bg-slate-800">
                  <img
                    src={todaySpecial.imageUrl || YOUME_LOGO_RED}
                    alt={todaySpecial.productName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-red-600 text-white text-[10px] font-black text-center py-0.5 uppercase tracking-wider">
                    HEMAT Rp {((todaySpecial.originalPrice - todaySpecial.specialPrice)).toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="flex-1 space-y-2">
                  <h3 className="text-xl 2xl:text-2xl font-black text-white leading-snug">
                    {todaySpecial.productName}
                  </h3>
                  <p className="text-xs 2xl:text-sm text-slate-300 line-clamp-2">
                    {todaySpecial.description || 'Pilihan terbaik kesegaran teh otentik YOUME'}
                  </p>

                  <div className="pt-2 flex items-baseline space-x-3">
                    <span className="text-3xl 2xl:text-4xl font-black text-amber-300 drop-shadow-md">
                      {formatCurrency(todaySpecial.specialPrice)}
                    </span>
                    <span className="text-sm 2xl:text-base text-slate-400 line-through decoration-red-500 font-semibold">
                      {formatCurrency(todaySpecial.originalPrice)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tomorrow's Sneak Peek Footer */}
              {tomorrowSpecial && (
                <div className="pt-3 border-t border-red-800/40 flex items-center justify-between text-xs text-slate-300">
                  <span className="text-slate-400">👀 Bocoran Besok ({DAYS_NAME[tomorrowDayOfWeek].split(' ')[0]}):</span>
                  <span className="font-bold text-amber-200">{tomorrowSpecial.productName} ➜ {formatCurrency(tomorrowSpecial.specialPrice)}</span>
                </div>
              )}
            </div>
            ) : <div className="p-5 text-slate-400">Belum ada promo untuk hari ini.</div>}

            {/* Lucky Wheel Mini Teaser / Participation Banner */}
            {config.lottery?.enabled && (
              <div className="rounded-2xl p-5 bg-gradient-to-r from-amber-600/30 via-red-900/40 to-amber-900/30 border border-amber-500/30 shadow-lg flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-red-500 flex items-center justify-center shadow-lg text-slate-950 font-black">
                    <Trophy className="w-6 h-6 text-slate-950" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-amber-300 uppercase tracking-wide">
                      {config.lottery.title}
                    </h4>
                    <p className="text-xs text-slate-200 font-medium">
                      {config.lottery.subtitle}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-md">
                    MIN {formatCurrency(config.lottery.triggerMinOrderAmount)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Bottom Marquee Ticker */}
      {config.ticker?.enabled && (
        <footer className="h-12 bg-red-950/95 border-t border-red-700/60 flex items-center overflow-hidden z-10 px-4 shadow-2xl">
          <div className="flex items-center px-4 bg-red-600 text-white text-xs font-black tracking-widest uppercase rounded py-1 mr-4 shadow-md flex-shrink-0">
            📢 PENGUMUMAN
          </div>
          <div className="overflow-hidden whitespace-nowrap flex-1">
            <div className="inline-block animate-marquee text-sm font-bold text-amber-200 tracking-wide">
              {config.ticker.text} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 🥤 YOUME TEA - FRESH EVERY MOMENT &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {config.ticker.text}
            </div>
          </div>
        </footer>
      )}

      {/* FULLSCREEN POPUP: LUCKY WHEEL LOTTERY MODAL */}
      {lotteryActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="relative max-w-4xl w-full mx-6 p-8 rounded-3xl bg-gradient-to-b from-slate-900 via-red-950 to-slate-950 border-4 border-amber-400 shadow-[0_0_80px_rgba(245,158,11,0.5)] text-center flex flex-col items-center">
            {/* Top Badge */}
            <div className="inline-flex items-center px-6 py-2 rounded-full bg-gradient-to-r from-amber-500 to-red-600 text-slate-950 text-lg font-black tracking-widest shadow-xl uppercase mb-4 animate-bounce">
              <Gift className="w-5 h-5 mr-2 text-slate-950" />
              {config.lottery?.title || 'PUTAR RODA HOKI'}
            </div>

            <div className="text-xl font-bold text-slate-200 mb-6">
              Nomor Pesanan: <span className="text-amber-400 font-black text-2xl">{lotteryData?.orderNumber}</span>
              {lotteryData?.customerPhone && <span className="ml-4 text-slate-400 text-base">({lotteryData.customerPhone})</span>}
            </div>

            {/* Lucky Wheel Graphic */}
            <div className="relative w-80 h-80 2xl:w-96 2xl:h-96 my-4 flex items-center justify-center">
              {/* Wheel Pointer Pin at Top Center */}
              <div className="absolute -top-4 z-20 w-0 h-0 border-x-[18px] border-x-transparent border-t-[36px] border-t-amber-300 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] filter" />

              {/* Rotating Wheel Container */}
              <div
                className="w-full h-full rounded-full border-8 border-amber-400 shadow-2xl relative overflow-hidden transition-transform ease-out"
                style={{
                  transform: `rotate(${wheelRotation}deg)`,
                  transitionDuration: isSpinning ? '4500ms' : '0ms',
                  transitionTimingFunction: 'cubic-bezier(0.15, 0.95, 0.35, 1)'
                }}
              >
                {/* Wheel SVG Segments */}
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                  {prizes.map((prize, idx) => {
                    const startAngle = idx * segmentAngle
                    const endAngle = (idx + 1) * segmentAngle
                    const startRad = (startAngle * Math.PI) / 180
                    const endRad = (endAngle * Math.PI) / 180
                    const x1 = 50 + 50 * Math.cos(startRad)
                    const y1 = 50 + 50 * Math.sin(startRad)
                    const x2 = 50 + 50 * Math.cos(endRad)
                    const y2 = 50 + 50 * Math.sin(endRad)
                    const largeArc = segmentAngle > 180 ? 1 : 0
                    const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`

                    return (
                      <path
                        key={prize.id}
                        d={pathData}
                        fill={prize.color || (idx % 2 === 0 ? '#DC2626' : '#F59E0B')}
                        stroke="#fff"
                        strokeWidth="0.5"
                      />
                    )
                  })}
                </svg>

                {/* Prize Labels around Wheel */}
                {prizes.map((prize, idx) => {
                  const angle = idx * segmentAngle + segmentAngle / 2
                  return (
                    <div
                      key={prize.id}
                      className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none"
                      style={{
                        transform: `rotate(${angle}deg)`,
                        transformOrigin: '50% 50%'
                      }}
                    >
                      <span className="text-white font-black text-xs 2xl:text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] max-w-[90px] truncate">
                        {prize.name}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Center Hub of the Wheel */}
              <div className="absolute z-10 w-20 h-20 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 border-4 border-slate-900 shadow-2xl flex items-center justify-center">
                <span className="font-black text-slate-950 text-sm tracking-wider">YOUME</span>
              </div>
            </div>

            {/* Spinning Indicator or Celebration Result */}
            {isSpinning ? (
              <div className="mt-4 text-2xl font-black text-amber-300 animate-pulse">
                🎲 SEDANG MEMUTAR KEBERUNTUNGAN...
              </div>
            ) : showPrizeCelebration ? (
              <div className="mt-4 space-y-3 animate-in zoom-in-75 duration-500">
                <div className="text-sm font-bold text-slate-300 uppercase tracking-widest">
                  SELAMAT KEPADA PELANGGAN! ANDA MEMENANGKAN:
                </div>
                <div className="text-4xl 2xl:text-5xl font-black text-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,0.8)]">
                  🎉 {lotteryData?.prizeName} 🎉
                </div>
                <p className="text-sm text-slate-300 font-medium">
                  Tunjukkan struk ini ke kasir untuk klaim hadiah Anda sekarang!
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Marquee CSS helper */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          display: inline-block;
          animation: marquee 35s linear infinite;
        }
      `}</style>
    </div>
  )
}
