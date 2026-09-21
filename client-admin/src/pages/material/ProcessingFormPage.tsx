import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import { processRecipeApi, materialApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Plus, Trash2 } from 'lucide-react'

export function ProcessingFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuthStore()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    name: '',
    outputUnit: 'ml',
    inputs: [{ inventoryId: '', quantity: 0 }],
    outputs: [{ name: '', quantity: 0 }]
  })

  const { data: materialsData } = useQuery({
    queryKey: ['materials-for-recipe'],
    queryFn: () => materialApi.list()
  })

  const { data: recipeData, isLoading: recipeLoading } = useQuery({
    queryKey: ['process-recipe', id],
    queryFn: () => processRecipeApi.get(id!),
    enabled: isEdit && !!id
  })

  useEffect(() => {
    if (recipeData?.data) {
      const recipe = recipeData.data.data
      const inputs = recipe.items
        .filter((i: any) => i.type === 'input')
        .map((i: any) => ({ inventoryId: i.inventoryId, quantity: i.quantity }))
      const outputs = recipe.items
        .filter((i: any) => i.type === 'output')
        .map((i: any) => ({ name: i.name || recipe.outputName || '', quantity: i.quantity }))
      setForm({
        name: recipe.name || '',
        outputUnit: recipe.outputUnit || 'ml',
        inputs: inputs.length > 0 ? inputs : [{ inventoryId: '', quantity: 0 }],
        outputs: outputs.length > 0 ? outputs : [{ name: '', quantity: 0 }]
      })
    }
  }, [recipeData])

  const createMutation = useMutation({
    mutationFn: (data: any) => processRecipeApi.create(data),
    onSuccess: () => navigate('/inventory/process')
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => processRecipeApi.update(id!, data),
    onSuccess: () => navigate('/inventory/process')
  })

  const materials = materialsData?.data?.data?.list || []

  const addInput = () => {
    setForm({ ...form, inputs: [...form.inputs, { inventoryId: '', quantity: 0 }] })
  }

  const removeInput = (index: number) => {
    setForm({ ...form, inputs: form.inputs.filter((_, i) => i !== index) })
  }

  const updateInput = (index: number, field: string, value: any) => {
    const newInputs = [...form.inputs]
    newInputs[index] = { ...newInputs[index], [field]: value }
    setForm({ ...form, inputs: newInputs })
  }

  const addOutput = () => {
    setForm({ ...form, outputs: [...form.outputs, { name: '', quantity: 0 }] })
  }

  const removeOutput = (index: number) => {
    setForm({ ...form, outputs: form.outputs.filter((_, i) => i !== index) })
  }

  const updateOutput = (index: number, field: string, value: any) => {
    const newOutputs = [...form.outputs]
    newOutputs[index] = { ...newOutputs[index], [field]: value }
    setForm({ ...form, outputs: newOutputs })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const validInputs = form.inputs.filter(i => i.inventoryId && i.quantity > 0)
    const validOutputs = form.outputs.filter(o => o.name && o.quantity > 0)

    if (isEdit) {
      updateMutation.mutate({
        name: form.name,
        outputUnit: form.outputUnit,
        inputs: validInputs,
        outputs: validOutputs
      })
    } else {
      createMutation.mutate({
        storeId: user?.storeId,
        name: form.name,
        outputUnit: form.outputUnit,
        inputs: validInputs,
        outputs: validOutputs
      })
    }
  }

  if (isEdit && recipeLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/inventory/process')} className="text-gray-600 hover:text-gray-900 mb-4">
        ← {t('common.back')}
      </button>

      <div className="card">
        <h2 className="text-lg font-semibold mb-6">
          {isEdit ? t('material.editRecipe') || 'Edit Recipe' : t('material.addRecipe') || 'Add Recipe'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('material.recipeName') || 'Recipe Name'} *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input w-full"
                placeholder={t('bom.processNamePlaceholder')}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('material.outputUnit') || 'Output Unit'}
              </label>
              <select
                value={form.outputUnit}
                onChange={(e) => setForm({ ...form, outputUnit: e.target.value })}
                className="input w-full"
              >
                <option value="ml">{t('material.unitMl')}</option>
                <option value="g">{t('material.unitG')}</option>
                <option value="个">{t('material.unitPiece')}</option>
              </select>
            </div>
          </div>

           {/* Inputs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                {t('material.inputs') || 'Input Materials'}
              </label>
              <button type="button" onClick={addInput} className="text-sm text-primary flex items-center gap-1">
                <Plus size={16} /> {t('material.addInput')}
              </button>
            </div>
            <div className="space-y-2">
              {form.inputs.map((input, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={input.inventoryId}
                    onChange={(e) => updateInput(idx, 'inventoryId', e.target.value)}
                    className="input flex-1"
                  >
                    <option value="">{t('material.selectMaterial')}</option>
                    {materials.map((m: any) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={input.quantity}
                    onChange={(e) => updateInput(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    className="input w-24"
                    placeholder={t('bom.inputQuantityPlaceholder')}
                  />
                  {form.inputs.length > 1 && (
                    <button type="button" onClick={() => removeInput(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Outputs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                {t('material.outputs') || 'Output'}
              </label>
              <button type="button" onClick={addOutput} className="text-sm text-primary flex items-center gap-1">
                <Plus size={16} /> {t('material.addOutput')}
              </button>
            </div>
            <div className="space-y-2">
              {form.outputs.map((output, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={output.name}
                    onChange={(e) => updateOutput(idx, 'name', e.target.value)}
                    className="input flex-1"
                    placeholder={t('bom.outputNamePlaceholder')}
                  />
                  <input
                    type="number"
                    value={output.quantity}
                    onChange={(e) => updateOutput(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    className="input w-24"
                    placeholder={t('bom.outputQuantityPlaceholder')}
                  />
                  {form.outputs.length > 1 && (
                    <button type="button" onClick={() => removeOutput(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={() => navigate('/inventory/process')} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={18} className="animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
