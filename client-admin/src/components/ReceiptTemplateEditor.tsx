import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { receiptTemplateApi as ReceiptTemplateApi } from '../services/api'
import {
  GripVertical,
  Trash2,
  Copy,
  Star,
  Settings2,
  Eye,
  Palette,
} from 'lucide-react'

// ============ TYPES ============

export type BlockType =
  | 'logo'
  | 'header'
  | 'storeInfo'
  | 'orderInfo'
  | 'items'
  | 'subtotal'
  | 'tax'
  | 'total'
  | 'paymentInfo'
  | 'qrCode'
  | 'barcode'
  | 'footer'
  | 'divider'
  | 'customText'

export interface BlockStyle {
  bold?: boolean
  fontSize?: 'small' | 'normal' | 'large'
  align?: 'left' | 'center' | 'right'
}

export interface BlockConfig {
  // logo
  width?: number
  // header
  text?: string
  // storeInfo
  showPhone?: boolean
  showAddress?: boolean
  phone?: string
  address?: string
  // orderInfo
  showDate?: boolean
  showTime?: boolean
  showCashier?: boolean
  showCustomer?: boolean
  showChannel?: boolean
  // items
  showAddon?: boolean
  showNote?: boolean
  showSugarIce?: boolean
  groupByProduct?: boolean
  itemFormat?: 'standard' | 'compact'
  // tax
  label?: string
  rate?: number
  showRate?: boolean
  // subtotal
  subtotalLabel?: string
  // total
  totalLabel?: string
  // paymentInfo
  showMethod?: boolean
  showReceived?: boolean
  showChange?: boolean
  // qrCode
  qrContent?: string
  size?: number
  // barcode
  barcodeType?: 'code128' | 'code39'
  height?: number
  // footer
  footerText?: string
  showDivider?: boolean
  // customText
  customText?: string
  // divider
  dividerStyle?: 'line' | 'dashed' | 'space'
}

export interface ReceiptBlock {
  id: string
  type: BlockType
  enabled: boolean
  order: number
  style: BlockStyle
  config: BlockConfig
}

export interface ReceiptTemplate {
  id?: string
  storeId: string
  name: string
  isDefault: boolean
  blocks: ReceiptBlock[]
}

// ============ DEFAULT BLOCKS ============

export const BLOCK_DEFINITIONS: Record<
  BlockType,
  { label: string; icon: string; defaultConfig: BlockConfig }
> = {
  logo: {
    label: 'Logo',
    icon: '🖼️',
    defaultConfig: { width: 120 },
  },
  header: {
    label: 'Header',
    icon: '📝',
    defaultConfig: { text: 'Bubble Tea Shop' },
  },
  storeInfo: {
    label: 'Store Info',
    icon: '🏪',
    defaultConfig: { showPhone: true, showAddress: true },
  },
  orderInfo: {
    label: 'Order Info',
    icon: '📋',
    defaultConfig: { showDate: true, showTime: true, showCashier: true, showCustomer: true, showChannel: true },
  },
  items: {
    label: 'Items',
    icon: '🛒',
    defaultConfig: { showAddon: true, showNote: true, showSugarIce: true, itemFormat: 'standard' },
  },
  subtotal: {
    label: 'Subtotal',
    icon: '📦',
    defaultConfig: { subtotalLabel: 'Subtotal' },
  },
  tax: {
    label: 'Tax',
    icon: '💰',
    defaultConfig: { label: 'Tax (11%)', rate: 11, showRate: true },
  },
  total: {
    label: 'Total',
    icon: '💵',
    defaultConfig: { totalLabel: 'TOTAL' },
  },
  paymentInfo: {
    label: 'Payment Info',
    icon: '💳',
    defaultConfig: { showMethod: true, showReceived: true, showChange: true },
  },
  qrCode: {
    label: 'QR Code',
    icon: '⬛',
    defaultConfig: { size: 80 },
  },
  barcode: {
    label: 'Barcode',
    icon: '📊',
    defaultConfig: { barcodeType: 'code128', height: 40 },
  },
  footer: {
    label: 'Footer',
    icon: '📌',
    defaultConfig: { footerText: 'Thank you!', showDivider: true },
  },
  divider: {
    label: 'Divider',
    icon: '➖',
    defaultConfig: { dividerStyle: 'line' },
  },
  customText: {
    label: 'Custom Text',
    icon: '✏️',
    defaultConfig: { customText: '' },
  },
}

const BLOCK_TYPES = Object.keys(BLOCK_DEFINITIONS) as BlockType[]

// ============ HELPERS ============

function nanoid() {
  return Math.random().toString(36).slice(2, 10)
}

function createDefaultBlock(type: BlockType, order: number): ReceiptBlock {
  return {
    id: nanoid(),
    type,
    enabled: true,
    order,
    style: { bold: false, fontSize: 'normal', align: 'center' },
    config: { ...BLOCK_DEFINITIONS[type].defaultConfig },
  }
}

// ============ DEFAULT TEMPLATE ============

function getDefaultTemplate(storeId: string): ReceiptTemplate {
  const blocks: ReceiptBlock[] = [
    createDefaultBlock('logo', 0),
    createDefaultBlock('header', 1),
    createDefaultBlock('divider', 2),
    createDefaultBlock('storeInfo', 3),
    createDefaultBlock('orderInfo', 4),
    createDefaultBlock('divider', 5),
    createDefaultBlock('items', 6),
    createDefaultBlock('subtotal', 7),
    createDefaultBlock('tax', 8),
    createDefaultBlock('total', 9),
    createDefaultBlock('divider', 10),
    createDefaultBlock('paymentInfo', 11),
    createDefaultBlock('qrCode', 12),
    createDefaultBlock('barcode', 13),
    createDefaultBlock('footer', 14),
  ]
  return { storeId, name: 'Default', isDefault: true, blocks }
}

// ============ PREVIEW COMPONENT ============

const LivePreview: React.FC<{
  blocks: ReceiptBlock[]
  paperSize: '58mm' | '80mm'
}> = ({ blocks, paperSize }) => {
  const { t } = useTranslation()
  const width = paperSize === '58mm' ? '200px' : '280px'

  const enabledBlocks = useMemo(
    () => blocks.filter((b) => b.enabled).sort((a, b) => a.order - b.order),
    [blocks]
  )

  const textAlign = (align?: string) => {
    if (align === 'left') return 'text-left'
    if (align === 'right') return 'text-right'
    return 'text-center'
  }

  const fontSize = (size?: string) => {
    if (size === 'small') return 'text-[10px]'
    if (size === 'large') return 'text-base'
    return 'text-xs'
  }

  return (
    <div
      className="bg-white border rounded-lg p-3 font-mono overflow-hidden"
      style={{ width, minHeight: '400px' }}
    >
      {enabledBlocks.map((block) => {
        const alignClass = textAlign(block.style.align)
        const sizeClass = fontSize(block.style.fontSize)
        const boldClass = block.style.bold ? 'font-bold' : ''

        switch (block.type) {
          case 'logo':
            return (
              <div key={block.id} className={`${alignClass} mb-2`}>
                <div className="border rounded p-1 inline-block">
                  <div className="w-20 h-12 bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">
                    LOGO
                  </div>
                </div>
              </div>
            )
          case 'header':
            return (
              <div key={block.id} className={`${alignClass} ${boldClass} border-b pb-2 mb-2`}>
                <div className={sizeClass}>{block.config.text || 'Store Name'}</div>
              </div>
            )
          case 'storeInfo':
            return (
              <div key={block.id} className={`${alignClass} ${sizeClass} text-gray-600 border-b pb-2 mb-2`}>
                {block.config.showPhone && <div>Tel: {block.config.phone || t('posSettings.receiptSamplePhone')}</div>}
                {block.config.showAddress && <div>{block.config.address || t('posSettings.receiptSampleAddress')}</div>}
              </div>
            )
          case 'orderInfo':
            return (
              <div key={block.id} className={`${alignClass} ${sizeClass} border-b pb-2 mb-2`}>
                {block.config.showDate && <div>{t('posSettings.receiptDate')}: {new Date().toLocaleDateString('id-ID')}</div>}
                {block.config.showTime && <div>{t('posSettings.receiptTime')}: {new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</div>}
                {block.config.showCashier && <div>{t('posSettings.receiptCashier')}: {t('posSettings.receiptSampleCashier')}</div>}
                {block.config.showCustomer && <div>{t('posSettings.receiptCustomer')}: -</div>}
                {block.config.showChannel && <div>{t('posSettings.receiptChannel')}: POS</div>}
              </div>
            )
          case 'items':
            return (
              <div key={block.id} className={`border-b pb-2 mb-2 ${sizeClass}`}>
                <div className={`font-bold mb-1 ${alignClass}`}>{t('posSettings.receiptItems')}</div>
                <div className="flex justify-between">
                  <span>{t('posSettings.receiptSampleProduct')}</span>
                  <span>15,000</span>
                </div>
                {block.config.showSugarIce && (
                  <div className="pl-2 text-gray-500">{t('posSettings.receiptSampleOption')}</div>
                )}
                {block.config.showAddon && (
                  <div className="pl-2 text-gray-500">{t('posSettings.receiptSampleAddon')}</div>
                )}
              </div>
            )
          case 'subtotal':
            return (
              <div key={block.id} className={`flex justify-between ${sizeClass} border-b pb-2 mb-2`}>
                <span>{block.config.subtotalLabel || t('posSettings.receiptSubtotal')}</span>
                <span>35,000</span>
              </div>
            )
          case 'tax':
            return (
              <div key={block.id} className={`flex justify-between ${sizeClass} text-gray-500 border-b pb-2 mb-2`}>
                <span>{block.config.label || `Tax (${block.config.rate || 11}%)`}</span>
                <span>3,850</span>
              </div>
            )
          case 'total':
            return (
              <div key={block.id} className={`flex justify-between font-bold ${sizeClass} border-b pb-2 mb-2`}>
                <span>{block.config.totalLabel || t('posSettings.receiptTotal')}</span>
                <span>38,850</span>
              </div>
            )
          case 'paymentInfo':
            return (
              <div key={block.id} className={`border-b pb-2 mb-2 ${sizeClass}`}>
                {block.config.showMethod && (
                  <div className="flex justify-between">
                    <span>{t('posSettings.receiptCash')}</span>
                    <span>50,000</span>
                  </div>
                )}
                {block.config.showChange && (
                  <div className="flex justify-between text-gray-500">
                    <span>{t('posSettings.receiptChange')}</span>
                    <span>11,150</span>
                  </div>
                )}
              </div>
            )
          case 'qrCode':
            return (
              <div key={block.id} className={`${alignClass} border-b pb-2 mb-2`}>
                <div
                  className="bg-gray-200 mx-auto flex items-center justify-center"
                  style={{ width: block.config.size || 80, height: block.config.size || 80 }}
                >
                  <span className="text-[8px] text-gray-500">QR</span>
                </div>
              </div>
            )
          case 'barcode':
            return (
              <div key={block.id} className={`${alignClass} border-b pb-2 mb-2`}>
                <div
                  className="bg-black mx-auto"
                  style={{ width: '120px', height: block.config.height || 40 }}
                />
                <div className={`${sizeClass} mt-1`}>{t('posSettings.receiptBarcode') || 'BT20260704001'}</div>
              </div>
            )
          case 'footer':
            return (
              <div key={block.id} className={`${alignClass} ${sizeClass}`}>
                {block.config.showDivider && <div className="border-t border-dashed my-2" />}
                <div className={boldClass}>{block.config.footerText || 'Thank you!'}</div>
              </div>
            )
          case 'divider':
            if (block.config.dividerStyle === 'space') {
              return <div key={block.id} className="h-4" />
            }
            return (
              <div
                key={block.id}
                className={`border-t ${block.config.dividerStyle === 'dashed' ? 'border-dashed' : ''} my-2`}
              />
            )
          case 'customText':
            return (
              <div key={block.id} className={`${alignClass} ${sizeClass} ${boldClass}`}>
                {block.config.customText}
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}

// ============ SORTABLE BLOCK COMPONENT ============

const SortableBlock: React.FC<{
  block: ReceiptBlock
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onDuplicate: () => void
}> = ({ block, isSelected, onSelect, onDelete, onDuplicate }) => {
  const def = BLOCK_DEFINITIONS[block.type]

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 bg-white border-2 rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'border-primary shadow-md' : 'border-gray-200 hover:border-gray-300'
      } ${!block.enabled ? 'opacity-50' : ''}`}
      onClick={onSelect}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600"
      >
        <GripVertical size={16} />
      </button>

      <span className="text-lg">{def.icon}</span>
      <span className="flex-1 font-medium text-sm">{def.label}</span>

      {!block.enabled && (
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Disabled</span>
      )}

      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
          title="Duplicate"
        >
          <Copy size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1 text-gray-400 hover:text-red-500 rounded"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ============ BLOCK PROPERTIES PANEL ============

const BlockPropertiesPanel: React.FC<{
  block: ReceiptBlock
  onUpdate: (block: ReceiptBlock) => void
  onClose: () => void
}> = ({ block, onUpdate, onClose }) => {
  const { t } = useTranslation()
  const def = BLOCK_DEFINITIONS[block.type]

  const updateConfig = (key: string, value: any) => {
    onUpdate({
      ...block,
      config: { ...block.config, [key]: value },
    })
  }

  const updateStyle = (key: string, value: any) => {
    onUpdate({
      ...block,
      style: { ...block.style, [key]: value },
    })
  }

  return (
    <div className="bg-white border rounded-lg p-4 h-fit">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{def.icon}</span>
          <h3 className="font-semibold">{def.label} Properties</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      {/* Common style properties */}
      <div className="space-y-4 border-b pb-4 mb-4">
        <h4 className="text-sm font-medium text-gray-700">Style</h4>

        <div className="flex items-center justify-between">
          <span className="text-sm">Bold</span>
          <button
            onClick={() => updateStyle('bold', !block.style.bold)}
            className={`w-10 h-6 rounded-full transition-colors relative ${
              block.style.bold ? 'bg-primary' : 'bg-gray-300'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${
                block.style.bold ? 'translate-x-[22px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>

        <div>
          <label className="text-sm text-gray-600">Alignment</label>
          <div className="flex gap-2 mt-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => updateStyle('align', align)}
                className={`flex-1 py-1.5 text-xs rounded border ${
                  block.style.align === align
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {align.charAt(0).toUpperCase() + align.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-600">Font Size</label>
          <div className="flex gap-2 mt-1">
            {(['small', 'normal', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => updateStyle('fontSize', size)}
                className={`flex-1 py-1.5 text-xs rounded border ${
                  block.style.fontSize === size
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Block-specific properties */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-700">Settings</h4>

        {/* Header */}
        {block.type === 'header' && (
          <div>
            <label className="text-sm text-gray-600">Text</label>
            <input
              type="text"
              value={block.config.text || ''}
              onChange={(e) => updateConfig('text', e.target.value)}
              className="input mt-1 w-full"
              placeholder={t('posSettings.receiptStoreNamePlaceholder')}
            />
          </div>
        )}

        {/* Logo */}
        {block.type === 'logo' && (
          <div>
            <label className="text-sm text-gray-600">Width (px)</label>
            <input
              type="number"
              value={block.config.width || 120}
              onChange={(e) => updateConfig('width', parseInt(e.target.value))}
              className="input mt-1 w-full"
            />
          </div>
        )}

        {/* Store Info */}
        {block.type === 'storeInfo' && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm">Show Phone</span>
              <button
                onClick={() => updateConfig('showPhone', !block.config.showPhone)}
                className={`w-10 h-6 rounded-full transition-colors relative ${
                  block.config.showPhone ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${
                    block.config.showPhone ? 'translate-x-[22px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Show Address</span>
              <button
                onClick={() => updateConfig('showAddress', !block.config.showAddress)}
                className={`w-10 h-6 rounded-full transition-colors relative ${
                  block.config.showAddress ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${
                    block.config.showAddress ? 'translate-x-[22px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
          </>
        )}

        {/* Order Info */}
        {block.type === 'orderInfo' && (
          <>
            {(['showDate', 'showTime', 'showCashier', 'showCustomer', 'showChannel'] as const).map((key) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm capitalize">{key.replace('show', '')}</span>
                <button
                  onClick={() => updateConfig(key, !block.config[key])}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    block.config[key] ? 'bg-primary' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${
                      block.config[key] ? 'translate-x-[22px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </div>
            ))}
          </>
        )}

        {/* Items */}
        {block.type === 'items' && (
          <>
            {(['showAddon', 'showNote', 'showSugarIce'] as const).map((key) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm capitalize">{key.replace('show', '')}</span>
                <button
                  onClick={() => updateConfig(key, !block.config[key])}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    block.config[key] ? 'bg-primary' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${
                      block.config[key] ? 'translate-x-[22px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </div>
            ))}
            <div>
              <label className="text-sm text-gray-600">Item Format</label>
              <select
                value={block.config.itemFormat || 'standard'}
                onChange={(e) => updateConfig('itemFormat', e.target.value)}
                className="input mt-1 w-full"
              >
                <option value="standard">{t('posSettings.formatStandard')}</option>
                <option value="compact">{t('posSettings.formatCompact')}</option>
              </select>
            </div>
          </>
        )}

        {/* Tax */}
        {block.type === 'tax' && (
          <>
            <div>
              <label className="text-sm text-gray-600">Label</label>
              <input
                type="text"
                value={block.config.label || ''}
                onChange={(e) => updateConfig('label', e.target.value)}
                className="input mt-1 w-full"
                placeholder={t('posSettings.receiptTaxPlaceholder')}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Rate (%)</label>
              <input
                type="number"
                value={block.config.rate || 11}
                onChange={(e) => updateConfig('rate', parseFloat(e.target.value))}
                className="input mt-1 w-full"
              />
            </div>
          </>
        )}

        {/* QR Code */}
        {block.type === 'qrCode' && (
          <div>
            <label className="text-sm text-gray-600">Size (px)</label>
            <input
              type="number"
              value={block.config.size || 80}
              onChange={(e) => updateConfig('size', parseInt(e.target.value))}
              className="input mt-1 w-full"
            />
          </div>
        )}

        {/* Barcode */}
        {block.type === 'barcode' && (
          <>
            <div>
              <label className="text-sm text-gray-600">Barcode Type</label>
              <select
                value={block.config.barcodeType || 'code128'}
                onChange={(e) => updateConfig('barcodeType', e.target.value)}
                className="input mt-1 w-full"
              >
                <option value="code128">{t('posSettings.barcodeCode128')}</option>
                <option value="code39">{t('posSettings.barcodeCode39')}</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">Height (px)</label>
              <input
                type="number"
                value={block.config.height || 40}
                onChange={(e) => updateConfig('height', parseInt(e.target.value))}
                className="input mt-1 w-full"
              />
            </div>
          </>
        )}

        {/* Footer */}
        {block.type === 'footer' && (
          <>
            <div>
              <label className="text-sm text-gray-600">Footer Text</label>
              <input
                type="text"
                value={block.config.footerText || ''}
                onChange={(e) => updateConfig('footerText', e.target.value)}
                className="input mt-1 w-full"
                placeholder={t('posSettings.receiptThankYouPlaceholder')}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Show Divider</span>
              <button
                onClick={() => updateConfig('showDivider', !block.config.showDivider)}
                className={`w-10 h-6 rounded-full transition-colors relative ${
                  block.config.showDivider ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${
                    block.config.showDivider ? 'translate-x-[22px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
          </>
        )}

        {/* Divider */}
        {block.type === 'divider' && (
          <div>
            <label className="text-sm text-gray-600">Style</label>
            <select
              value={block.config.dividerStyle || 'line'}
              onChange={(e) => updateConfig('dividerStyle', e.target.value)}
              className="input mt-1 w-full"
            >
              <option value="line">{t('posSettings.dividerSolid')}</option>
              <option value="dashed">{t('posSettings.dividerDashed')}</option>
              <option value="space">{t('posSettings.dividerSpace')}</option>
            </select>
          </div>
        )}

        {/* Custom Text */}
        {block.type === 'customText' && (
          <div>
            <label className="text-sm text-gray-600">Custom Text</label>
            <textarea
              value={block.config.customText || ''}
              onChange={(e) => updateConfig('customText', e.target.value)}
              className="input mt-1 w-full"
              rows={3}
              placeholder={t('posSettings.receiptCustomTextPlaceholder')}
            />
          </div>
        )}

        {/* Enabled toggle */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm font-medium">Enabled</span>
          <button
            onClick={() => onUpdate({ ...block, enabled: !block.enabled })}
            className={`w-10 h-6 rounded-full transition-colors relative ${
              block.enabled ? 'bg-primary' : 'bg-gray-300'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${
                block.enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ PALETTE ITEM ============

const PaletteItem: React.FC<{ type: BlockType; onAdd: () => void }> = ({ type, onAdd }) => {
  const def = BLOCK_DEFINITIONS[type]

  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: `palette-${type}`,
    data: { type: 'palette', blockType: type },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-grab active:cursor-grabbing hover:bg-gray-50 hover:border-gray-300 transition-colors"
      onClick={onAdd}
    >
      <span className="text-base">{def.icon}</span>
      <span className="text-xs font-medium">{def.label}</span>
    </div>
  )
}

// ============ MAIN EDITOR ============

interface ReceiptTemplateEditorProps {
  storeId: string
  onSave?: () => void
}

export const ReceiptTemplateEditor: React.FC<ReceiptTemplateEditorProps> = ({ storeId, onSave }) => {
  const { t } = useTranslation()

  const [templates, setTemplates] = useState<any[]>([])
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('New Template')
  const [blocks, setBlocks] = useState<ReceiptBlock[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('80mm')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Load templates on mount
  useEffect(() => {
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const res = await ReceiptTemplateApi.list(storeId)
      const data = res.data.data || []
      setTemplates(data)

      if (data.length > 0) {
        const defaultTpl = data.find((t: any) => t.isDefault) || data[0]
        selectTemplate(defaultTpl)
      } else {
        // Create default template
        const defaultTpl = getDefaultTemplate(storeId)
        setBlocks(defaultTpl.blocks)
        setTemplateName(defaultTpl.name)
        setCurrentTemplateId(null)
      }
    } catch (err) {
      console.error('Failed to load templates:', err)
      const defaultTpl = getDefaultTemplate(storeId)
      setBlocks(defaultTpl.blocks)
      setTemplateName(defaultTpl.name)
    } finally {
      setLoading(false)
    }
  }

  const selectTemplate = (template: any) => {
    setCurrentTemplateId(template.id)
    setTemplateName(template.name)
    try {
      const content = JSON.parse(template.content)
      setBlocks(content.blocks || [])
    } catch {
      setBlocks([])
    }
    setSelectedBlockId(null)
  }

  const handleAddBlock = (type: BlockType) => {
    const newBlock = createDefaultBlock(type, blocks.length)
    setBlocks([...blocks, newBlock])
    setSelectedBlockId(newBlock.id)
  }

  const handleDeleteBlock = (id: string) => {
    setBlocks(blocks.filter((b) => b.id !== id))
    if (selectedBlockId === id) setSelectedBlockId(null)
  }

  const handleDuplicateBlock = (id: string) => {
    const block = blocks.find((b) => b.id === id)
    if (!block) return
    const newBlock = {
      ...block,
      id: nanoid(),
      order: blocks.length,
    }
    setBlocks([...blocks, newBlock])
  }

  const handleUpdateBlock = (updated: ReceiptBlock) => {
    setBlocks(blocks.map((b) => (b.id === updated.id ? updated : b)))
  }

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert(t('posSettings.templateNameRequired'))
      return
    }

    setSaving(true)
    try {
      const content = JSON.stringify({ version: 1, blocks })

      if (currentTemplateId) {
        await ReceiptTemplateApi.update(currentTemplateId, {
          name: templateName,
          content,
        })
      } else {
        const res = await ReceiptTemplateApi.create({
          storeId,
          name: templateName,
          content,
          isDefault: templates.length === 0,
        })
        setCurrentTemplateId(res.data.data.id)
      }

      onSave?.()
      await loadTemplates()
    } catch (err) {
      console.error('Failed to save template:', err)
      alert(t('posSettings.saveTemplateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefault = async () => {
    if (!currentTemplateId) {
      await handleSave()
    }

    try {
      await ReceiptTemplateApi.setDefault(currentTemplateId!)
      await loadTemplates()
    } catch (err) {
      console.error('Failed to set default:', err)
    }
  }

  const handleDelete = async () => {
    if (!currentTemplateId) return
    if (!confirm('Delete this template?')) return

    try {
      await ReceiptTemplateApi.delete(currentTemplateId)
      setCurrentTemplateId(null)
      await loadTemplates()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeData = active.data.current

    // Dropping from palette
    if (activeData?.type === 'palette') {
      const blockType = activeData.blockType as BlockType
      handleAddBlock(blockType)
      return
    }

    // Reordering in canvas
    if (active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id)
      const newIndex = blocks.findIndex((b) => b.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newBlocks = arrayMove(blocks, oldIndex, newIndex).map((b, i) => ({
          ...b,
          order: i,
        }))
        setBlocks(newBlocks)
      }
    }
  }

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId)

  const activeBlock = activeId ? blocks.find((b) => b.id === activeId) : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="input w-48"
            placeholder={t('posSettings.receiptTemplateNamePlaceholder')}
          />
          {templates.find((t) => t.id === currentTemplateId)?.isDefault && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">Default</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={handleSetDefault} className="btn-secondary flex items-center gap-2">
            <Star size={16} />
            Set Default
          </button>
          {currentTemplateId && (
            <button onClick={handleDelete} className="btn-secondary text-red-500 flex items-center gap-2">
              <Trash2 size={16} />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Main editor */}
      <div className="grid grid-cols-4 gap-4">
        {/* Block Palette */}
        <div className="bg-gray-50 rounded-lg p-3">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Palette size={14} />
            Blocks
          </h3>
          <div className="space-y-1">
            {BLOCK_TYPES.map((type) => (
              <PaletteItem key={type} type={type} onAdd={() => handleAddBlock(type)} />
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="col-span-2 bg-gray-50 rounded-lg p-3">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Settings2 size={14} />
            Template Canvas
          </h3>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 min-h-[200px]">
                {blocks.length === 0 ? (
                  <div className="text-center text-gray-400 py-8 text-sm">
                    {t('posSettings.clickBlockToAdd')}
                  </div>
                ) : (
                  blocks.map((block) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      isSelected={selectedBlockId === block.id}
                      onSelect={() => setSelectedBlockId(block.id)}
                      onDelete={() => handleDeleteBlock(block.id)}
                      onDuplicate={() => handleDuplicateBlock(block.id)}
                    />
                  ))
                )}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeBlock && (
                <div className="flex items-center gap-2 p-3 bg-white border-2 border-primary rounded-lg shadow-lg opacity-90">
                  <span className="text-lg">{BLOCK_DEFINITIONS[activeBlock.type].icon}</span>
                  <span className="font-medium text-sm">{BLOCK_DEFINITIONS[activeBlock.type].label}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Properties / Preview */}
        <div className="space-y-4">
          {selectedBlock ? (
            <BlockPropertiesPanel
              block={selectedBlock}
              onUpdate={handleUpdateBlock}
              onClose={() => setSelectedBlockId(null)}
            />
          ) : (
            <div className="bg-gray-50 rounded-lg p-3">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Eye size={14} />
                Preview
              </h3>
              <div className="flex justify-center">
                <LivePreview blocks={blocks} paperSize={paperSize} />
              </div>
              <div className="mt-3">
                <label className="text-xs text-gray-600">Paper Size</label>
                <div className="flex gap-2 mt-1">
                  {(['58mm', '80mm'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setPaperSize(size)}
                      className={`flex-1 py-1 text-xs rounded border ${
                        paperSize === size
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
