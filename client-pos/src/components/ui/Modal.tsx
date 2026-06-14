import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  position?: 'center' | 'bottom';
  showClose?: boolean;
  closeOnOverlayClick?: boolean;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  position = 'center',
  showClose = true,
  closeOnOverlayClick = true,
  className = '',
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    full: 'max-w-full mx-4',
  };

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 bg-black/50 z-50 flex ${position === 'center' ? 'items-center justify-center' : 'items-end justify-center'} p-4`}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={`
          bg-white w-full ${sizeClasses[size]}
          ${position === 'center' ? 'rounded-xl' : 'rounded-t-2xl'}
          shadow-xl max-h-[90vh] overflow-hidden flex flex-col
          animate-slide-up
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            {title && (
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            )}
            {showClose && (
              <button
                onClick={onClose}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

// Bottom Sheet variant for mobile
export function BottomSheet({
  isOpen,
  onClose,
  children,
  className = '',
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      position="bottom"
      size="full"
      showClose={false}
      className={`rounded-t-3xl ${className}`}
    >
      {children}
    </Modal>
  );
}

export default Modal;