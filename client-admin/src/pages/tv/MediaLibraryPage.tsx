import React, { useState, useEffect, useRef } from 'react'
import { tvApi } from '../../services/api'
import { 
  Upload, Image as ImageIcon, Video, Music, Shield, Trash2, 
  Search, Eye, RefreshCw, Plus, Tag, Film, CheckCircle2, AlertCircle
} from 'lucide-react'

interface MediaItem {
  id: string
  name: string
  url: string
  type: 'image' | 'video' | 'audio' | 'logo'
  category: 'product' | 'poster' | 'video' | 'audio' | 'logo' | 'general'
  size: number
  mimeType: string
  tags: string[]
  duration?: number
  createdAt: string
  updatedAt: string
}

export const MediaLibraryPage: React.FC = () => {
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadCategory, setUploadCategory] = useState<'poster' | 'product' | 'video' | 'audio' | 'logo' | 'general'>('poster')

  const fetchMedia = async () => {
    setLoading(true)
    try {
      const res = await tvApi.getMedia({
        type: activeTab === 'all' ? undefined : activeTab,
        search: searchQuery || undefined
      })
      if (res.data?.success) {
        setMediaList(res.data.data)
      }
    } catch (err: any) {
      console.error('Failed to load media:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMedia()
  }, [activeTab])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchMedia()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setUploadProgress(`正在上传 ${files.length} 个文件...`)

    const formData = new FormData()
    Array.from(files).forEach(file => {
      formData.append('files', file)
    })
    formData.append('category', uploadCategory)
    formData.append('tags', JSON.stringify([uploadCategory]))

    try {
      const res = await tvApi.uploadMedia(formData)
      if (res.data?.success) {
        setUploadProgress('上传成功！')
        setTimeout(() => setUploadProgress(''), 2000)
        fetchMedia()
      } else {
        alert(res.data?.message || '上传失败')
      }
    } catch (err: any) {
      alert(err.response?.data?.message || '上传异常，请检查文件大小或网络')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定要从媒体库中删除 "${name}" 吗？此操作无法撤销。`)) return

    try {
      const res = await tvApi.deleteMedia(id)
      if (res.data?.success) {
        setMediaList(prev => prev.filter(m => m.id !== id))
      }
    } catch (err) {
      alert('删除失败')
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题与操作栏 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
              <Film size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">公共媒体库</h1>
              <p className="text-sm text-gray-500 mt-1">
                集中管理门店的宣传海报、产品图片、轮播视频、背景音乐及品牌Logo，供所有大屏随时调取。
              </p>
            </div>
          </div>
        </div>

        {/* 上传区域 */}
        <div className="flex items-center gap-3">
          <select 
            value={uploadCategory} 
            onChange={(e) => setUploadCategory(e.target.value as any)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-700 outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="poster">🖼️ 宣传海报</option>
            <option value="product">🥤 产品图片</option>
            <option value="video">🎬 宣传视频</option>
            <option value="logo">✨ 品牌Logo</option>
            <option value="audio">🎵 背景音乐</option>
            <option value="general">📁 常规素材</option>
          </select>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            multiple 
            accept="image/*,video/mp4,video/webm,audio/mp3,audio/wav,audio/m4a" 
            className="hidden" 
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium shadow-sm transition-all disabled:opacity-50"
          >
            <Upload size={18} />
            <span>{uploading ? uploadProgress || '上传中...' : '上传新素材'}</span>
          </button>
        </div>
      </div>

      {/* 筛选与搜索 */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        {/* Tab 选项 */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
          {[
            { key: 'all', label: '全部素材', icon: Film },
            { key: 'image', label: '图片与海报', icon: ImageIcon },
            { key: 'video', label: '视频素材', icon: Video },
            { key: 'logo', label: '品牌Logo', icon: Shield },
            { key: 'audio', label: '背景音乐', icon: Music },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key 
                  ? 'bg-red-50 text-red-600' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full sm:w-72">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索素材名称或标签..."
              className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <button 
            type="submit"
            className="p-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-gray-600"
            title="刷新与搜索"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </form>
      </div>

      {/* 素材网格列表 */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400">
          <RefreshCw size={28} className="animate-spin mb-2" />
          <span className="ml-3 text-sm">正在加载媒体库...</span>
        </div>
      ) : mediaList.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <Film size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">暂无媒体素材</p>
          <p className="text-sm text-gray-400 mt-1">点击右上角「上传新素材」添加海报、饮品图或宣传视频</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {mediaList.map(item => (
            <div 
              key={item.id} 
              className="group bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
            >
              {/* 预览区域 */}
              <div 
                className="relative aspect-video bg-gray-900 flex items-center justify-center overflow-hidden cursor-pointer"
                onClick={() => setPreviewMedia(item)}
              >
                {item.type === 'video' ? (
                  <div className="w-full h-full relative">
                    <video src={item.url} className="w-full h-full object-cover" muted />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-all">
                      <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center text-red-600 shadow">
                        <Video size={20} />
                      </div>
                    </div>
                  </div>
                ) : item.type === 'audio' ? (
                  <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center text-white p-4">
                    <Music size={32} className="mb-1" />
                    <span className="text-xs opacity-80">音频文件</span>
                  </div>
                ) : (
                  <img 
                    src={item.url} 
                    alt={item.name} 
                    className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform" 
                  />
                )}

                {/* 悬浮操作图标 */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setPreviewMedia(item) }}
                    className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm"
                    title="全屏预览"
                  >
                    <Eye size={14} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.name) }}
                    className="p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg backdrop-blur-sm"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* 类型徽标 */}
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[11px] font-medium bg-black/60 text-white backdrop-blur-sm">
                  {item.type === 'video' ? '视频' : item.type === 'audio' ? '音频' : item.category === 'logo' ? 'Logo' : '图片'}
                </span>
              </div>

              {/* 信息区域 */}
              <div className="p-3 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 text-sm truncate" title={item.name}>
                    {item.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span>{formatSize(item.size)}</span>
                    <span>•</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* 标签 */}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.tags.slice(0, 2).map((t, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 全屏媒体预览弹窗 */}
      {previewMedia && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setPreviewMedia(null)}
        >
          <div 
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 truncate max-w-md">{previewMedia.name}</h3>
              <button 
                onClick={() => setPreviewMedia(null)} 
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 bg-black flex items-center justify-center min-h-[360px] p-4">
              {previewMedia.type === 'video' ? (
                <video src={previewMedia.url} controls autoPlay className="max-w-full max-h-[60vh]" />
              ) : previewMedia.type === 'audio' ? (
                <div className="text-center p-8 text-white">
                  <Music size={64} className="mx-auto mb-4 text-purple-400 animate-bounce" />
                  <audio src={previewMedia.url} controls autoPlay className="w-80 mx-auto" />
                </div>
              ) : (
                <img src={previewMedia.url} alt={previewMedia.name} className="max-w-full max-h-[60vh] object-contain" />
              )}
            </div>

            <div className="p-4 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
              <div>
                <span>类型: {previewMedia.mimeType}</span>
                <span className="mx-2">|</span>
                <span>大小: {formatSize(previewMedia.size)}</span>
              </div>
              <a 
                href={previewMedia.url} 
                target="_blank" 
                rel="noreferrer"
                className="text-red-600 hover:underline font-medium"
              >
                新标签页打开原始文件
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default MediaLibraryPage
