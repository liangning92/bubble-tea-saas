import { tvEventsApi } from '../services/api'
import { activityEligible } from '../../../shared/utils/activities'
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
  const [searchParams,setSearchParams] = useSearchParams()
  const storeId = searchParams.get('storeId') || localStorage.getItem('tv_store_id') || ''
  const displayToken = searchParams.get('displayToken') || localStorage.getItem('tv_display_token_'+storeId) || ''
  const [authorizationExpired,setAuthorizationExpired]=useState(false)
  useEffect(()=>{const token=searchParams.get('displayToken');if(token&&storeId){localStorage.setItem('tv_display_token_'+storeId,token);setAuthorizationExpired(false);setSearchParams({storeId},{replace:true})}},[storeId,searchParams,setSearchParams])

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

  const [terminalId]=useState(()=>{const key='tv_terminal_id_'+storeId;let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id)}return id})
  const seenEvents=useRef(new Set<string>())
  const completedEvents=useRef<string[]>([])
  const displayEnabled=useRef(false)
  const remoteSound=useRef<boolean|null>(null)
  const [wheelPrizes,setWheelPrizes]=useState<any[]>([])
  const [activityIndex,setActivityIndex]=useState(0)
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

  const configVersion=useRef(0);configVersion.current=config.activityVersion||0
  const receiveDraw=useRef<(data:any)=>void>(()=>{})
  const refreshRef=useRef<()=>Promise<void>>(async()=>{})
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
        displayEnabled.current=fetched.enabled!==false
        if(remoteSound.current!== (fetched.soundEnabled!==false)){setSoundEnabled(fetched.soundEnabled!==false);remoteSound.current=fetched.soundEnabled!==false}
      }
    } catch (err) {
      if((err as any)?.response?.status===401)setAuthorizationExpired(true)
      console.warn('[TV Display] Network offline or API unreachable, using local cache:', err)
    }
  }

  useEffect(() => {
    const refresh=async()=>{await fetchConfig();try{await tvEventsApi.heartbeat(storeId,displayToken,{terminalId,version:configVersion.current,acknowledged:completedEvents.current.slice(-100)});if(!displayEnabled.current)return;const events=await tvEventsApi.events(storeId,displayToken,terminalId);for(const event of events.data.data||[])receiveDraw.current(event)}catch{/* Retry persisted events after reconnection. */}}
    refreshRef.current=refresh
    void refresh();const pollTimer=setInterval(refresh,15000)
    const focus=()=>{if(document.visibilityState==='visible')void refresh()}
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus)
    return()=>{clearInterval(pollTimer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}
  },[storeId,displayToken,terminalId])

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

  const visibleActivities=(config.activePromotions||[]).filter((a:any)=>activityEligible({...a,status:'published',used:0,priority:0,paymentMethods:a.paymentMethods||[],productIds:[],specIds:[],memberLevels:a.memberLevels||[],channels:a.channels||[],weekdays:a.weekdays||[],rule:a.rule||{}},{now:currentTime,channel:''},false))
  useEffect(()=>{const timer=setInterval(()=>setActivityIndex(n=>n+1),(config.carouselIntervalSeconds||6)*1000);return()=>clearInterval(timer)},[config.carouselIntervalSeconds])
  const currentActivity=visibleActivities[activityIndex%Math.max(1,visibleActivities.length)]
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
      void refreshRef.current()
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    // Listen to live TV config changes made in Admin marketing page
    socket.on('tv:config:update',()=>{void refreshRef.current()})

    // Listen to POS checkout lottery trigger
    socket.on('tv:lottery:trigger', (payload: any) => {
      const data = payload?.data || payload
      if (!data) return
      receiveDraw.current(data)
    })

    return () => {
      socket.disconnect()
    }
  }, [storeId, displayToken])

  // Trigger Lottery Spin Animation
  const triggerLotteryAnimation = (data: {
    orderNumber: string
    prizeName: string
    prizeIndex?: number
    customerPhone?: string
    eventId?: string
    prizes?: any[]
  }) => {
    const prizes = data.prizes || config.lottery?.prizes || DEFAULT_CONFIG.lottery.prizes
    if (!prizes.length || typeof data.prizeIndex !== 'number' || data.prizeIndex < 0 || data.prizeIndex >= prizes.length) return
    if (lotteryBusy.current) { pendingDraws.current.push(data); return }
    lotteryBusy.current = true
    setWheelPrizes(prizes)
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
        if(data.eventId&&!data.eventId.startsWith('test:')){completedEvents.current.push(data.eventId);void tvEventsApi.heartbeat(storeId,displayToken,{terminalId,version:configVersion.current,acknowledged:[data.eventId]}).catch(()=>{})}
        lotteryBusy.current = false
        const next = pendingDraws.current.shift()
        if (next) drawHandler.current(next)
      }, 8000))
    }, 4500))
  }

  drawHandler.current = triggerLotteryAnimation
  receiveDraw.current=(data:any)=>{if(!data.eventId||seenEvents.current.has(data.eventId))return;seenEvents.current.add(data.eventId);drawHandler.current(data)}

  const currentBanner = activeBanners[activeBannerIndex] || activeBanners[0]
  const splitRatio = config.layout?.columns?.[0]?.width || 60
  const prizes = wheelPrizes.length?wheelPrizes:config.lottery?.prizes || DEFAULT_CONFIG.lottery.prizes
  const numPrizes = prizes.length
  const segmentAngle = 360 / numPrizes

  if(authorizationExpired)return <div className="h-screen flex flex-col gap-3 items-center justify-center bg-slate-950 text-white"><p>授权已到期 / Authorization expired / Otorisasi kedaluwarsa</p><p>请在后台“设置 → 电视大屏”重新打开播放链接。</p></div>
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
          <div className="h-full flex flex-col justify-center p-8 gap-6 overflow-hidden">
            {currentActivity?<>
              <span className="text-amber-300 font-bold text-2xl">PROMO AKTIF</span>
              <h2 className="text-4xl font-black">{currentActivity.name}</h2>
              {(currentActivity.imageUrl||currentActivity.products?.[0]?.image)&&<img className="max-h-64 object-contain rounded-2xl" src={mediaUrl(currentActivity.imageUrl||currentActivity.products[0].image)} alt={currentActivity.name}/>}
              <p className="text-2xl text-amber-200">{currentActivity.summary}</p>
              <p className="text-xl">{currentActivity.description}</p>
              {currentActivity.products?.map((p:any)=><div key={p.id}><p className="font-bold">{p.name}</p>{p.specs.map((spec:any)=><span className="mr-3" key={spec.id}>{spec.name}: {formatCurrency(['special_price','member_price','birthday','welcome','group'].includes(currentActivity.type)?Math.min(spec.price,currentActivity.rule.price??spec.price):spec.price)}</span>)}</div>)}
              {currentActivity.rule.minAmount>0&&<p>Min. {formatCurrency(currentActivity.rule.minAmount)}</p>}
              {currentActivity.memberOnly&&<p>Khusus member {currentActivity.memberLevels?.join(', ')}</p>}
              {currentActivity.channels?.length>0&&<p>{currentActivity.channels.join(' · ')}</p>}
              {currentActivity.paymentMethods?.length>0&&<p>{currentActivity.paymentMethods.join(' · ')}</p>}
              {currentActivity.dailyStart&&<p>{currentActivity.dailyStart}–{currentActivity.dailyEnd} · {currentActivity.timezone}</p>}
              {currentActivity.endsAt&&<p>Hingga {new Date(currentActivity.endsAt).toLocaleString('id-ID',{timeZone:currentActivity.timezone})}</p>}
            </>:<><h2 className="text-3xl font-bold">{config.welcomeText}</h2><p className="text-slate-300">Belum ada promo aktif</p></>}
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
