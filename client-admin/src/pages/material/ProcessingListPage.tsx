import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { processRecipeApi, materialApi } from '../../services/api'
import { formatCurrency } from '../../utils/helpers'
import { Plus, Play, Loader2, Clock, Package, Edit2, Trash2 } from 'lucide-react'

export function ProcessingListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [executingId, setExecutingId] = useState<string | null>(null)

  const { data: recipesData, isLoading } = useQuery({
    queryKey: ['process-recipes'],
    queryFn: () => processRecipeApi.list()
  })

  const executeMutation = useMutation({
    mutationFn: ({ id, multiplier }: { id: string; multiplier: number }) =>
      processRecipeApi.execute(id, { multiplier }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['process-recipes'] })
      queryClient.invalidateQueries({ queryKey: ['material-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      setExecutingId(null)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => processRecipeApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['process-recipes'] })
    }
  })

  const recipes = recipesData?.data?.data?.list || recipesData?.data || []

  const handleExecute = (recipeId: string) => {
    const multiplier = prompt(t('material.enterMultiplier') || 'Enter multiplier:', '1')
    if (multiplier && !isNaN(parseFloat(multiplier))) {
      setExecutingId(recipeId)
      executeMutation.mutate({ id: recipeId, multiplier: parseFloat(multiplier) })
    }
  }

  const handleDelete = (id: string, name: string) => {
    if (confirm(t('material.deleteRecipeConfirm', { name }) || `确定删除配方"${name}"吗？`)) {
      deleteMutation.mutate(id)
    }
  }

  const calculateRecipeCost = (recipe: any) => {
    if (!recipe.items) return 0
    let total = 0
    for (const item of recipe.items) {
      if (item.type === 'input') {
        const inv = item.inventory
        if (inv) {
          total += item.quantity * (inv.avgCost || 0)
        }
      }
    }
    return total
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('material.processRecipes') || 'Processing Recipes'}</h1>
        <Link to="/inventory/process/new" className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          {t('material.addRecipe') || 'Add Recipe'}
        </Link>
      </div>

      {/* Quick Execute */}
      <div className="card">
        <h3 className="font-semibold mb-4">{t('material.quickExecute') || 'Quick Execute'}</h3>
        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" size={32} /></div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{t('material.noRecipes') || 'No processing recipes'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map((recipe: any) => {
              const inputItems = recipe.items?.filter((i: any) => i.type === 'input') || []
              const outputItems = recipe.items?.filter((i: any) => i.type === 'output') || []
              const cost = calculateRecipeCost(recipe)

              return (
                <div key={recipe.id} className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{recipe.name}</h4>
                      <p className="text-sm text-gray-500">
                        → {recipe.outputName} ({recipe.outputUnit})
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/inventory/process/${recipe.id}/edit`)}
                        className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(recipe.id, recipe.name)}
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={18} />
                      </button>
                      <button
                        onClick={() => handleExecute(recipe.id)}
                        disabled={executingId === recipe.id}
                        className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                      >
                        {executingId === recipe.id ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Play size={18} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">{t('material.inputs') || 'Inputs'}</div>
                    {inputItems.map((item: any) => (
                      <div key={item.id} className="text-sm flex justify-between">
                        <span>{item.inventory?.name || '-'}</span>
                        <span className="text-gray-500">
                          {item.quantity} {item.inventory?.unit || ''}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Outputs */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1">{t('material.outputs') || 'Outputs'}</div>
                    {outputItems.map((item: any) => (
                      <div key={item.id} className="text-sm flex justify-between">
                        <span>{item.inventory?.name || '-'}</span>
                        <span className="text-green-600 font-medium">
                          {item.quantity} {item.inventory?.unit || ''}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Cost */}
                  <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
                    <span className="text-gray-500">{t('material.estimatedCost') || 'Est. Cost'}</span>
                    <span className="font-medium">{formatCurrency(cost)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Processing History */}
      <ProcessingHistory />
    </div>
  )
}

function ProcessingHistory() {
  const { t } = useTranslation()
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['processing-history'],
    queryFn: () => materialApi.processHistory(20)
  })

  const history = Array.isArray(historyData?.data?.data) ? historyData?.data?.data : []

  if (isLoading) {
    return (
      <div className="card">
        <h3 className="font-semibold mb-4">{t('material.processHistory') || 'Process History'}</h3>
        <div className="text-center py-8"><Loader2 className="animate-spin mx-auto" size={32} /></div>
      </div>
    )
  }

  if (history.length === 0) return null

  return (
    <div className="card">
      <h3 className="font-semibold mb-4">{t('material.processHistory') || 'Process History'}</h3>
      <div className="space-y-3">
        {history.map((log: any) => {
          const inputs = typeof log.inputItems === 'string' ? JSON.parse(log.inputItems) : log.inputItems
          const outputs = typeof log.outputItems === 'string' ? JSON.parse(log.outputItems) : log.outputItems

          return (
            <div key={log.id} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-400" />
                  <span className="font-medium">{log.recipe?.name || t('material.recipe')}</span>
                  <span className="text-sm text-gray-500">{t('material.multiplier', { value: log.multiplier })}</span>
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 mb-1">{t('material.inputs') || 'Inputs'}</div>
                  {inputs.map((item: any, idx: number) => (
                    <div key={idx} className="text-gray-600">
                      {item.name}: {item.quantity} {item.unit}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-gray-500 mb-1">{t('material.outputs') || 'Outputs'}</div>
                  {outputs.map((item: any, idx: number) => (
                    <div key={idx} className="text-green-600">
                      {item.name}: {item.quantity} {item.unit}
                    </div>
                  ))}
                </div>
              </div>
              {log.note && <div className="mt-2 text-sm text-gray-500">{log.note}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}