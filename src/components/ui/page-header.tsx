import React from 'react';
import { cn } from '@/src/lib/utils';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  icon: Icon,
  actions,
  className
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 md:pb-6 border-b border-slate-200/80 mb-5 md:mb-6", className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-red-600/20 mt-0.5">
            <Icon className="h-5 w-5 stroke-[2]" />
          </div>
        )}
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-900 leading-snug">
              {title}
            </h1>
            {badge && (
              <span className="text-[11px] font-bold text-red-700 border border-red-200 bg-red-50 px-2 py-0.5 rounded-md select-none">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 font-normal leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 self-start sm:self-center shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
