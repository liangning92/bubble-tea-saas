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
  CheckCircle,
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
  url?: string
  // header
  text?: string
  // storeInfo
  showPhone?: boolean
  showAddress?: boolean
  phone?: string
  address?: string
  // orderInfo
  showPickupNumber?: boolean
  showOrderNo?: boolean
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
  showDiscountDetail?: boolean
  discountLabel?: string
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

// Maps block types to their i18n keys under posSettings.*
const BLOCK_LABEL_KEYS: Record<BlockType, string> = {
  logo: 'blockLogo',
  header: 'blockHeader',
  storeInfo: 'blockStoreInfo',
  orderInfo: 'blockOrderInfo',
  items: 'blockItems',
  subtotal: 'blockSubtotal',
  tax: 'blockTax',
  total: 'blockTotal',
  paymentInfo: 'blockPaymentInfo',
  qrCode: 'blockQrCode',
  barcode: 'blockBarcode',
  footer: 'blockFooter',
  divider: 'blockDivider',
  customText: 'blockCustomText',
}

const BLOCK_DEFINITIONS: Record<
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
    defaultConfig: { text: 'YOUME' },
  },
  storeInfo: {
    label: 'Store Info',
    icon: '🏪',
    defaultConfig: { showPhone: true, showAddress: true },
  },
  orderInfo: {
    label: 'Order Info',
    icon: '📋',
    defaultConfig: { showPickupNumber: true, showOrderNo: true, showDate: true, showTime: true, showCashier: true, showCustomer: true, showChannel: true },
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

// Get block definition with translated label
function getBlockDef(t: (key: string) => string, type: BlockType) {
  const def = BLOCK_DEFINITIONS[type]
  return {
    ...def,
    label: t(`posSettings.${BLOCK_LABEL_KEYS[type]}`),
  }
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
  defaultLogo?: string
  defaultQrCode?: string
}> = ({ blocks, paperSize, defaultLogo, defaultQrCode }) => {
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
          case 'logo': {
            const effectiveLogo = block.config.url || defaultLogo
            return (
              <div key={block.id} className={`${alignClass} mb-2`}>
                <div className="border rounded p-1 inline-block">
                  {effectiveLogo ? (
                    <img
                      src={effectiveLogo}
                      alt="Logo"
                      style={{ width: block.config.width ? `${block.config.width}px` : '100px' }}
                      className="max-h-20 object-contain inline-block"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-20 h-12 bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">
                      LOGO
                    </div>
                  )}
                </div>
              </div>
            )
          }
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
          case 'orderInfo': {
            const showPickup = block.config.showPickupNumber !== false
            const showOrder = block.config.showOrderNo !== false
            return (
              <div key={block.id} className={`${alignClass} ${sizeClass} border-b pb-2 mb-2`}>
                {showPickup && (
                  <div className="text-center font-bold text-sm my-1 tracking-wider py-1 border border-dashed border-gray-300 rounded bg-gray-50/60">
                    *** {t('posSettings.receiptQueueNumber', '取餐号')}: A01 ***
                  </div>
                )}
                {showOrder && (
                  <div className="font-mono text-[11px] text-gray-700">
                    {t('posSettings.orderNumber', 'Order number')}: ORD{new Date().toISOString().slice(0, 10).replace(/-/g, '')}-829102
                  </div>
                )}
                {block.config.showDate && <div>{t('posSettings.receiptDate')}: {new Date().toLocaleDateString('id-ID')}</div>}
                {block.config.showTime && <div>{t('posSettings.receiptTime')}: {new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</div>}
                {block.config.showCashier && <div>{t('posSettings.receiptCashier')}: {t('posSettings.receiptSampleCashier')}</div>}
                {block.config.showCustomer && <div>{t('posSettings.receiptCustomer')}: -</div>}
                {block.config.showChannel && <div>{t('posSettings.receiptChannel')}: POS</div>}
              </div>
            )
          }
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
                <span>{block.config.label || t('posSettings.blockTax') + ' (' + (block.config.rate || 11) + '%)'}</span>
                <span>3,850</span>
              </div>
            )
          case 'total': {
            const showDisc = block.config.showDiscountDetail !== false
            return (
              <div key={block.id} className="border-b pb-2 mb-2 space-y-1">
                {showDisc && (
                  <div className={`flex justify-between text-emerald-700 ${sizeClass} font-medium`}>
                    <span>{block.config.discountLabel || t('posSettings.receiptDiscount', 'Discount (second drink half price)')}</span>
                    <span>-10,000</span>
                  </div>
                )}
                <div className={`flex justify-between font-bold ${sizeClass}`}>
                  <span>{block.config.totalLabel || t('posSettings.receiptTotal')}</span>
                  <span>38,850</span>
                </div>
              </div>
            )
          }
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
          case 'qrCode': {
            const effectiveQr = block.config.url || defaultQrCode
            return (
              <div key={block.id} className={`${alignClass} border-b pb-2 mb-2`}>
                {effectiveQr ? (
                  <img
                    src={effectiveQr}
                    alt="QR"
                    style={{ width: block.config.size || 80, height: block.config.size || 80 }}
                    className="mx-auto object-contain inline-block"
                    onError={(e) => { (e.target as any).style.display = 'none' }}
                  />
                ) : (
                  <div
                    className="bg-gray-100 mx-auto flex items-center justify-center border border-dashed border-gray-300"
                    style={{ width: block.config.size || 80, height: block.config.size || 80 }}
                  >
                    <span className="text-[9px] text-gray-500 font-bold">QR CODE</span>
                  </div>
                )}
              </div>
            )
          }
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
  const { t } = useTranslation()
  const def = 