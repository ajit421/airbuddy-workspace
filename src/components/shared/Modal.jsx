import { useEffect } from 'react';

/**
 * Modal.jsx — shared modal/bottom-sheet component.
 *
 * Phase 18 — Responsive:
 *  On mobile (< sm / < 640px): renders as a native-feel bottom sheet that
 *  slides up from the screen bottom. Full width, rounded only at top corners.
 *  On sm+ screens: classic centred dialog (unchanged from Phase 11).
 *
 * Props:
 *  - isOpen    {boolean}  Controls visibility
 *  - onClose   {function} Called on backdrop click or close button
 *  - title     {string}   Modal header title
 *  - children  {node}     Modal body content
 *  - size      {string}   'sm' | 'md' | 'lg' | 'xl'  (desktop max-width only)
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Desktop max-width classes (applied at sm+ only via wrapper)
  const sizeClass = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-2xl',
    lg: 'sm:max-w-4xl',
    xl: 'sm:max-w-6xl',
  }[size] || 'sm:max-w-2xl';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal / Bottom Sheet panel */}
      <div
        className={`
          relative w-full ${sizeClass}
          bg-surface border border-border shadow-card animate-fade-in
          max-h-[92vh] sm:max-h-[90vh] flex flex-col
          rounded-t-2xl sm:rounded-2xl
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle pill */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border/80" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 rounded-lg"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
