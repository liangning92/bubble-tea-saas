import React, { useState } from 'react'

interface KanbanColumn {
  id: string
  title: string
  color: string
  items: KanbanItem[]
}

interface KanbanItem {
  id: string
  title: string
  subtitle?: string
  description?: string
  badge?: string
  badgeColor?: string
  metadata?: Record<string, string | number>
}

interface KanbanBoardProps {
  columns: KanbanColumn[]
  onItemMove?: (itemId: string, fromColumn: string, toColumn: string) => void
  onItemClick?: (item: KanbanItem) => void
  renderItem?: (item: KanbanItem) => React.ReactNode
}

export function KanbanBoard({ columns: initialColumns, onItemMove, onItemClick, renderItem }: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns)
  const [draggedItem, setDraggedItem] = useState<{ item: KanbanItem; sourceColumn: string } | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, item: KanbanItem, columnId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    setDraggedItem({ item, sourceColumn: columnId })
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(columnId)
  }

  const handleDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.sourceColumn === targetColumnId) {
      setDraggedItem(null)
      setDragOverColumn(null)
      return
    }

    // Move item from source to target
    setColumns(prev => {
      const newColumns = prev.map(col => {
        if (col.id === draggedItem.sourceColumn) {
          return { ...col, items: col.items.filter(i => i.id !== draggedItem.item.id) }
        }
        if (col.id === targetColumnId) {
          return { ...col, items: [...col.items, draggedItem!.item] }
        }
        return col
      })
      return newColumns
    })

    onItemMove?.(draggedItem.item.id, draggedItem.sourceColumn, targetColumnId)
    setDraggedItem(null)
    setDragOverColumn(null)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverColumn(null)
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(column => (
        <div key={column.id} className="flex-shrink-0 w-80">
          {/* Column Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${column.color}`} />
              <h3 className="font-semibold text-gray-900">{column.title}</h3>
            </div>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
              {column.items.length}
            </span>
          </div>

          {/* Droppable Area */}
          <div
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id)}
            className={`min-h-[200px] rounded-xl p-2 space-y-2 transition-colors ${
              dragOverColumn === column.id ? 'bg-primary/5 ring-2 ring-primary ring-dashed' : 'bg-gray-50'
            }`}
          >
            {column.items.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item, column.id)}
                onDragEnd={handleDragEnd}
                onClick={() => onItemClick?.(item)}
                className={`bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:border-gray-200 ${
                  draggedItem?.item.id === item.id ? 'opacity-50' : ''
                }`}
              >
                {renderItem ? (
                  renderItem(item)
                ) : (
                  <DefaultItem item={item} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DefaultItem({ item }: { item: KanbanItem }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="font-medium text-gray-900 text-sm">{item.title}</p>
          {item.subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
          )}
          {item.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>
          )}
        </div>
        {item.badge && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.badgeColor || 'bg-gray-100 text-gray-600'}`}>
            {item.badge}
          </span>
        )}
      </div>
      {item.metadata && Object.keys(item.metadata).length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-1">
          {Object.entries(item.metadata).map(([key, value]) => (
            <div key={key} className="text-xs">
              <span className="text-gray-400">{key}: </span>
              <span className="text-gray-600 font-medium">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export type { KanbanColumn, KanbanItem }