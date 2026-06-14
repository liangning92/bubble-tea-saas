import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Download, CheckCircle, XCircle } from 'lucide-react'

// 导入类型
type ImportType = 'products' | 'inventory' | 'bom' | 'expenses'

// 导入结果
interface ImportResult {
  success: boolean
  total: number
  imported: number
  failed: number
  errors: string[]
}

// 导入模板定义
const TEMPLATES = {
  products: {
    name: '商品导入模板',
    description: '导入商品基本信息',
    fields: ['name', 'category', 'specs', 'price', 'cost', 'status'],
    sample: [
      { name: '珍珠奶茶', category: '奶茶', specs: '中杯,大杯', price: '15000,18000', cost: '5000', status: 'active' },
      { name: '芒果冰沙', category: '冰沙', specs: '小杯,大杯', price: '20000,25000', cost: '6000', status: 'active' }
    ]
  },
  inventory: {
    name: '库存导入模板',
    description: '导入库存原材料',
    fields: ['name', 'category', 'unit', 'stock', 'cost', 'supplier'],
    sample: [
      { name: '珍珠', category: '小料', unit: 'g', stock: '5000', cost: '15000', supplier: '供应商A' },
      { name: '牛奶', category: '原料', unit: 'ml', stock: '10000', cost: '8000', supplier: '供应商B' }
    ]
  },
  bom: {
    name: '配方导入模板',
    description: '导入商品配方(原料配比)',
    fields: ['product_name', 'material_name', 'quantity', 'unit'],
    sample: [
      { product_name: '珍珠奶茶', material_name: '珍珠', quantity: '30', unit: 'g' },
      { product_name: '珍珠奶茶', material_name: '牛奶', quantity: '200', unit: 'ml' },
      { product_name: '珍珠奶茶', material_name: '茶汤', quantity: '150', unit: 'ml' }
    ]
  },
  expenses: {
    name: '支出导入模板',
    description: '导入日常支出记录',
    fields: ['category', 'amount', 'description', 'date', 'type'],
    sample: [
      { category: 'rent', amount: '5000000', description: '店铺租金', date: '2024-01-01', type: 'operational' },
      { category: 'utilities', amount: '800000', description: '电费', date: '2024-01-05', type: 'operational' },
      { category: 'supplies', amount: '200000', description: '塑料袋采购', date: '2024-01-10', type: 'operational' }
    ]
  }
}

export function ImportPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [importType, setImportType] = useState<ImportType>('products')
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [preview, setPreview] = useState<any[]>([])

  // 导入mutation
  const importMutation = useMutation({
    mutationFn: async (data: { type: ImportType; rows: any[] }) => {
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 1000))
      return { success: true, total: data.rows.length, imported: data.rows.length, failed: 0, errors: [] }
    },
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    }
  })

  // 处理文件上传
  const handleFile = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    setFile(file)

    // 解析CSV
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(line => line.trim())
      const headers = lines[0].split(',').map(h => h.trim())
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim())
        const obj: any = {}
        headers.forEach((h, i) => obj[h] = values[i] || '')
        return obj
      })
      setPreview(rows.slice(0, 5))
    }
    reader.readAsText(file)
  }, [])

  // 拖放处理
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files)
  }, [handleFile])

  // 下载模板
  const downloadTemplate = (type: ImportType) => {
    const template = TEMPLATES[type]
    const headers = template.fields.join(',')
    const sampleRows = template.sample.map(row => Object.values(row).join(',')).join('\n')
    const csv = headers + '\n' + sampleRows

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}_template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 执行导入
  const handleImport = () => {
    if (!preview.length) return

    importMutation.mutate({ type: importType, rows: preview })
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('import.title') || 'Data Import'}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('import.description') || 'Import products, inventory and recipes'}</p>
      </div>

      {/* 导入类型选择 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['products', 'inventory', 'bom', 'expenses'] as ImportType[]).map(type => (
          <button
            key={type}
            onClick={() => { setImportType(type); setFile(null); setPreview([]); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              importType === type
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {type === 'products' && (t('import.products') || 'Products')}
            {type === 'inventory' && (t('import.inventory') || 'Inventory')}
            {type === 'bom' && (t('import.bom') || 'Recipe')}
            {type === 'expenses' && (t('import.expenses') || 'Expenses')}
          </button>
        ))}
      </div>

      {/* 上传区域 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-6 ${
          dragActive ? 'border-primary bg-primary/5' : 'border-gray-300'
        }`}
      >
        <Upload size={40} className="mx-auto text-gray-400 mb-4" />
        <p className="text-gray-600 mb-2">
          {t('import.dragHint') || 'Drag CSV file here, or'}
        </p>
        <label className="btn-primary cursor-pointer inline-block">
          {t('import.selectFile') || 'Select file'}
          <input
            type="file"
            accept=".csv"
            onChange={(e) => handleFile(e.target.files)}
            className="hidden"
          />
        </label>
        <p className="text-xs text-gray-400 mt-2">CSV格式, UTF-8编码</p>
      </div>

      {/* 文件信息 */}
      {file && (
        <div className="card mb-6">
          <div className="flex items-center gap-3">
            <FileText size={24} className="text-primary" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={() => { setFile(null); setPreview([]) }}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle size={20} />
            </button>
          </div>
        </div>
      )}

      {/* 预览数据 */}
      {preview.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">{t('import.preview') || 'Data Preview'} ({preview.length} {t('import.rows') || 'rows'})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {Object.keys(preview[0] || {}).map(key => (
                    <th key={key} className="text-left py-2 px-3 font-medium text-gray-500">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b">
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="py-2 px-3">{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleImport}
              disabled={importMutation.isPending}
              className="btn-primary"
            >
              {importMutation.isPending ? t('import.importing') || 'Importing...' : t('import.startImport') || 'Start Import'}
            </button>
          </div>
        </div>
      )}

      {/* 导入结果 */}
      {result && (
        <div className={`card ${result.success ? 'border-green-500' : 'border-red-500'}`}>
          <div className="flex items-center gap-3">
            {result.success ? (
              <CheckCircle size={24} className="text-green-500" />
            ) : (
              <XCircle size={24} className="text-red-500" />
            )}
            <div>
              <p className="font-medium">
                {result.success ? (t('import.success') || 'Import successful') : (t('import.failed') || 'Import failed')}
              </p>
              <p className="text-sm text-gray-500">
                {t('import.total') || 'Total'}: {result.total} |
                {t('import.imported') || 'Success'}: {result.imported} |
                {t('import.failed') || 'Failed'}: {result.failed}
              </p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg">
              <p className="text-sm text-red-600">{result.errors.slice(0, 5).join('\n')}</p>
            </div>
          )}
        </div>
      )}

      {/* 下载模板 */}
      <div className="card mt-6">
        <h3 className="font-semibold mb-4">{t('import.templates') || 'Download Templates'}</h3>
        <div className="grid grid-cols-3 gap-4">
          {(['products', 'inventory', 'bom'] as ImportType[]).map(type => (
            <div key={type} className="p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{TEMPLATES[type].name}</p>
                  <p className="text-sm text-gray-500">{TEMPLATES[type].description}</p>
                </div>
                <button
                  onClick={() => downloadTemplate(type)}
                  className="btn-outline text-sm flex items-center gap-1"
                >
                  <Download size={14} />
                  {t('import.download') || 'Download'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}