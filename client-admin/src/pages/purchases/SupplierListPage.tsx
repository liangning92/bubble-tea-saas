import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supplierApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Plus, Edit2, Trash2, X } from 'lucide-react'

interface Supplier {
  id: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  note?: string
  isActive: boolean
  createdAt: string
}

export function SupplierListPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [formData, setFormData] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', note: '' })

  useEffect(() => {
    loadSuppliers()
  }, [user])

  const loadSuppliers = async () => {
    setIsLoading(true)
    try {
      const response = await supplierApi.list()
      setSuppliers(response.data?.data?.list || [])
    } catch (error) {
      console.error(t('common.error'), error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier)
      setFormData({
        name: supplier.name || '',
        contactPerson: supplier.contactPerson || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        note: supplier.note || ''
      })
    } else {
      setEditingSupplier(null)
      setFormData({ name: '', contactPerson: '', phone: '', email: '', address: '', note: '' })
    }
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      if (editingSupplier) {
        await supplierApi.update(editingSupplier.id, formData)
      } else {
        await supplierApi.create({ ...formData, storeId: user?.storeId })
      }
      setShowModal(false)
      loadSuppliers()
    } catch (error) {
      console.error(t('common.error'), error)
      alert(t('common.error'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirm'))) return
    try {
      await supplierApi.delete(id)
      loadSuppliers()
    } catch (error) {
      console.error(t('common.error'), error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-end">
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
            <Plus size={20} /> {t('purchases.addSupplier')}
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="p-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">{t('common.noData')}</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="px-4 py-3">{t('purchases.supplierName')}</th>
                  <th className="px-4 py-3">{t('purchases.contactPerson')}</th>
                  <th className="px-4 py-3">{t('common.phone')}</th>
                  <th className="px-4 py-3">{t('common.email')}</th>
                  <th className="px-4 py-3">{t('purchases.address')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{supplier.name}</td>
                    <td className="px-4 py-3">{supplier.contactPerson || '-'}</td>
                    <td className="px-4 py-3">{supplier.phone || '-'}</td>
                    <td className="px-4 py-3">{supplier.email || '-'}</td>
                    <td className="px-4 py-3">{supplier.address || '-'}</td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => handleOpenModal(supplier)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => handleDelete(supplier.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editingSupplier ? t('purchases.editSupplier') : t('purchases.addSupplier')}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('purchases.supplierName')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  placeholder={t('purchases.supplierNamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('purchases.contactPerson')}</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  className="input w-full"
                  placeholder={t('purchases.contactPersonPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.phone')}</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input w-full"
                  placeholder={t('common.phonePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.email')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input w-full"
                  placeholder={t('common.emailPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.address')}</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input w-full"
                  placeholder={t('common.addressPlaceholder')}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button onClick={handleSave} className="btn-primary flex-1">
                  {t('common.save')}
                </button>
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}