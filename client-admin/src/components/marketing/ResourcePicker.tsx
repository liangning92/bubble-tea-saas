import { useId, useState } from 'react'
import { Search, X, Package } from 'lucide-react'
import { useMarketingCopy } from './MarketingLayout'

export interface ResourceOption { id: string; name: string; subtitle?: string; group?: string }

export function ResourcePicker({ label, options, value, onChange, single = false, limit = 100, loading = false }: {
  label: string; options: ResourceOption[]; value: string[]; onChange: (ids: string[]) => void; single?: boolean; limit?: number; loading?: boolean
}) {
  const l = useMarketingCopy(), id = useId()
  const [search, setSearch] = useState(''), [group, setGroup] = useState('')
  const groups = [...new Set(options.map(option => option.group).filter(Boolean))] as string[]
  const visible = options.filter(option => (!group || option.group === group) && `${option.name} ${option.subtitle || ''}`.toLowerCase().includes(search.toLowerCase()))
  const toggle = (optionId: string) => onChange(value.includes(optionId) ? value.filter(item => item !== optionId) : single ? [optionId] : value.length < limit ? [...value, optionId] : value)
  return <section aria-labelledby={id} className="rounded-lg border border-border overflow-hidden bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gray-50 border-b border-border">
      <h3 id={id} className="text-sm font-medium">{label} <span className="text-gray-500 font-normal">({value.length})</span></h3>
      {value.length > 0 && <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange([])}>{l('清空选择','Clear selection','Hapus pilihan')}</button>}
    </div>
    <div className="p-3 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-gray-400" /><input aria-label={l('搜索','Search','Cari') + ' ' + label} className="input pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={l('搜索名称或编码','Search name or code','Cari nama atau kode')} /></div>
        {groups.length > 0 && <select aria-label={l('分类筛选','Category filter','Filter kategori') + ' ' + label} className="input sm:w-44" value={group} onChange={event => setGroup(event.target.value)}><option value="">{l('全部分类','All categories','Semua kategori')}</option>{groups.map(name => <option key={name}>{name}</option>)}</select>}
      </div>
      {!single && visible.length > 0 && <button type="button" className="text-xs text-primary" onClick={() => onChange([...new Set([...value, ...visible.map(option => option.id)])].slice(0, limit))}>{l('选择筛选结果','Select filtered results','Pilih hasil filter')} ({visible.length})</button>}
      <div className="max-h-56 overflow-auto divide-y divide-gray-100">
        {loading ? <p className="py-6 text-center text-sm text-gray-500">{l('正在加载…','Loading…','Memuat…')}</p> : visible.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">{l('没有匹配的选项','No matching options','Tidak ada pilihan yang cocok')}</p> : visible.map(option => <label key={option.id} className={`flex items-center gap-3 px-2 py-3 rounded cursor-pointer hover:bg-gray-50 ${value.includes(option.id) ? 'bg-primary/5' : ''}`}>
          <input type="checkbox" checked={value.includes(option.id)} disabled={!single && !value.includes(option.id) && value.length >= limit} onChange={() => toggle(option.id)} />
          <Package size={18} className="text-gray-400 shrink-0" /><span className="min-w-0"><span className="block text-sm font-medium text-gray-900 break-words">{option.name}</span>{option.subtitle && <span className="block text-xs text-gray-500">{option.subtitle}</span>}</span>
        </label>)}
      </div>
      {value.length > 0 && <div className="flex flex-wrap gap-2 border-t border-border pt-3">{value.map(selectedId => <span key={selectedId} className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs text-gray-700">{options.find(option => option.id === selectedId)?.name || l('已关联的停用资源','Linked inactive resource','Sumber nonaktif terkait')}<button type="button" aria-label={l('移除','Remove','Hapus') + ' ' + (options.find(option => option.id === selectedId)?.name || selectedId)} onClick={() => onChange(value.filter(item => item !== selectedId))}><X size={12} /></button></span>)}</div>}
      {!single && <p className="text-xs text-gray-400">{l('按分类批量选择只包含当前商品；新商品需另行加入。最多选择','Batch selection includes current items; add new items separately. Maximum','Pilihan massal hanya mencakup produk saat ini; tambahkan produk baru terpisah. Maksimum')} {limit}.</p>}
    </div>
  </section>
}
