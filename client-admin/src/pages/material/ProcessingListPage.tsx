import { formatNumber } from '../../utils/numberDisplay'
import { formatDisplayQuantity } from '../../utils/itemDisplayName'
import { confirmAdmin } from '../../components/AdminFeedback'
import { AdminDialog } from '../../components/AdminDialog'
import dateLocaleI18n from '../../i18n'
import {ActorName} from '../../components/InventoryActor'
import {inventoryInputUnits,defaultInventoryInputUnit,inventoryLedgerQuantity} from '../../utils/inventoryInputUnits'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { processRecipeApi, materialApi } from '../../services/api'
import { formatCurrency, formatItemName } from '../../utils/helpers'
import { Plus, Play, Loader2, Clock, Package, Edit2, Trash2 } from 'lucide-react'

export function ProcessingListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selected,setSelected]=useState<any>(null),[quantity,setQuantity]=useState(''),[inputUnit,setInputUnit]=useState(''),[operationId,setOperationId]=useState('')
  const [executingId, setExecutingId] = useState<string | null>(null)

  const { data: recipesData, isLoading, isError,refetch } = useQuery({
    queryKey: ['process-recipes'],
    queryFn: () => processRecipeApi.list()
  })

  const executeMutation = useMutation({
    mutationFn: ({ id, multiplier }: { id: string; multiplier: number }) =>
      processRecipeApi.execute(id, { multiplier,operationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['process-recipes'] })
      queryClient.invalidateQueries({ queryKey: ['material-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      setExecutingId(null);setSelected(null)
      queryClient.invalidateQueries({queryKey:['processing-history']})
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => processRecipeApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['process-recipes'] })
    }
  })

  const recipes = recipesData?.data?.data?.list || []

  const handleExecute = (recipeId: string) => {
    const recipe=recipes.find((r:any)=>r.id===recipeId),material=(recipe.rawInputs||recipe.items.filter((i:any)=>i.type==='input'))[0]?.inventory
    setSelected(recipe);setQuantity('');setInputUnit(material?defaultInventoryInputUnit(material):'');setOperationId(crypto.randomUUID())
  }

  const handleDelete = async (id: string, name: string) => {
    if (await confirmAdmin(t('material.deleteRecipeConfirm', { name }))) {
      deleteMutation.mutate(id)
    }
  }

  const calculateRecipeCost = (recipe: any) => {
    return Number(recipe.totalInputCost||0)
  }
  const firstInput=(selected?.rawInputs||selected?.items.filter((i:any)=>i.type==='input')||[])[0],base=firstInput?.inventory,multiplier=base&&firstInput.quantity>0?inventoryLedgerQuantity(Number(quantity),base,inputUnit)/firstInput.quantity:0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('material.processRecipes') || 'Processing Recipes'}</h1>
        <Link to="/inventory/process/new" className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          {t('material.addRecipe') || 'Add Recipe'}
        </Link>
      </div>

      <p className="text-sm bg-blue-50 p-3 rounded-lg">{t('inventoryProcessing.hint')}</p>
      {isError&&<p role="alert" className="text-red-700">{t('inventoryProcessing.failed')} <button className="underline" onClick={()=>refetch()}>{t('common.refresh')}</button></p>}
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
                        aria-label={t('material.editRecipe')+' '+recipe.name}
                        onClick={() => navigate(`/inventory/process/${recipe.id}/edit`)}
                        className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        aria-label={t('common.delete')+' '+recipe.name}
                        onClick={() => handleDelete(recipe.id, recipe.name)}
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={18} />
                      </button>
                      <button
                        aria-label={t('inventoryProcessing.title')+' '+recipe.name}
                        onClick={() => handleExecute(recipe.id)}
                        disabled={executeMutation.isPending || recipe.status!=='active'}
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
                        <span>{formatItemName(item.inventory?.name || '-', i18n.language)}</span>
                        <span className="text-gray-500">
                          {formatNumber(item.quantity)} {item.inventory?.unit || ''}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Outputs */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1">{t('material.outputs') || 'Outputs'}</div>
                    {outputItems.map((item: any) => (
                      <div key={item.id} className="text-sm flex justify-between">
                        <span>{formatItemName(item.name || item.inventory?.name || '-', i18n.language)}</span>
                        <span className="text-green-600 font-medium">
                          {formatNumber(item.quantity)} {recipe.outputUnit}
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

      {selected&&<AdminDialog title={t('inventoryProcessing.title')} onClose={()=>setSelected(null)} className="max-w-lg" busy={Boolean(executeMutation.isPending)} trackChanges chrome><form onSubmit={e=>{e.preventDefault();setExecutingId(selected.id);executeMutation.mutate({id:selected.id,multiplier})}} className="space-y-4"><p className="font-medium">{selected.name}</p><p className="text-sm text-gray-600">{t('inventoryProcessing.hint')}</p><div className="grid grid-cols-2 gap-3"><label className="flex flex-col justify-between gap-1 min-w-0">{t('inventoryProcessing.input')}<input type="number" step="any" min="0.000000001" required className="input w-full" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label className="flex flex-col justify-between gap-1 min-w-0">{t('inventoryProcessing.unit')}<select className="input w-full" value={inputUnit} onChange={e=>setInputUnit(e.target.value)}>{(base?inventoryInputUnits(base):[]).map(u=><option key={u}>{u}</option>)}</select></label></div><h3>{t('inventoryProcessing.deduct')}</h3>{(selected.rawInputs||selected.items.filter((i:any)=>i.type==='input')).map((i:any)=><p key={i.id}>{formatItemName(i.inventory||'',i18n.language)}: {formatDisplayQuantity(i.quantity*multiplier)} {i.inventory?.unit}</p>)}<h3>{t('inventoryProcessing.output')}</h3>{selected.items.filter((i:any)=>i.type==='output').map((i:any)=><p key={i.id}>{i.name}: {formatDisplayQuantity(i.quantity*multiplier)} {selected.outputUnit}</p>)}{executeMutation.isError&&<p role="alert" className="text-red-700">{t('inventoryProcessing.failed')}</p>}<div className="admin-dialog-footer flex justify-end gap-3"><button type="button" data-dialog-close="true" disabled={executeMutation.isPending} className="btn-secondary" onClick={()=>setSelected(null)}>{t('common.cancel')}</button><button disabled={executeMutation.isPending||multiplier<=0} className="btn-primary">{t('inventoryProcessing.confirm')}</button></div></form></AdminDialog>}
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

  // Helper to safely parse JSON
  const safeParse = (str: any, fallback: any[]) => {
    if (!str) return fallback
    if (Array.isArray(str)) return str
    try {
      return JSON.parse(str)
    } catch {
      return fallback
    }
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-4">{t('material.processHistory') || 'Process History'}</h3>
      <div className="space-y-3">
        {history.map((log: any) => {
          const inputs = safeParse(log.inputItems, [])
          const outputs = safeParse(log.outputItems, [])

          return (
            <div key={log.id} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-400" />
                  <span className="font-medium">{log.recipe?.name || t('material.recipe')}</span>
                  <span className="text-sm text-gray-500">{t('material.multiplier', { value: log.multiplier })}</span>
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(log.createdAt).toLocaleString(dateLocaleI18n.language)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 mb-1">{t('material.inputs') || 'Inputs'}</div>
                  {inputs.length > 0 ? inputs.map((item: any, idx: number) => (
                    <div key={idx} className="text-gray-600">
                      {item.name}: {formatNumber(item.quantity)} {item.unit}
                    </div>
                  )) : <div className="text-gray-400">-</div>}
                </div>
                <div>
                  <div className="text-gray-500 mb-1">{t('material.outputs') || 'Outputs'}</div>
                  {outputs.length > 0 ? outputs.map((item: any, idx: number) => (
                    <div key={idx} className="text-green-600">
                      {item.name}: {formatNumber(item.quantity)} {item.unit}
                    </div>
                  )) : <div className="text-gray-400">-</div>}
                </div>
              </div>
              {log.note&&<p className="text-sm text-gray-500">{(()=>{try{return JSON.parse(log.note).note||''}catch{return log.note}})()}</p>}<p className="mt-2 text-sm">{t('inventoryActors.operator')}: <ActorName actor={log.operator} id={log.staffId}/></p>
            </div>
          )
        })}
      </div>
    </div>
  )
}