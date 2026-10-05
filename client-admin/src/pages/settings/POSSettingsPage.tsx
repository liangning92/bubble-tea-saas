import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { configApi, uploadApi, receiptTemplateApi } from '../../services/api'
import { ReceiptTemplateEditor } from '../../components/ReceiptTemplateEditor'
import { useAuthStore } from '../../stores/auth'
import { CheckCircle, Loader2, Smartphone, LayoutGrid, CreditCard, Volume2, Tag, Layers, Users, Receipt, Wallet, Printer, RefreshCw, Upload, X } from 'lucide-react'
import axios from 'axios'

type POSSubTab = 'layout' | 'toolbar' | 'channels' | 'tax' | 'quickAmounts' | 'sound' | 'display' | 'shift' | 'payment' | 'receipt' | 'hardware'

// Toggle Component (shared)
const Toggle: React.FC<{ enabled: boolean; onChange: () => void }> = ({ enabled, onChange }) => (
  <button
    onClick={onChange}
    className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-primary' : 'bg-gray-300'}`}
  >
    <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${enabled ? 'translate-x-[26px]' : 'translate-x-[2px]'}`} />
  </button>
)

// Media file type
interface MediaFile {
  url: string
  filename: string
  mimetype: string
  isVideo: boolean
}

// DualScreen Media Upload Component
const DualScreenMediaUpload: React.FC<{
  mediaFiles: MediaFile[]
  onUpload: (files: MediaFile[]) => void
  onRemove: (index: number) => void
  onMediaFilesChange?: (getNewFiles: (current: MediaFile[]) => MediaFile[]) => void
}> = ({ mediaFiles, onUpload, onRemove, onMediaFilesChange }) => {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await uploadFiles(Array.from(files))
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length === 0) return
    await uploadFiles(Array.from(files))
  }

  const uploadFiles = async (files: File[]) => {
    setUploading(true)
    try {
      const response = await uploadApi.uploadDualScreen(files)
      const newFiles = response.data.data.files || []
      if (onMediaFilesChange) {
        // Use functional update to avoid stale closure
        onMediaFilesChange((current) => [...current, ...newFiles])
      } else {
        onUpload([...mediaFiles, ...newFiles])
      }
    } catch (error) {
      console.error('Upload failed:', error)
      alert(t('common.error'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('dualScreenFileInput')?.click()}
      >
        <input
          type="file"
          id="dualScreenFileInput"
          className="hidden"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm text-gray-500">{t('common.uploading')}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={24} className="text-gray-400" />
            <span className="text-sm text-gray-500">{t('posSettings.dualScreenUploadHint')}</span>
            <span className="text-xs text-gray-400">{t('posSettings.dualScreenFileTypes')}</span>
          </div>
        )}
      </div>

      {/* Preview Grid */}
      {mediaFiles.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {mediaFiles.map((file, index) => (
            <div key={index} className="relative group">
              {file.isVideo ? (
                <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                  <video src={file.url} className="w-full h-full object-cover rounded-lg" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-2xl">▶</span>
                  </div>
                </div>
              ) : (
                <img src={file.url} alt="" className="aspect-video object-cover rounded-lg" />
              )}
              <button
                onClick={() => onRemove(index)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
              {file.isVideo && (
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 rounded">{t('posSettings.videoLabel')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Layout Column types
type ColumnContent = 'media' | 'promotions' | 'welcome' | 'order' | 'logo'

interface LayoutColumn {
  width: number
  content: ColumnContent
}

interface Layout {
  columns: LayoutColumn[]
}

// DualScreen Layout Editor Component
const _DualScreenLayoutEditor: React.FC<{
  layout: Layout
  onChange: (layout: Layout) => void
  title: string
}> = ({ layout, onChange, title }) => {
  const { t } = useTranslation()

  const updateColumn = (index: number, updates: Partial<LayoutColumn>) => {
    const newColumns = [...layout.columns]
    newColumns[index] = { ...newColumns[index], ...updates }
    onChange({ columns: newColumns })
  }

  const addColumn = () => {
    if (layout.columns.length >= 3) return
    const newColumns = [...layout.columns, { width: Math.floor(100 / (layout.columns.length + 1)), content: 'promotions' as ColumnContent }]
    // Redistribute widths
    const equalWidth = Math.floor(100 / newColumns.length)
    newColumns.forEach((col) => col.width = equalWidth)
    onChange({ columns: newColumns })
  }

  const removeColumn = (index: number) => {
    if (layout.columns.length <= 1) return
    const newColumns = layout.columns.filter((_, idx) => idx !== index)
    const equalWidth = Math.floor(100 / newColumns.length)
    newColumns.forEach((col) => col.width = equalWidth)
    onChange({ columns: newColumns })
  }

  return (
    <div className="p-3 bg-white rounded-lg border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex gap-1">
          {layout.columns.length < 3 && (
            <button onClick={addColumn} className="px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary/90">
              {t('posSettings.addColumn')}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {layout.columns.map((col, index) => (
          <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            {/* Width slider */}
            <div className="flex items-center gap-2 w-32">
              <input
                type="range"
                min="10"
                max="80"
                value={col.width}
                onChange={(e) => updateColumn(index, { width: parseInt(e.target.value) })}
                className="w-20"
              />
              <span className="text-xs w-8">{col.width}%</span>
            </div>

            {/* Content type */}
            <select
              value={col.content}
              onChange={(e) => updateColumn(index, { content: e.target.value as ColumnContent })}
              className="flex-1 text-sm input"
            >
              <option value="media">{t('posSettings.columnMedia')}</option>
              <option value="promotions">{t('posSettings.columnPromotions')}</option>
              <option value="welcome">{t('posSettings.columnWelcome')}</option>
              <option value="order">{t('posSettings.columnOrder')}</option>
              <option value="logo">{t('posSettings.columnLogo')}</option>
            </select>

            {/* Remove */}
            {layout.columns.length > 1 && (
              <button onClick={() => removeColumn(index)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Width sum indicator */}
      <div className="mt-2 text-xs text-gray-500 text-right">
        {t('posSettings.totalWidth', { width: layout.columns.reduce((sum, col) => sum + col.width, 0) })}
      </div>
    </div>
  )
}

// DualScreen Preview Component
const DualScreenPreview: React.FC<{
  dualScreen: any
}> = React.memo(({ dualScreen }) => {
  const { t } = useTranslation()
  const [previewState, setPreviewState] = useState<'idle' | 'ordering' | 'complete'>('idle')
  const [currentIndex, setCurrentIndex] = useState(0)
  const promotions = dualScreen.promotions || ['🧋', '🍓', '💳', '🎁']
  const mediaFiles = dualScreen.mediaFiles || []

  // Use refs to avoid stale closure in interval callbacks
  const mediaFilesRef = useRef(mediaFiles)
  const promotionsRef = useRef(promotions)
  mediaFilesRef.current = mediaFiles
  promotionsRef.current = promotions

  const idleLayout = useMemo(() => dualScreen.idleLayout || { columns: [{ width: 100, content: 'media' }] }, [dualScreen.idleLayout])
  const orderingLayout = useMemo(() => dualScreen.orderingLayout || { columns: [{ width: 100, content: 'order' }] }, [dualScreen.orderingLayout])
  const currentLayout = previewState === 'idle' ? idleLayout : orderingLayout

  // Auto-rotate for preview
  useEffect(() => {
    if (previewState !== 'idle') return
    const mf = mediaFilesRef.current
    const pr = promotionsRef.current
    if (mf.length > 0) {
      const interval = setInterval(() => {
        setCurrentIndex(p => (p + 1) % mf.length)
      }, 3000)
      return () => clearInterval(interval)
    } else {
      const interval = setInterval(() => {
        setCurrentIndex(p => (p + 1) % pr.length)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [previewState])

  const currentMedia = mediaFiles[currentIndex]
  const currentPromotion = promotions[currentIndex]

  // Render column content
  const renderColumnContent = (content: string) => {
    switch (content) {
      case 'media':
        if (mediaFiles.length > 0) {
          return currentMedia?.isVideo ? (
            <video src={currentMedia.url} className="w-full h-full object-contain" autoPlay loop muted />
          ) : (
            <img src={currentMedia?.url} alt="" className="w-full h-full object-contain" />
          )
        }
        return (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500 to-pink-600 text-white">
            <span className="text-4xl">{currentPromotion}</span>
          </div>
        )
      case 'promotions':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4">
            <div className="text-3xl mb-2">{currentPromotion}</div>
            <div className="text-sm text-center">{dualScreen.welcomeText || t('posSettings.welcome')}</div>
          </div>
        )
      case 'welcome':
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
            <span className="text-xl font-bold">{dualScreen.welcomeText || t('posSettings.welcome')}</span>
          </div>
        )
      case 'order':
        return (
          <div className="w-full h-full flex flex-col bg-gray-50">
            <div className="bg-primary text-white py-2 px-4 text-center text-sm font-bold">{t('posSettings.yourOrder')}</div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              <div className="flex justify-between items-center bg-white p-2 rounded text-xs">
                <div className="flex items-center gap-2">
                  <span>✨</span>
                  <div>
                    <div className="font-medium">{t('posSettings.sampleProductName')}</div>
                    <div className="text-gray-500">{t('posSettings.sampleSize')}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{t('posSettings.samplePrice')}</div>
                  <div className="text-gray-500">{t('posSettings.sampleQuantity')}</div>
                </div>
              </div>

              {dualScreen?.showUpsellHint !== false && (
                <div className="p-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-200 rounded-lg text-xs text-orange-800 font-medium flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span>✨</span>
                    <span>💡 {t('posSettings.upsellPreview')}</span>
                  </div>
                  <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{t('marketing.secondHalf')}</span>
                </div>
              )}
            </div>
            <div className="bg-white border-t p-2 space-y-1">
              {dualScreen?.showPromotionDetail !== false && (
                <div className="flex justify-between items-center text-xs text-green-600 font-medium">
                  <div className="flex items-center gap-1">
                    <span>{t('posSettings.discount', '优惠')}</span>
                    <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">{t('marketing.secondHalf')}</span>
                  </div>
                  <span>-Rp 10.000</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-1 border-t">
                <span>{t('common.total')}</span>
                <span className="font-bold text-primary">{t('posSettings.samplePrice')}</span>
              </div>
            </div>
          </div>
        )
      case 'logo':
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <img src="/youme-logo-red.png" alt="YOUME" className="h-20 w-auto object-contain" />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="mt-4 p-4 bg-gray-100 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">{t('posSettings.dualScreenPreview')}</span>
        <div className="flex gap-1">
          {(['idle', 'ordering', 'complete'] as const).map((state) => (
            <button
              key={state}
              onClick={() => setPreviewState(state)}
              className={`px-2 py-1 text-xs rounded ${previewState === state ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'}`}
            >
              {state === 'idle' ? t('posSettings.previewIdle') : state === 'ordering' ? t('posSettings.previewOrdering') : t('posSettings.previewComplete')}
            </button>
          ))}
        </div>
      </div>

      {/* Preview Screen with dynamic columns */}
      <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {previewState === 'complete' ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="text-4xl mb-2">{t('posSettings.checkmark')}</div>
            <div className="text-lg font-bold">{t('posSettings.thankYou')}</div>
          