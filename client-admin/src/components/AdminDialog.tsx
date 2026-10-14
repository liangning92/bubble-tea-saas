import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
export function AdminDialog({
  title,
  children,
  onClose,
  className = "max-w-4xl",
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose),
    pending = useRef(busy);
  close.current = onClose;
  pending.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length > 0 && !el.matches(":disabled"));
    (focusable()[0] || ref.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if (!ref.current?.contains(document.activeElement)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (!pending.current) close.current();
      }
      if (e.key === "Tab") {
        const els = focusable(),
          first = els[0],
          last = els[els.length - 1];
        if (!first) {
          e.preventDefault();
          ref.current?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-2 sm:p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full max-h-[94dvh] overflow-y-auto overscroll-contain rounded-xl bg-white shadow-xl ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
