import { useState } from 'react'
import { X } from 'lucide-react'

interface TextInputModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (value: string) => void
  title: string
  value: string
  placeholder?: string
  inputMode?: 'text' | 'email' | 'tel'
  required?: boolean
}

export function TextInputModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  value,
  placeholder = '',
  inputMode = 'text',
  required = false
}: TextInputModalProps) {
  const [input, setInput] = useState(value)
  const [showKeyboard, setShowKeyboard] = useState(inputMode === 'tel' ? false : true)

  // 字母键盘布局
  const letterRows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ]

  if (!isOpen) return null

  const handleConfirm = () => {
    if (required && !input.trim()) return
    onConfirm(input)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Display */}
        <div className="p-4">
          <div className="bg-gray-100 rounded-xl p-4 mb-3 text-center min-h-[60px] flex items-center justify-center">
            <span className="text-2xl font-bold text-gray-700 break-all">{input || placeholder || '-'}</span>
          </div>

          {/* ABC/123切换 */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setShowKeyboard(true)}
              className={`px-4 h-10 rounded-lg text-sm font-medium ${showKeyboard ? 'bg-pink-500 text-white' : 'bg-gray-100'}`}
            >
              ABC
            </button>
            <button
              onClick={() => setShowKeyboard(false)}
              className={`px-4 h-10 rounded-lg text-sm font-medium ${!showKeyboard ? 'bg-pink-500 text-white' : 'bg-gray-100'}`}
            >
              123
            </button>
            {inputMode === 'email' && (
              <button
                onClick={() => setInput(prev => prev + '@')}
                className="px-4 h-10 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                @
              </button>
            )}
          </div>

          {showKeyboard ? (
            /* 字母键盘 */
            <div className="select-none">
              {letterRows.map((row, rowIdx) => (
                <div key={rowIdx} className="flex justify-center gap-1 mb-1">
                  {row.map(letter => (
                    <button
                      key={letter}
                      onClick={() => setInput(prev => prev + letter)}
                      className="w-[9%] h-12 bg-white border rounded-lg text-lg font-medium hover:bg-pink-50 active:bg-pink-100"
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              ))}
              {/* 控制按钮行 */}
              <div className="flex justify-center gap-1 mt-2">
                <button
                  onClick={() => setInput('')}
                  className="w-20 h-10 bg-red-50 rounded-lg text-sm font-medium text-red-500 hover:bg-red-100"
                >
                  Clear
                </button>
                <button
                  onClick={() => setInput(prev => prev.slice(0, -1))}
                  className="w-20 h-10 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  ⌫
                </button>
                <button
                  onClick={() => setInput(prev => prev + ' ')}
                  className="w-32 h-10 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  space
                </button>
              </div>
            </div>
          ) : (
            /* 数字键盘 */
            <div className="select-none">
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button
                    key={n}
                    onClick={() => setInput(prev => prev + String(n))}
                    className="h-12 bg-white border rounded-xl text-xl font-bold hover:bg-pink-50 active:bg-pink-100"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setInput('')}
                  className="w-20 h-12 bg-red-50 rounded-xl text-sm font-medium text-red-500 hover:bg-red-100"
                >
                  C
                </button>
                <button
                  onClick={() => setInput(prev => prev + '0')}
                  className="w-32 h-12 bg-white border rounded-xl text-xl font-bold hover:bg-pink-50"
                >
                  0
                </button>
                <button
                  onClick={() => setInput(prev => prev.slice(0, -1))}
                  className="w-20 h-12 bg-gray-100 rounded-xl text-sm font-medium hover:bg-gray-200"
                >
                  ⌫
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t bg-gray-50">
          <button onClick={onClose} className="flex-1 py-3 border rounded-xl font-medium">
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 bg-pink-500 text-white rounded-xl font-bold disabled:bg-gray-300"
            disabled={required && !input.trim()}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}