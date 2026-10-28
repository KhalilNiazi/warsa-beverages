import React from 'react';
import { Button } from './button';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  iconClassName?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  iconClassName
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 md:p-12 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50", className)}>
      <div className={cn("w-12 h-12 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-center text-slate-500 mb-3.5", iconClassName)}>
        <Icon className="h-6 w-6 stroke-[1.75]" />
      </div>
      <h4 className="text-sm font-bold text-slate-900 mb-1">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm" className="gap-1.5 shadow-xs">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
