import React from 'react';
import { 
  ShieldCheck, 
  Package, 
  ShoppingCart, 
  Truck, 
  BookOpen, 
  LayoutDashboard, 
  ClipboardCheck, 
  AlertTriangle, 
  Droplet, 
  ArrowRight, 
  Sparkles,
  Store,
  KeyRound,
  FileSpreadsheet
} from 'lucide-react';
import { 
  InventoryItem, 
  SaleRecord, 
  Outlet, 
  DispatchLoad, 
  PaymentRecord, 
  StockInwardRecord, 
  AppUserProfile, 
  AppPageId 
} from '@/src/types';
import { getCurrentUser } from '@/src/api';
import { cn } from '@/src/lib/utils';
import { format } from 'date-fns';

interface PersonalizedWelcomeProps {
  inventory: InventoryItem[];
  sales: SaleRecord[];
  outlets: Outlet[];
  loads: DispatchLoad[];
  payments: PaymentRecord[];
  stockInwards: StockInwardRecord[];
  onQuickAction?: (actionId: string) => void;
}

export function PersonalizedWelcome({
  inventory,
  sales,
  outlets,
  loads,
  payments,
  stockInwards,
  onQuickAction
}: PersonalizedWelcomeProps) {
  const currentUser: AppUserProfile = getCurrentUser() || {
    id: 'user_admin',
    name: 'Muhammad Tariq',
    role: 'ADMIN',
    roleTitle: 'Manager / Administrator',
    department: 'KFM Beverages (WARSA)',
    description: 'Complete unrestricted access',
    responsibilities: ['Full system management & daily operations'],
    avatarColor: 'bg-red-600',
    iconName: 'ShieldCheck',
    allowedPages: ['dashboard', 'dispatch', 'reconciliation', 'inventory', 'sales', 'reports', 'outlets', 'ledger', 'orderBookers', 'settings'],
    defaultPage: 'dashboard'
  };

  const navigateTo = (page: AppPageId) => {
    window.dispatchEvent(new CustomEvent('navigate_page', { detail: page }));
  };

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  const todaySales = sales.filter(s => s.Date.slice(0, 10) === todayStr);
  const activeSalesList = todaySales.length > 0 ? todaySales : sales;

  // Key figures
  const totalFloorCases = inventory.reduce((sum, item) => sum + item.Quantity, 0);
  const totalInTransitCases = inventory.reduce((sum, item) => sum + (item.InTransitQuantity || 0), 0);
  const lowStockItems = inventory.filter(item => item.Quantity <= (item.MinThreshold || 50));
  
  const pendingLoads = loads.filter(l => l.Status === 'DRAFT' || l.Status === 'LOADED');
  const dispatchedLoads = loads.filter(l => l.Status === 'DISPATCHED' || l.Status === 'RETURNING');
  
  const totalDeliveredCases = activeSalesList.reduce((sum, s) => sum + (s.DeliveredCases ?? (s.DeliveryStatus === 'REJECTED' ? 0 : s.TotalCases) ?? 0), 0);
  const totalBookedCases = activeSalesList.reduce((sum, s) => sum + (s.TotalCases || 0), 0);
  
  const totalSalesDelivered = activeSalesList.reduce((sum, s) => sum + (s.ActualGrandTotal ?? s.GrandTotal ?? 0), 0);
  const totalOutstandingBalance = outlets.reduce((sum, o) => sum + (o.OpeningBalance || 0), 0) + 
    sales.reduce((sum, s) => sum + (s.ActualGrandTotal ?? s.GrandTotal ?? 0), 0) - 
    payments.reduce((sum, p) => sum + (p.Amount || 0), 0);

  // Simple greeting
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';

  const metrics = [
    { 
      label: 'Warehouse Floor Stock', 
      value: `${totalFloorCases.toLocaleString()} Cases`, 
      sub: `${lowStockItems.length} items low in godown`, 
      color: 'text-red-700'
    },
    { 
      label: 'Stock in Delivery Trucks', 
      value: `${totalInTransitCases} Cases`, 
      sub: `${dispatchedLoads.length} active delivery vehicles`, 
      color: 'text-red-700'
    },
    { 
      label: "Today's Delivered Sales", 
      value: `Rs. ${totalSalesDelivered.toLocaleString()}`, 
      sub: `${totalDeliveredCases} cases delivered to shops`, 
      color: 'text-red-700'
    },
    { 
      label: 'Customer Balance to Collect', 
      value: `Rs. ${totalOutstandingBalance.toLocaleString()}`, 
      sub: `Across ${outlets.length} registered shops`, 
      color: 'text-red-700'
    },
  ];

  const actions = [
    {
      id: 'daily-reconciliation',
      title: 'Daily Closing & Math Check',
      desc: 'Check godown floor stock, delivery trucks, returns, and cash collected at end of day',
      badge: 'Daily Closing',
      badgeColor: 'bg-red-50 text-red-700 border-red-200',
      btnLabel: 'Run Closing Check',
      btnPage: 'reconciliation' as AppPageId,
      icon: ClipboardCheck,
      urgent: true
    },
    {
      id: 'manage-dispatches',
      title: 'Truck Loading & Route Drops',
      desc: 'Load cases onto delivery vehicles, check route drops, and record shop deliveries',
      badge: `${dispatchedLoads.length} On Route`,
      badgeColor: 'bg-red-50 text-red-700 border-red-200',
      btnLabel: 'Open Deliveries',
      btnPage: 'dispatch' as AppPageId,
      icon: Truck,
      urgent: pendingLoads.length > 0
    },
    {
      id: 'receive-stock',
      title: 'Warehouse Stock & Add Inward',
      desc: 'Add new water bottles received from bottling plant into warehouse floor stock',
      badge: 'Godown Stock',
      badgeColor: 'bg-red-50 text-red-700 border-red-200',
      btnLabel: 'Open Warehouse',
      btnPage: 'inventory' as AppPageId,
      icon: Package,
      urgent: lowStockItems.length > 0
    },
    {
      id: 'customer-ledgers',
      title: 'Customer Ledgers & Cash Received',
      desc: 'Check shop credit balances, record customer payments, and view khata ledgers',
      badge: 'Ledger Khata',
      badgeColor: 'bg-red-50 text-red-700 border-red-200',
      btnLabel: 'Open Ledgers',
      btnPage: 'ledger' as AppPageId,
      icon: BookOpen,
      urgent: false
    }
  ];

  return (
    <div className="space-y-4">
      {/* Top Welcome Hero Card - Clean White & Red Theme */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/90 text-slate-900 p-4 md:p-6 shadow-2xs">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* User Profile Info */}
          <div className="flex items-start md:items-center gap-3.5">
            <div className={cn("p-3 md:p-3.5 rounded-xl text-white shadow-sm shrink-0 flex items-center justify-center ring-2 ring-slate-100", currentUser.avatarColor)}>
              <ShieldCheck className="h-6 w-6" />
            </div>

            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs md:text-sm font-medium text-slate-500">
                  {greeting},
                </span>
                <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider">
                  {currentUser.roleTitle || 'Administrator'}
                </span>
              </div>

              <h2 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {currentUser.name}
              </h2>

              <p className="text-xs text-slate-500 font-normal">
                {currentUser.roleTitle} &bull; <span className="text-slate-400">{currentUser.department}</span>
              </p>
            </div>
          </div>

          {/* Quick Date Badge */}
          <div className="flex items-center gap-2.5 bg-red-50/50 border border-red-100 px-3 py-2 rounded-xl self-start lg:self-center">
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-slate-900 leading-tight">
                {format(new Date(), 'EEEE, dd MMMM yyyy')}
              </div>
              <div className="text-slate-500 text-[10px]">
                Active Session &bull; Plant Operations
              </div>
            </div>
          </div>
        </div>

        {/* Key Operational Metrics 4-Col Grid */}
        <div className="relative z-10 mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          {metrics.map((metric, idx) => (
            <div 
              key={idx} 
              className="bg-slate-50/60 hover:bg-slate-100/60 transition-colors p-3 rounded-xl border border-slate-200/80"
            >
              <span className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-slate-500 block mb-0.5 truncate">
                {metric.label}
              </span>
              <span className={cn("text-base md:text-lg font-bold block tracking-tight tabular-nums font-mono", metric.color)}>
                {metric.value}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                {metric.sub}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Operations Shortcuts */}
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/90 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-50 text-red-600">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-slate-900 leading-tight">
                Daily Operations Quick Actions
              </h3>
              <p className="text-xs text-slate-500">
                Quick routes to warehouse inventory, route deliveries, closing check, and accounts
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
            {actions.length} Quick Workflows
          </span>
        </div>

        {/* Action Items List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <div
                key={action.id}
                id={`action-item-${action.id}`}
                className={cn(
                  "p-3.5 rounded-xl border transition-all duration-150 flex flex-col justify-between group",
                  action.urgent 
                    ? "bg-red-50/30 border-red-200/80 hover:border-red-300 hover:shadow-xs" 
                    : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs"
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="p-2 rounded-lg text-white shadow-2xs bg-red-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-md uppercase tracking-wider border", action.badgeColor)}>
                      {action.badge}
                    </span>
                  </div>

                  <h4 className="text-xs md:text-sm font-bold text-slate-900 group-hover:text-red-600 transition-colors">
                    {action.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
                    {action.desc}
                  </p>
                </div>

                <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                    {action.urgent ? 'Priority' : 'Standard'}
                  </span>
                  <button
                    id={`btn-open-${action.id}`}
                    onClick={() => navigateTo(action.btnPage)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 transition-colors group-hover:translate-x-0.5"
                  >
                    <span>{action.btnLabel}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
