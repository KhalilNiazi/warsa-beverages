import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface ResponsiveDialogProps {
  isOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

export function ResponsiveDialog({ 
  isOpen, 
  open,
  onClose, 
  onOpenChange,
  title, 
  subtitle, 
  children, 
  footer,
  size = 'md',
  className
}: ResponsiveDialogProps) {
  const visible = open !== undefined ? open : (isOpen !== undefined ? isOpen : false);
  const handleClose = () => {
    if (onClose) onClose();
    if (onOpenChange) onOpenChange(false);
  };

  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [visible]);

  if (!visible) return null;
  if (typeof document === 'undefined') return null;

  const sizeClasses = {
    sm: 'md:max-w-md',
    md: 'md:max-w-xl',
    lg: 'md:max-w-3xl',
    xl: 'md:max-w-5xl',
    full: 'md:max-w-[92vw]'
  }[size];

  return createPortal(
    <div 
      style={{ zIndex: 999999 }}
      className="fixed inset-0 flex flex-col md:flex-row items-end md:items-center justify-center p-0 md:p-4 responsive-dialog-portal"
    >
      {/* Backdrop with solid dimming and smooth blur */}
      <div 
        style={{ zIndex: 1 }}
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity duration-200" 
        onClick={handleClose}
      />
      
      {/* Dialog Container - 100% Solid White Opaque Surface */}
      <div 
        style={{ zIndex: 10 }}
        className={cn(
          "relative bg-white w-full rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden",
          "animate-in fade-in slide-in-from-bottom-10 md:zoom-in-95 duration-200",
          "max-h-[92dvh] flex flex-col border border-slate-200 ring-1 ring-slate-900/10",
          sizeClasses,
          className
        )}
      >
        {/* Mobile Pull Handle Indicator */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 bg-white">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header - Sticky with Red Accent Line */}
        <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-red-100 bg-gradient-to-r from-red-50/80 via-white to-white z-10 sticky top-0 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-base md:text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
              <span className="truncate">{title}</span>
            </h2>
            {subtitle && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          <button 
            onClick={handleClose}
            aria-label="Close dialog"
            className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content - Scrollable with safe bottom padding */}
        <div className="px-4 py-4 md:px-6 md:py-5 overflow-y-auto overscroll-contain flex-1 no-scrollbar space-y-4">
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="px-4 py-3 md:px-6 md:py-3.5 border-t border-gray-100 bg-gray-50/90 backdrop-blur z-10 sticky bottom-0 shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

