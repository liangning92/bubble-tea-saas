import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

// Toast types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const colors = {
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
};

const iconsColor = {
  success: 'text-white',
  error: 'text-white',
  warning: 'text-white',
  info: 'text-white',
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const Icon = icons[toast.type];

  useEffect(() => {
    // Mount animation
    requestAnimationFrame(() => setIsVisible(true));

    const duration = toast.duration || 3000;
    const timer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white
        ${colors[toast.type]}
        transition-all duration-300 ease-out
        ${isVisible && !isLeaving ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}
      `}
    >
      <Icon size={20} className={iconsColor[toast.type]} />
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="p-1 hover:bg-white/20 rounded transition-colors"
      >
        <X size={16} className="text-white/80" />
      </button>
    </div>
  );
}

// Toast container
let toastListeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toasts]));
}

export const showToast = (message: string, type: ToastType = 'info', duration?: number) => {
  const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  toasts = [...toasts, { id, message, type, duration }];
  notifyListeners();
  return id;
};

export const dismissToast = (id: string) => {
  toasts = toasts.filter(t => t.id !== id);
  notifyListeners();
};

export const clearToasts = () => {
  toasts = [];
  notifyListeners();
};

// Convenience methods
export const toast = {
  success: (message: string, duration?: number) => showToast(message, 'success', duration),
  error: (message: string, duration?: number) => showToast(message, 'error', duration),
  warning: (message: string, duration?: number) => showToast(message, 'warning', duration),
  info: (message: string, duration?: number) => showToast(message, 'info', duration),
};

// React Hook
export function useToast() {
  const [toastList, setToastList] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => setToastList(newToasts);
    toastListeners.push(listener);
    setToastList([...toasts]);

    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    dismissToast(id);
  }, []);

  return { toasts: toastList, dismiss, showToast, toast };
}

// Toast Provider Component
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, dismiss } = useToast();

  return (
    <>
      {children}
      {/* Toast Container - Fixed position */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-md px-4">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}

export default ToastProvider;