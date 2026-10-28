import React, { useState } from 'react';
import { ResponsiveDialog } from './responsive-dialog';
import { Button } from './button';
import { AlertTriangle, Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen?: boolean;
  open?: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function ConfirmDialog({ 
  isOpen, 
  open, 
  title, 
  description, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  onConfirm, 
  onCancel,
  onOpenChange 
}: ConfirmDialogProps) {
  const isVisible = isOpen !== undefined ? isOpen : Boolean(open);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    if (isSubmitting || isLoading) return;
    if (onCancel) onCancel();
    if (onOpenChange) onOpenChange(false);
  };

  const handleConfirmClick = async () => {
    if (isSubmitting || isLoading) return;
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isLoading || isSubmitting;

  return (
    <ResponsiveDialog isOpen={isVisible} onClose={handleClose} title={title}>
      <div className="flex flex-col items-center text-center space-y-4 py-4">
        <div className="bg-red-50 p-3 rounded-full border border-red-200">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <p className="text-sm text-slate-600 max-w-sm">{description}</p>
        
        <div className="flex justify-end gap-3 w-full pt-4 mt-4 border-t border-slate-100">
          <Button 
            variant="outline" 
            className="flex-1 border-slate-300 text-slate-700" 
            onClick={handleClose}
            disabled={isBusy}
          >
            {cancelText}
          </Button>
          <Button 
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold gap-2" 
            onClick={handleConfirmClick}
            disabled={isBusy}
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isBusy ? 'Processing...' : confirmText}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
