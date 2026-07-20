import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productApi, categoryApi, addonApi, uploadApi, inventoryApi, channelApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'
import { ArrowLeft, Upload, X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

export function ProductFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isEdit = !!id
  const [showBomSection, setShowBomSection] = useState(false)
  const [showChannelSection, setShowChannelSection] = useState(false)

  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    description: '',
    image: '',
    status: 'active',
    specs: [{ name: t('products.specMedium'), price: 0, isDefault: true }],
    addonIds: [] as string[],
    bomItems: [] as { inventoryId: string; quantity: number; name?: string; unit?: string; cost?: number }[],
    channelPrices: [] as { channelId: string; priceAdjustment: number; enabled: boolean }[]
  })

  const [uploadedImages, setUploadedImages] = useState<{ url: string; filename: string }[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryApi.list()
  })

  const { data: addonsData } = useQuery({
    queryKey: ['addons'],
    queryFn: () => addonApi.list()
  })

  const { data: inventoryData } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.list({ pageSize: 100 })
  })

  const { data: productData } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productApi.get(id!),
    enabled: !!id
  })

  // 获取渠道列表
  const { data: channelsData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelApi.list()
  })

  useEffect(() => {
    if (productData?.data) {
      const p = productData.data.data
      setForm({
        name: p.name,
        categoryId: p.categoryId,
        description: p.description || '',
        image: p.image || '',
        status: p.status,
        specs: p.specs?.length > 0 ? p.specs.filter((s: any) => s.name).map((s: any) => ({ name: s.name, price: s.price || 0 })) : [{ name: t('products.specMedium'), price: 0, isDefault: true }],
        addonIds: p.addons?.map((pa: any) => pa.addonId) || [],
        bomItems: p.bomItems?.map((b: any) => ({
          inventoryId: b.inventoryId,
          quantity: b.quantity,
          name: b.inventory?.name,
          unit: b.inventory?.unit,
          cost: b.inventory?.avgCost || 0
        })) || [],
        channelPrices: p.channelPrices || []
      })
      if (p.image) {
        const filename = p.image.split('/').pop()
        setUploadedImages([{ url: p.image, filename }])
      }
    }
  }, [productData])

  const createMutation = useMutation({
    mutationFn: (data: any) => {
      return productApi.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      navigate('/products')
    },
    onError: (error: any) => {
      console.error('Create product error:', error)
      console.error('Error response:', error?.response?.data)
      alert(error?.response?.data?.message || error.message || 'Failed to create product')
    }
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => productApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      navigate('/products')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()


    // Validation
    if (!form.name.trim()) {
      alert(t('products.nameRequired'))
      return
    }
    if (!form.categoryId) {
      alert(t('products.categoryRequired'))
      return
    }
    if (form.specs.length === 0 || !form.specs[0].name.trim()) {
      alert(t('products.specRequired'))
      return
    }
    if (form.specs.some(s => s.price < 0)) {
      alert(t('products.priceInvalid'))
      return
    }

    if (!user?.storeId) {
      alert(t('common.storeIdNotFound'))
      return
    }

    // Convert addonIds to addons format expected by backend
    const addons = form.addonIds.map(addonId => ({ addonId }))

    // Convert channelPrices to ProductChannelPrice format
    const channelPrices = form.channelPrices
      .filter(cp => cp.enabled)
      .map(cp => ({
        channelId: cp.channelId,
        priceAdjustment: cp.priceAdjustment,
        enabled: cp.enabled
      }))

    const data = {
      name: form.name,
      categoryId: form.categoryId,
      description: form.description,
      image: uploadedImages.length > 0 ? uploadedImages[0].url : '',
      status: form.status,
      specs: form.specs.map((s, i) => ({
        ...s,
        priceAdjustment: 0,
        isDefault: i === 0
      })),
      addons,
      bomItems: form.bomItems
        .filter(item => item.inventoryId && item.quantity > 0)
        .map(item => ({
          inventoryId: item.inventoryId,
          quantity: item.quantity
        })),
      channelPrices
    }
    if (isEdit) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate({ ...data, storeId: user?.storeId })
    }
  }

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsUploading(true)
    try {
      const fileArray = Array.from(files)
      const response = await uploadApi.uploadProduct(fileArray)
      const newImages = response.data.data.urls.map((url: string, i: number) => ({
        url,
        filename: response.data.data.filenames[i]
      }))
      setUploadedImages(prev => [...prev, ...newImages])
    } catch (error: any) {
      console.error('Upload failed:', error)
      const msg = error?.response?.data?.message || error?.message || '图片上传失败'
      alert(msg)
    } finally {
      setIsUploading(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleImageUpload(e.dataTransfer.files)
  }, [handleImageUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }, [])

  const removeImage = async (index: number) => {
    const image = uploadedImages[index]
    if (image.filename) {
      try {
        await uploadApi.delete('products', image.filename)
      } catch (error) {
        console.error('Delete image failed:', error)
      }
    }
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
  }

  const addSpec = () => {
    setForm({ ...form, specs: [...form.specs, { name: t('products.specLarge'), price: 0, isDefault: false }] })
  }

  const removeSpec = (index: number) => {
    setForm({ ...form, specs: form.specs.filter((_, i) => i !== index) })
  }

  const updateSpec = (index: number, field: string, value: any) => {
    const specs = [...form.specs]
    specs[index] = { ...specs[index], [field]: value }
    setForm({ ...form, specs })
  }

  const toggleAddon = (addonId: string) => {
    setForm(prev => ({
      ...prev,
      addonIds: prev.addonIds.includes(addonId)
        ? prev.addonIds.filter(id => id !== addonId)
        : [...prev.addonIds, addonId]
    }))
  }

  const categories = Array.isArray(categoriesData?.data?.data) ? categoriesData.data.data : []
  const addons = Array.isArray(addonsData?.data?.data) ? addonsData.data.data : []
  const inventoryItems = inventoryData?.data?.data?.list || []
  const channels = channelsData?.data?.data?.list || []

  const getChannelPrice = (channelId: string) => {
    return form.channelPrices.find(cp => cp.channelId === channelId)
  }

  const updateChannelPrice = (channelId: string, field: string, value: number | boolean) => {
    setForm(prev => {
      const existing = prev.channelPrices.find(cp => cp.channelId === channelId)
      if (existing) {
        return {
          ...prev,
          channelPrices: prev.channelPrices.map(cp =>
            cp.channelId === channelId ? { ...cp, [field]: value } : cp
          )
        }
      } else {
        return {
          ...prev,
          channelPrices: [...prev.channelPrices, { channelId, priceAdjustment: 1.0, enabled: true, [field]: value }]
        }
      }
    })
  }

  const calculateBomCost = () => {
    return form.bomItems.reduce((sum, item) => {
      return sum + (item.cost || 0) * item.quantity
    }, 0)
  }

  const addBomItem = () => {
    setForm(prev => ({
      ...prev,
      bomItems: [...prev.bomItems, { inventoryId: '', quantity: 0 }]
    }))
  }

  const removeBomItem = (index: number) => {
    setForm(prev => ({
      ...prev,
      bomItems: prev.bomItems.filter((_, i) => i !== index)
    }))
  }

  const updateBomItem = (index: number, field: string, value: any) => {
    setForm(prev => {
      const newBomItems = [...prev.bomItems]
      newBomItems[index] = { ...newBomItems[index], [field]: value }
      // Auto-fill name, unit, cost when inventoryId changes
      if (field === 'inventoryId') {
        const inv = inventoryItems.find((i: any) => i.id === value)
        if (inv) {
          newBomItems[index].name = inv.name
          newBomItems[index].unit = inv.unit
          newBomItems[index].cost = inv.avgCost || 0
        }
      }
      return { ...prev, bomItems: newBomItems }
    })
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/products" className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={20} />
        </Link>
      </div>

      <div className="card max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
         <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('products.name')}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('products.category')}
            </label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="input"
              required
            >
              <option value="">{t('products.selectCategory')}</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('products.description')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input"
              rows={3}
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('products.image')}
            </label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-gray-300'
              }`}
            >
              {uploadedImages.length > 0 ? (
                <div className="flex flex-wrap gap-4 justify-center">
                  {uploadedImages.map((img, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={img.url}
                        alt=""
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 p-1 bg-error text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {uploadedImages.length < 5 && (
                    <label className="w-24 h-24 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary">
                      <Plus size={24} className="text-gray-400" />
                      <span className="text-xs text-gray-500 mt-1">{t('common.add')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => { handleImageUpload(e.target.files); e.target.value = '' }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    {t('products.imageHint')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PNG, JPG up to 5MB
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => { handleImageUpload(e.target.files); e.target.value = '' }}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
              )}
              {isUploading && (
                <p className="text-sm text-primary mt-2">{t('common.loading')}</p>
              )}
            </div>
          </div>

          {/* Specs (Sizes) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('products.specs')}
            </label>
            <div className="space-y-3">
              {form.specs.map((spec, index) => (
                <div key={index} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={spec.name}
                    onChange={(e) => updateSpec(index, 'name', e.target.value)}
                    className="input w-32"
                    placeholder={t('products.specs')}
                  />
                  <input
                    type="number"
                    value={spec.price}
                    onChange={(e) => updateSpec(index, 'price', parseInt(e.target.value) || 0)}
                    className="input w-40"
                    placeholder={t('products.price')}
                  />
                  <span className="text-sm text-gray-500">IDR</span>
                  {form.specs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSpec(index)}
                      className="text-error hover:underline text-sm flex items-center gap-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSpec}
              className="mt-3 text-sm text-primary hover:underline flex items-center gap-1"
            >
              <Plus size={14} /> {t('products.addSize')}
            </button>
          </div>

          {/* Addons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('products.addons')}
            </label>
            <div className="flex flex-wrap gap-2">
              {addons.map((addon: any) => (
                <button
                  key={addon.id}
                  type="button"
                  onClick={() => toggleAddon(addon.id)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    form.addonIds.includes(addon.id)
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {addon.name}
                </button>
              ))}
              {addons.length === 0 && (
                <p className="text-sm text-gray-500">
                  {t('addons.addFirst')} - <Link to="/addons" className="text-primary hover:underline">{t('common.add')}</Link>
                </p>
              )}
            </div>
          </div>

          {/* BOM Section */}
          <div className="border-t pt-6">
            <button
              type="button"
              onClick={() => setShowBomSection(!showBomSection)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-gray-700">
                {t('products.bomItems')} ({t('products.cost')}: {formatCurrency(calculateBomCost())})
              </span>
              {showBomSection ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showBomSection && (
              <div className="mt-4 space-y-3">
                {form.bomItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                    <select
                      value={item.inventoryId}
                      onChange={(e) => updateBomItem(index, 'inventoryId', e.target.value)}
                      className="input flex-1"
                    >
                      <option value="">{t('products.selectIngredient')}</option>
                      {inventoryItems.map((inv: any) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name} ({inv.unit}) - {formatCurrency(inv.avgCost || 0)}{t('products.ingredientUnit')}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateBomItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="input w-24"
                      placeholder={t('inventory.quantity')}
                      step="0.01"
                    />
                    <span className="text-sm text-gray-500 w-12">{item.unit}</span>
                    <span className="text-sm font-medium w-24 text-right">
                      {formatCurrency((item.cost || 0) * item.quantity)}
                    </span>
                   <button
                      type="button"
                      onClick={() => removeBomItem(index)}
                      className="text-error hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addBomItem}
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <Plus size={14} /> {t('products.addIngredient')}
                </button>
              </div>
            )}
          </div>

          {/* Channel Prices Section */}
          <div className="border-t pt-6">
            <button
              type="button"
              onClick={() => setShowChannelSection(!showChannelSection)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-gray-700">
                {t('products.channelPrices')}
              </span>
              {showChannelSection ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showChannelSection && (
              <div className="mt-4 space-y-3">
                {channels.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('channels.addFirst')}</p>
                ) : (
                  channels.map((channel: any) => {
                    const channelPrice = getChannelPrice(channel.id)
                    const adjustment = channelPrice?.priceAdjustment || 1.0
                    const enabled = channelPrice?.enabled ?? (channel.commission > 0)
                    const basePrice = form.specs[0]?.price || 0
                    const channelPriceValue = Math.round(basePrice * adjustment)

                    return (
                      <div key={channel.id} className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => updateChannelPrice(channel.id, 'enabled', e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-lg">{channel.icon || '📦'}</span>
                        <span className="flex-1 text-sm font-medium">{channel.name}</span>
                        <span className="text-xs text-gray-500">
                          {t('channels.commission')} {(channel.commission * 100).toFixed(0)}%
                        </span>
                        <input
                          type="number"
                          value={(adjustment * 100).toFixed(0)}
                          onChange={(e) => updateChannelPrice(channel.id, 'priceAdjustment', (parseInt(e.target.value) || 100) / 100)}
                          className="input w-20 text-center"
                          min="50"
                          max="200"
                          disabled={!enabled}
                        />
                        <span className="text-sm text-gray-500">%</span>
                        <span className="text-sm text-gray-500 w-24 text-right">
                          ≈ {formatCurrency(channelPriceValue)}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="status"
              checked={form.status === 'active'}
              onChange={(e) => setForm({ ...form, status: e.target.checked ? 'active' : 'inactive' })}
            />
            <label htmlFor="status" className="text-sm text-gray-700">
              {t('products.active')}
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn-primary">
              {t('common.save')}
            </button>
            <Link to="/products" className="btn-secondary">
              {t('common.cancel')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}