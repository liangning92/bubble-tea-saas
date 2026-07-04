import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { posApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { Loader2, Printer, Box, CheckCircle, X, RefreshCw, ChevronLeft } from 'lucide-react'

// Electron API
const electronAPI = (window as any).electronAPI

interface HardwareSettings {
  printerConnectionType: 'usb' | 'network'
  printerIp: string
  printerPort: number
  printerName: string  // USB printer name (Windows printer name)
  autoOpenCashDrawer: boolean
}

export function HardwareSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  
  const [settings, setSettings] = useState<HardwareSettings>({
    printerConnectionType: 'usb',
    printerIp: '192.168.1.100',
    printerPort: 9100,
    printerName: '',
    autoOpenCashDrawer: true,
  })
  
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [testingPrint, setTestingPrint] = useState(false)
  const [testingCashDrawer, setTestingCashDrawer] = useState(false)
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // Load current settings
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const res = await posApi.getConfigs(user?.storeId || '', 'pos')
      const configs = res.data?.data || []
      const hwConfig = configs.find((c: any) => c.key === 'hardwareSettings')
      if (hwConfig?.value) {
        setSettings(prev => ({ ...prev, ...hwConfig.value }))
      }
      // Also detect printers if USB mode
      if (settings.printerConnectionType === 'usb') {
        detectPrinters()
      }
    } catch (err) {
      console.error('Failed to load hardware settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await posApi.setConfig(user?.storeId || '', 'hardwareSettings', settings, 'pos')
      setTestResult({ type: 'success', message: 'Settings saved!' })
      setTimeout(() => setTestResult(null), 2000)
    } catch (err) {
      setTestResult({ type: 'error', message: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const detectPrinters = async () => {
    if (!electronAPI?.listPrinters) {
      setTestResult({ type: 'error', message: 'Cannot detect printers: Electron API not available' })
      return
    }

    try {
      setDetecting(true)
      const res = await electronAPI.listPrinters()
      const printers = res.printers || []
      setDetectedPrinters(printers)
      
      // Upload to server so admin can see the list
      if (printers.length > 0) {
        try {
          await posApi.uploadPrinters(printers, user?.storeId || '')
          console.log('[Hardware] Uploaded printers to server:', printers)
        } catch (e) {
          console.error('[Hardware] Failed to upload printers:', e)
        }
      }
      
      if (printers.length === 0) {
        setTestResult({ type: 'error', message: 'No printers detected. Make sure your printer is turned on and connected.' })
      }
    } catch (err: any) {
      setTestResult({ type: 'error', message: `Detection failed: ${err.message || 'Unknown error'}` })
    } finally {
      setDetecting(false)
    }
  }

  const testPrint = async () => {
    if (!electronAPI?.sendPrintReceipt) {
      setTestResult({ type: 'error', message: 'Print function not available' })
      return
    }

    try {
      setTestingPrint(true)
      setTestResult(null)

      const printData = {
        orderNum: 'TEST-' + Date.now(),
        header: '🧋 Bubble Tea - Test Print',
        footer: 'Hardware Settings Test',
        printerName: settings.printerConnectionType === 'usb' ? settings.printerName : '',
        items: [
          {
            productName: 'Test Product',
            specName: 'Regular',
            quantity: 1,
            unitPrice: 10000,
            addons: []
          }
        ],
        subtotal: 10000,
        tax: 1100,
        total: 11100,
        paymentMethod: 'CASH',
        cashierName: user?.staff?.name || user?.phone || 'Admin',
        orderDate: new Date().toISOString(),
        paymentReceived: 20000,
        change: 8900
      }

      const res = await electronAPI.sendPrintReceipt(printData)
      if (res.success) {
        setTestResult({ type: 'success', message: 'Test print sent! Check your printer.' })
      } else {
        setTestResult({ type: 'error', message: `Print failed: ${res.error || 'Unknown error'}` })
      }
    } catch (err: any) {
      setTestResult({ type: 'error', message: `Print error: ${err.message || 'Unknown error'}` })
    } finally {
      setTestingPrint(false)
    }
  }

  const testCashDrawer = async () => {
    if (!electronAPI?.openCashDrawer) {
      setTestResult({ type: 'error', message: 'Cash drawer function not available' })
      return
    }

    try {
      setTestingCashDrawer(true)
      setTestResult(null)

      const res = await electronAPI.openCashDrawer({
        printerName: settings.printerConnectionType === 'usb' ? settings.printerName : undefined
      })

      if (res.success) {
        setTestResult({ type: 'success', message: 'Cash drawer opened!' })
      } else {
        setTestResult({ type: 'error', message: `Failed: ${res.error || 'Unknown error'}` })
      }
    } catch (err: any) {
      setTestResult({ type: 'error', message: `Error: ${err.message || 'Unknown error'}` })
    } finally {
      setTestingCashDrawer(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/20 rounded-lg">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-semibold">{t('hardware.title')}</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Test Result */}
        {testResult && (
          <div className={`p-4 rounded-xl flex items-center gap-3 ${
            testResult.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {testResult.type === 'success' ? <CheckCircle size={20} /> : <X size={20} />}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Printer Connection Type */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Printer size={20} />
            {t('hardware.printerConnection')}
          </h2>

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setSettings(s => ({ ...s, printerConnectionType: 'usb' }))}
              className={`flex-1 py-3 px-4 rounded-xl border-2 transition-colors ${
                settings.printerConnectionType === 'usb'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              <div className="text-2xl mb-1">🖨️</div>
              <div className="font-medium">{t('hardware.usbPrinter')}</div>
              <div className="text-xs text-gray-500">{t('hardware.directConnection')}</div>
            </button>
            <button
              onClick={() => setSettings(s => ({ ...s, printerConnectionType: 'network' }))}
              className={`flex-1 py-3 px-4 rounded-xl border-2 transition-colors ${
                settings.printerConnectionType === 'network'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              <div className="text-2xl mb-1">🌐</div>
              <div className="font-medium">{t('hardware.networkPrinter')}</div>
              <div className="text-xs text-gray-500">{t('hardware.viaIpAddress')}</div>
            </button>
          </div>

          {/* USB Printer Settings */}
          {settings.printerConnectionType === 'usb' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('hardware.printerName')}
                </label>
                <div className="flex gap-2">
                  <select
                    value={settings.printerName}
                    onChange={(e) => setSettings(s => ({ ...s, printerName: e.target.value }))}
                    className="flex-1 input"
                  >
                    <option value="">{t('hardware.selectPrinter')}</option>
                    {detectedPrinters.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <button
                    onClick={detectPrinters}
                    disabled={detecting}
                    className="btn-secondary px-4"
                  >
                    {detecting ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {detectedPrinters.length > 0
                    ? t('hardware.foundPrinters').replace('%d', String(detectedPrinters.length))
                    : t('hardware.clickRefresh')}
                </p>
              </div>

              {detectedPrinters.length === 0 && (
                <div className="p-4 bg-yellow-50 rounded-xl text-yellow-800">
                  <div className="font-medium mb-2">{t('hardware.noPrintersDetected')}</div>
                  <ul className="text-sm space-y-1">
                    <li>• {t('hardware.printerTips')}</li>
                    <li>• {t('hardware.checkUsbCable')}</li>
                    <li>• {t('hardware.installDriver')}</li>
                    <li>• {t('hardware.clickRefreshRetry')}</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Network Printer Settings */}
          {settings.printerConnectionType === 'network' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('hardware.printerIp')}
                </label>
                <input
                  type="text"
                  value={settings.printerIp}
                  onChange={(e) => setSettings(s => ({ ...s, printerIp: e.target.value }))}
                  className="input"
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('hardware.port')}
                </label>
                <input
                  type="number"
                  value={settings.printerPort}
                  onChange={(e) => setSettings(s => ({ ...s, printerPort: parseInt(e.target.value) || 9100 }))}
                  className="input"
                  placeholder="9100"
                />
              </div>
            </div>
          )}
        </div>

        {/* Cash Drawer */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Box size={20} />
            {t('hardware.cashDrawer')}
          </h2>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <div className="font-medium">{t('hardware.autoOpenCashDrawer')}</div>
              <div className="text-sm text-gray-500">{t('hardware.autoOpenHint')}</div>
            </div>
            <button
              onClick={() => setSettings(s => ({ ...s, autoOpenCashDrawer: !s.autoOpenCashDrawer }))}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                settings.autoOpenCashDrawer ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${
                settings.autoOpenCashDrawer ? 'translate-x-[26px]' : 'translate-x-[2px]'
              }`} />
            </button>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-xl text-blue-800 text-sm">
            {t('hardware.cashDrawerRj11Tip')}
          </div>
        </div>

        {/* Test Buttons */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">{t('hardware.testHardware')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={testPrint}
              disabled={testingPrint || (settings.printerConnectionType === 'usb' && !settings.printerName)}
              className="btn-secondary py-4 flex flex-col items-center gap-2 disabled:opacity-50"
            >
              {testingPrint ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <Printer size={24} />
              )}
              <span>{t('hardware.testPrint')}</span>
            </button>
            <button
              onClick={testCashDrawer}
              disabled={testingCashDrawer || (settings.printerConnectionType === 'usb' && !settings.printerName)}
              className="btn-secondary py-4 flex flex-col items-center gap-2 disabled:opacity-50"
            >
              {testingCashDrawer ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <Box size={24} />
              )}
              <span>{t('hardware.testCashDrawer')}</span>
            </button>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full btn-primary py-4 text-lg font-semibold"
        >
          {saving ? <Loader2 className="animate-spin mx-auto" size={24} /> : t('hardware.saveSettings')}
        </button>
      </div>
    </div>
  )
}
