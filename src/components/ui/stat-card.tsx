import React from 'react';
import { Card, CardContent } from './card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  unit?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'emerald' | 'amber' | 'blue' | 'rose' | 'slate';
  className?: string;
  trend?: {
    value: string;
    positive?: boolean;
  };
}

export function StatCard({
  label,
  value,
  subtext,
  unit,
  icon: Icon,
  variant = 'default',
  className,
  trend
}: StatCardProps) {
  const variantStyles = {
    default: {
      card: 'border-red-100 bg-white hover:border-red-300',
      iconBox: 'bg-red-50 text-red-600 border border-red-100',
      value: 'text-slate-900',
      label: 'text-slate-500'
    },
    emerald: {
      card: 'border-red-100 bg-white hover:border-red-300',
      iconBox: 'bg-red-50 text-red-600 border border-red-100',
      value: 'text-slate-900',
      label: 'text-red-700'
    },
    amber: {
      card: 'border-red-100 bg-red-50/30 hover:border-red-300',
      iconBox: 'bg-red-100 text-red-700 border border-red-200',
      value: 'text-slate-900',
      label: 'text-red-700'
    },
    blue: {
      card: 'border-red-100 bg-white hover:border-red-300',
      iconBox: 'bg-red-50 text-red-600 border border-red-100',
      value: 'text-slate-900',
      label: 'text-slate-600'
    },
    rose: {
      card: 'border-red-200/80 bg-red-50/40 hover:border-red-300',
      iconBox: 'bg-red-100 text-red-700 border border-red-200',
      value: 'text-red-900',
      label: 'text-red-700'
    },
    slate: {
      card: 'border-red-100 bg-white text-slate-900 hover:border-red-300',
      iconBox: 'bg-red-50 text-red-600 border border-red-100',
      value: 'text-slate-900',
      label: 'text-slate-600'
    }
  }[variant];

  return (
    <Card className={cn("transition-all duration-150 shadow-2xs hover:shadow-xs", variantStyles.card, className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <span className={cn("text-[11px] font-semibold tracking-tight uppercase block truncate", variantStyles.label)}>
              {label}
            </span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className={cn("text-xl md:text-2xl font-bold tracking-tight tabular-nums", variantStyles.value)}>
                {typeof value === 'number' ? value.toLocaleString() : value}
              </span>
              {unit && (
                <span className={cn("text-xs font-medium", variant === 'slate' ? "text-slate-400" : "text-slate-500")}>
                  {unit}
                </span>
              )}
            </div>
            {subtext && (
              <p className={cn("text-[11px] leading-tight truncate", variant === 'slate' ? "text-slate-400" : "text-slate-500")}>
                {subtext}
              </p>
            )}
            {trend && (
              <span className={cn("inline-block text-[10px] font-semibold mt-0.5", trend.positive ? "text-emerald-600" : "text-rose-600")}>
                {trend.value}
              </span>
            )}
          </div>
          {Icon && (
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", variantStyles.iconBox)}>
              <Icon className="h-4 w-4 stroke-[2]" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
