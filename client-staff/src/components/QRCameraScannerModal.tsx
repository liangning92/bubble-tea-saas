import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Camera,
  RotateCw,
  Image as ImageIcon,
  Keyboard,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  LogIn,
  LogOut
} from 'lucide-react'

interface QRCameraScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (qrData: string, mode: 'check_in' | 'check_out') => Promise<void>
  defaultMode: 'check_in' | 'check_out'
  isLoading: boolean
}

export function QRCameraScannerModal({
  isOpen,
  onClose,
  onScan,
  defaultMode,
  isLoading
}: QRCameraScannerModalProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'check_in' | 'check_out'>(defaultMode)
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [hasScanned, setHasScanned] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 同步外部传入的默认打卡模式（未签到为 check_in，已签到为 check_out）
  useEffect(() => {
    setMode(defaultMode)
  }, [defaultMode, isOpen])

  // 动态加载 jsQR 库作为非原生 BarcodeDetector 浏览器的通用垫片
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).BarcodeDetector && !(window as any).jsQR) {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
      script.async = true
      document.head.appendChild(script)
    }
  }, [])

  // 停止摄像头
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // 处理识别出的二维码数据
  const handleDecodedString = useCallback(async (rawValue: string) => {
    if (hasScanned || isLoading) return
    const cleanValue = rawValue.trim()
    if (!cleanValue) return

    setHasScanned(true)

    // 震动提示
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([80, 40, 80])
      } catch {
        // ignore
      }
    }

    try {
      await onScan(cleanValue, mode)
    } catch {
      // 失败后允许重新扫码
      setHasScanned(false)
    }
  }, [hasScanned, isLoading, mode, onScan])

  // 启动摄像头与扫描循环
  const startCamera = useCallback(async () => {
    stopCamera()
    setCameraError(null)

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(t('attendance.cameraPermissionDenied', '当前环境不支持直接调起摄像头，请使用拍照或手动输入。'))
      setActiveTab('manual')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // 启动实时帧检测循环
      const scanFrame = async () => {
        if (!videoRef.current || hasScanned) return

        const video = videoRef.current
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          // 方案 1: 原生 BarcodeDetector (Android Chrome / iOS 17+ Safari)
          if ('BarcodeDetector' in window) {
            try {
              const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
              const barcodes = await detector.detect(video)
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                handleDecodedString(barcodes[0].rawValue)
                return
              }
            } catch {
              // fallback to canvas
            }
          }

          // 方案 2: jsQR Canvas 帧解析 (Safari / 全平台兜底)
          if ((window as any).jsQR) {
            try {
              const canvas = canvasRef.current || document.createElement('canvas')
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const code = (window as any).jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert'
                })
                if (code && code.data) {
                  handleDecodedString(code.data)
                  return
                }
              }
            } catch {
              // ignore frame read error
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(scanFrame)
      }

      animFrameRef.current = requestAnimationFrame(scanFrame)
    } catch (err: any) {
      console.warn('Camera stream error:', err)
      setCameraError(t('attendance.cameraPermissionDenied', '无法打开摄像头，请检查浏览器相机权限或切换到手动输入。'))
    }
  }, [facingMode, hasScanned, handleDecodedString, stopCamera, t])

  // 打开/关闭处理
  useEffect(() => {
    if (isOpen) {
      setHasScanned(false)
      if (activeTab === 'camera') {
        startCamera()
      }
    } else {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [isOpen, activeTab, startCamera, stopCamera])

  // 照片上传解析
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const img = new Image()
      img.src = URL.createObjectURL(file)
      await new Promise(res => { img.onload = res })

      // 优先尝试 BarcodeDetector
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
          const barcodes = await detector.detect(img)
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            handleDecodedString(barcodes[0].rawValue)
            return
          }
        } catch {
          // fallback
        }
      }

      // jsQR 兜底
      if ((window as any).jsQR) {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = (window as any).jsQR(imgData.data, imgData.width, imgData.height)
          if (code && code.data) {
            handleDecodedString(code.data)
            return
          }
        }
      }

      alert(t('attendance.invalidQR', '未能从照片中识别出有效的收银机动态考勤码'))
    } catch (err) {
      alert(t('attendance.errorOccurred', '解析照片失败，请重试或使用手动输入'))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col justify-between select-none">
      {/* 顶部栏 */}
      <div className="px-4 pt-12 pb-4 flex items-center justify-between text-white bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
            <Camera size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight">
              {t('attendance.scanQR', '扫码打卡')}
            </h2>
            <p className="text-xs text-white/70">
              {t('attendance.scanQRDesc', '对准收银机屏幕上的动态考勤码')}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-transform"
        >
          <X size={20} />
        </button>
      </div>

      {/* 中部模式切换选择器 (上班签到 / 下班打卡) */}
      <div className="px-6 py-2">
        <div className="bg-white/15 backdrop-blur-md p-1 rounded-2xl flex border border-white/20">
          <button
            type="button"
            onClick={() => setMode('check_in')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              mode === 'check_in'
                ? 'bg-emerald-500 text-white shadow-md'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <LogIn size={15} />
            {t('attendance.scanPosQrCheckIn', '上班签到')}
          </button>
          <button
            type="button"
            onClick={() => setMode('check_out')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              mode === 'check_out'
                ? 'bg-amber-500 text-white shadow-md'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <LogOut size={15} />
            {t('attendance.scanPosQrCheckOut', '下班打卡')}
          </button>
        </div>
      </div>

      {/* 主体视口区域 */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 relative overflow-hidden">
        {activeTab === 'camera' ? (
          <div className="w-full max-w-sm flex flex-col items-center">
            {cameraError ? (
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 text-center text-white max-w-xs">
                <AlertCircle size={40} className="mx-auto text-amber-400 mb-3" />
                <p className="text-sm font-medium mb-4">{cameraError}</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2.5 px-4 bg-primary text-white rounded-xl text-xs font-bold active:scale-95 transition-transform"
                  >
                    {t('attendance.uploadPhoto', '拍照 / 上传识别')}
                  </button>
                  <button
                    onClick={() => setActiveTab('manual')}
                    className="py-2.5 px-4 bg-white/20 text-white rounded-xl text-xs font-medium active:scale-95 transition-transform"
                  >
                    {t('attendance.manualInput', '手动输入考勤码')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative w-72 h-72 rounded-3xl overflow-hidden border-2 border-primary/80 shadow-[0_0_25px_rgba(236,109,136,0.4)] bg-black">
                {/* 隐藏的视频与画布 */}
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* 四角对焦框修饰 */}
                <div className="absolute top-3 left-3 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg pointer-events-none" />
                <div className="absolute top-3 right-3 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg pointer-events-none" />
                <div className="absolute bottom-3 left-3 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg pointer-events-none" />
                <div className="absolute bottom-3 right-3 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg pointer-events-none" />

                {/* 动态激光扫描线 */}
                {!hasScanned && (
                  <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_12px_#EC6D88] animate-pulse"
                    style={{
                      animation: 'scanLaser 2.2s ease-in-out infinite'
                    }}
                  />
                )}

                {/* 识别成功/加载提示遮罩 */}
                {(hasScanned || isLoading) && (
                  <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center text-white">
                    {isLoading ? (
                      <>
                        <Loader2 size={36} className="text-primary animate-spin mb-2" />
                        <p className="text-xs font-bold">{t('common.loading', '正在登记考勤...')}</p>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={40} className="text-emerald-400 mb-2" />
                        <p className="text-xs font-bold">{t('attendance.scanSuccess', '识别成功！')}</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <p className="text-white/80 text-xs text-center mt-4 max-w-xs">
              {t('attendance.alignQrCode', '将收银机动态二维码置于取景框内即可自动识别')}
            </p>
          </div>
        ) : (
          /* 手动输入备用标签页 */
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-gray-900 text-sm mb-1">
              {t('attendance.manualInput', '手动输入')}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {t('attendance.qrInputPlaceholder', '粘贴或输入POS屏幕上的动态考勤码...')}
            </p>
            <textarea
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="eyJzIjoiY21vbWUiLCJwIjoicG9zLTAxIiwidCI..."
              rows={4}
              className="w-full p-3 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent font-mono resize-none text-gray-800"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('camera')}
                className="py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl text-xs font-medium"
              >
                {t('common.back', '返回相机')}
              </button>
              <button
                type="button"
                disabled={isLoading || !manualCode.trim()}
                onClick={() => handleDecodedString(manualCode.trim())}
                className="flex-1 py-2.5 bg-primary disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                {t('attendance.qrSubmit', '立即验证打卡')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 底部功能控制区 */}
      <div className="px-6 pb-10 pt-4 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-around text-white">
        {/* 隐藏的图片选择器 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* 拍照 / 上传图片识别 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-1 active:scale-95 transition-transform text-white/80 hover:text-white"
        >
          <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center">
            <ImageIcon size={20} />
          </div>
          <span className="text-[11px] font-medium">{t('attendance.uploadPhoto', '相册/拍照')}</span>
        </button>

        {/* 翻转前后摄像头 */}
        {activeTab === 'camera' && !cameraError && (
          <button
            onClick={() => {
              setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'))
            }}
            className="flex flex-col items-center gap-1 active:scale-95 transition-transform text-white/80 hover:text-white"
          >
            <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center">
              <RotateCw size={20} />
            </div>
            <span className="text-[11px] font-medium">{t('attendance.switchCamera', '翻转镜头')}</span>
          </button>
        )}

        {/* 手动输入切换 */}
        <button
          onClick={() => setActiveTab(prev => (prev === 'camera' ? 'manual' : 'camera'))}
          className="flex flex-col items-center gap-1 active:scale-95 transition-transform text-white/80 hover:text-white"
        >
          <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center">
            {activeTab === 'camera' ? <Keyboard size={20} /> : <Camera size={20} />}
          </div>
          <span className="text-[11px] font-medium">
            {activeTab === 'camera' ? t('attendance.manualInput', '手动输入') : t('attendance.scanCamera', '相机扫码')}
          </span>
        </button>
      </div>

      {/* 嵌入激光动画关键帧样式 */}
      <style>{`
        @keyframes scanLaser {
          0% { top: 8%; opacity: 0.3; }
          50% { top: 90%; opacity: 1; }
          100% { top: 8%; opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
