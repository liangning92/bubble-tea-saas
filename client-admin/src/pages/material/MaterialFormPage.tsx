import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { materialApi, processRecipeApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2 } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'raw_material', labelKey: 'material.typeRawMaterial' },
  { value: 'semi_finished', labelKey: 'material.typeSemiFinished' },
  { value: 'finished_goods', labelKey: 'material.typeFinishedGoods' }
]

const CATEGORY_OPTIONS = [
  { value: '茶叶', labelKey: 'material.categoryTea' },
  { value: '奶类', labelKey: 'material.categoryMilk' },
  { value: '糖类', labelKey: 'material.categorySugar' },
  { value: '小料', labelKey: 'material.categoryTopping' },
  { value: '调味糖浆', labelKey: 'material.categorySyrup' },
  { value: '耗材', labelKey: 'material.categoryConsumable' },
  { value: '其他', labelKey: 'material.categoryOther' }
]

export function MaterialFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

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
    shelfLife: 0,
    processRecipeId: ''
  })

  // Fetch process recipes for semi_finished type
  const { data: recipesData } = useQuery({
    queryKey: ['process-recipes'],
    queryFn: () => processRecipeApi.list()
  })

  const recipes = recipesData?.data?.data?.list || []

  const createMutation = useMutation({
    mutationFn: (data: any) => materialApi.create(data),
    onSuccess: () => navigate('/inventory/material')
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ ...form, storeId: user?.storeId })
  }

  return (
    <div className="max-w-xl">
      <button onClick={() => navigate('/inventory/material')} className="text-gray-600 hover:text-gray-900 mb-4">
        ← {t('common.back')}
      </button>

      <div className="card">
        <h2 className="text-lg font-semibold mb-6">{t('material.addMaterial') || 'Add Material'}</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.name') || 'Name'} *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input w-full"
              placeholder={t('material.materialNamePlaceholder')}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.category') || 'Category'} *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="input w-full"
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.type') || 'Type'} *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value, processRecipeId: '' })}
                className="input w-full"
              >
                {TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </select>
            </div>
          </div>

          {form.type === 'semi_finished' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.linkedRecipe')} *</label>
              <select
                value={form.processRecipeId}
                onChange={(e) => setForm({ ...form, processRecipeId: e.target.value })}
                className="input w-full"
                required
              >
                <option value="">{t('material.selectRecipe')}</option>
                {recipes.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name} → {r.outputName} ({r.outputUnit})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {t('material.semiFinishedHint')}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.unit')} *</label>
            <select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="input w-full"
            >
              <option value="kg">{t('material.unitKg')}</option>
              <option value="g">{t('material.unitG')}</option>
              <option value="ml">{t('material.unitMl')}</option>
              <option value="L">{t('material.unitL')}</option>
              <option value="个">{t('material.unitPiece')}</option>
              <option value="瓶">{t('material.unitBottle')}</option>
              <option value="袋">{t('material.unitBag')}</option>
              <option value="箱">{t('material.unitBox')}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.avgCost')} (Rp/unit)</label>
              <input
                type="number"
                value={form.avgCost}
                onChange={(e) => setForm({ ...form, avgCost: parseInt(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.concentrateRatio')}</label>
              <input
                type="number"
                value={form.concentrateRatio}
                onChange={(e) => setForm({ ...form, concentrateRatio: parseFloat(e.target.value) || 1 })}
                className="input w-full"
                step="0.1"
              />
              <p className="text-xs text-gray-500 mt-1">{t('material.concentrateRatioHint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.safetyStock')}</label>
              <input
                type="number"
                value={form.safetyStock}
                onChange={(e) => setForm({ ...form, safetyStock: parseFloat(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.minStock')}</label>
              <input
                type="number"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: parseFloat(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.maxStock')}</label>
              <input
                type="number"
                value={form.maxStock}
                onChange={(e) => setForm({ ...form, maxStock: parseFloat(e.target.value) || 0 })}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('material.shelfLife')}</label>
            <input
              type="number"
              value={form.shelfLife}
              onChange={(e) => setForm({ ...form, shelfLife: parseInt(e.target.value) || 0 })}
              className="input w-full"
              placeholder={t('material.unlimitedPlaceholder')}
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={() => navigate('/inventory/material')} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary flex items-center gap-2">
              {createMutation.isPending && <Loader2 size={18} className="animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}