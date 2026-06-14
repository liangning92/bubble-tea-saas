import { Delete, Check } from 'lucide-react';

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  maxLength?: number;
  allowDecimal?: boolean;
  confirmText?: string;
  cancelText?: string;
  showConfirm?: boolean;
  showCancel?: boolean;
  className?: string;
}

export function NumericKeypad({
  value,
  onChange,
  onConfirm,
  onCancel,
  maxLength = 12,
  allowDecimal = true,
  confirmText,
  cancelText,
  showConfirm = true,
  showCancel = false,
  className = '',
}: NumericKeypadProps) {
  const keys = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    allowDecimal ? '.' : '', '0', 'backspace',
  ];

  const handleKeyPress = (key: string) => {
    if (key === 'backspace') {
      onChange(value.slice(0, -1));
      return;
    }

    if (key === '.') {
      if (!allowDecimal || value.includes('.')) return;
      onChange(value + '.');
      return;
    }

    // Limit length
    if (value.length >= maxLength) return;

    // Handle decimal precision (max 2 decimal places)
    if (value.includes('.')) {
      const [, decimal] = value.split('.');
      if (decimal && decimal.length >= 2) return;
    }

    onChange(value + key);
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Display */}
      <div className="bg-gray-100 rounded-lg p-3 text-right font-mono text-2xl min-h-[56px] flex items-center justify-end">
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || '0'}
        </span>
      </div>

      {/* Keypad Grid */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((key, index) => {
          if (!key) {
            return <div key={index} />;
          }

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleKeyPress(key)}
              className={`
                h-14 rounded-lg font-medium text-lg
                bg-white border border-border
                hover:bg-gray-50 active:scale-95
                transition-all flex items-center justify-center
                ${key === 'backspace' ? 'text-gray-600' : 'text-gray-900'}
              `}
            >
              {key === 'backspace' ? (
                <Delete size={24} />
              ) : (
                key
              )}
            </button>
          );
        })}
      </div>

      {/* Action Buttons */}
      {(showConfirm || showCancel) && (
        <div className="flex gap-2 mt-2">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-12 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-[0.98] transition-all"
            >
              {cancelText || 'Cancel'}
            </button>
          )}
          {showConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={!value}
              className={`
                flex-1 h-12 rounded-lg font-medium
                flex items-center justify-center gap-2
                active:scale-[0.98] transition-all
                ${value
                  ? 'bg-primary text-white hover:bg-primary-hover'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
              `}
            >
              <Check size={20} />
              {confirmText || 'Confirm'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default NumericKeypad;