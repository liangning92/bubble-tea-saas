import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { materialApi } from '../../services/api'
import { Loader2 } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'raw_material', label: '原料(毛料)' },
  { value: 'semi_finished', label: '加工原料(半成品)' },
  { value: 'finished_goods', label: '成品' }
]

const CATEGORY_OPTIONS = [
  { value: '茶叶', label: '茶叶' },
  { value: '奶类', label: '奶类' },
  { value: '糖类', label: '糖类' },
  { value: '小料', label: '小料' },
  { value: '调味糖浆', label: '调味糖浆' },
  { value: '耗材', label: '耗材' },
  { value: '其他', label: '其他' }
]

export function MaterialEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['material', id],
    queryFn: () => materialApi.get(id!),
    enabled: !!id
  })

  const [form, setForm] = useState({
    name: '',
    category: '茶叶',
    type: 'raw_material',
    unit: 'kg',
    avgCost: 0,
    concentrateRatio: 1,
    safetyStock: 0,
    minStock: 0,
    maxStock: 0,
    shelfLife: 0
  })

  useEffect(() => {
    if (data?.data) {
      const mat = data.data
      setForm({
        name: mat.name || '',
        category: mat.category || 'Other',
        type: mat.type || 'raw_material',
        unit: mat.unit || 'kg',
        avgCost: mat.avgCost || 0,
        concentrateRatio: mat.concentrateRatio || 1,
        safetyStock: mat.safetyStock || 0,
        minStock: mat.minStock || 0,
        maxStock: mat.maxStock || 0,
        shelfLife: mat.shelfLife || 0
      })
    }
  }, [data])

  const updateMutation = useMutation({
    mutationFn: (data: any) => materialApi.update(id!, data),
    onSuccess: () => navigate(`/inventory/material/${id}`)
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(form)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
    }

  return (
    <div className="max-w-xl">
      <button onClick={() => navigate(`/inventory/material/${id}`)} className="text-gray-600 hover:text-gray-900 mb-4">
        ← {t('common.back')}
      </button>

      <div className="card">
        <h2 className="text-lg font-semibold mb-6">编辑原料</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input w-full"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类 *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="input w-full"
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型 *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="input w-full"
              >
                {TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">单位 *</label>
            <select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="input w-full"
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="L">L</option>
              <option value="个">个</option>
              <option value="瓶">瓶</option>
              <option value="袋">袋</option>
              <option value="箱">箱</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">均价(分/unit)</label>
              <input
                type="number"
                value={form.avgCost}
                onChange={(e) => setForm({ ...form, avgCost: parseInt(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">浓缩比例</label>
              <input
                type="number"
                value={form.concentrateRatio}
                onChange={(e) => setForm({ ...form, concentrateRatio: parseFloat(e.target.value) || 1 })}
                className="input w-full"
                step="0.1"
              />
              <p className="text-xs text-gray-500 mt-1">如：茶叶浓缩10倍则填10</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">安全库存</label>
              <input
                type="number"
                value={form.safetyStock}
                onChange={(e) => setForm({ ...form, safetyStock: parseFloat(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">最低库存</label>
              <input
                type="number"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: parseFloat(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">最高库存</label>
              <input
                type="number"
                value={form.maxStock}
                onChange={(e) => setForm({ ...form, maxStock: parseFloat(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">保质期(天)</label>
            <input
              type="number"
              value={form.shelfLife}
              onChange={(e) => setForm({ ...form, shelfLife: parseInt(e.target.value) || 0 })}
              className="input w-full"
              placeholder={t('material.unlimitedPlaceholder')}
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={() => navigate(`/inventory/material/${id}`)} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={updateMutation.isPending} className="btn-primary flex items-center gap-2">
              {updateMutation.isPending && <Loader2 size={18} className="animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
