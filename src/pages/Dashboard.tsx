import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { StatCard } from '@/src/components/ui/stat-card';
import { 
  fetchInventory, 
  fetchSales, 
  fetchOutlets, 
  fetchDispatchLoads, 
  fetchPayments, 
  fetchStockInwardRecords
} from '@/src/api';
import { InventoryItem, SaleRecord, Outlet, DispatchLoad, PaymentRecord, StockInwardRecord } from '@/src/types';
import { 
  Package, 
  Truck, 
  Store, 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Layers, 
  ShieldCheck, 
  UserCheck, 
  PlusCircle,
  Coins,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';
import { format } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { PersonalizedWelcome } from '../components/PersonalizedWelcome';

export function Dashboard() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loads, setLoads] = useState<DispatchLoad[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [stockInwards, setStockInwards] = useState<StockInwardRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData();
    const handleDataRefreshed = () => {
      loadAllData();
    };
    window.addEventListener('warsa_data_refreshed', handleDataRefreshed);
    return () => window.removeEventListener('warsa_data_refreshed', handleDataRefreshed);
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [invData, salesData, outletsData, loadsData, paymentsData, inwardsData] = await Promise.all([
        fetchInventory(),
        fetchSales(),
        fetchOutlets(),
        fetchDispatchLoads(),
        fetchPayments(),
        fetchStockInwardRecords()
      ]);
      setInventory(invData);
      setSales(salesData);
      setOutlets(outletsData);
      setLoads(loadsData);
      setPayments(paymentsData);
      setStockInwards(inwardsData);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
    setLoading(false);
  };

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  const todaySales = sales.filter(s => s.Date.slice(0, 10) === todayStr);
  const todayInwards = stockInwards.filter(i => i.Date.slice(0, 10) === todayStr);

  // --- 18 LIVE DASHBOARD FIGURES ---
  // 1. Opening Floor Stock
  const openingFloorStock = inventory.reduce((acc, item) => acc + (item.OpeningStock ?? item.Quantity), 0);

  // 2. Stock Added Today (Inward)
  const stockAddedToday = todayInwards.reduce((acc, item) => acc + item.Quantity, 0);

  // 3. Total Booked Quantity
  const totalBookedQuantity = todaySales.length > 0 
    ? todaySales.reduce((acc, s) => acc + (s.TotalCases || 0), 0)
    : sales.reduce((acc, s) => acc + (s.TotalCases || 0), 0);

  // 4. Total Loaded Quantity
  const totalLoadedQuantity = todaySales.length > 0
    ? todaySales.reduce((acc, s) => acc + (s.LoadedCases ?? s.TotalCases ?? 0), 0)
    : sales.reduce((acc, s) => acc + (s.LoadedCases ?? s.TotalCases ?? 0), 0);

  // 5. Total Dispatched Quantity
  const totalDispatchedQuantity = totalLoadedQuantity;

  // 6. Total Delivered Quantity
  const totalDeliveredQuantity = todaySales.length > 0
    ? todaySales.reduce((acc, s) => acc + (s.DeliveredCases ?? (s.DeliveryStatus === 'REJECTED' ? 0 : s.TotalCases) ?? 0), 0)
    : sales.reduce((acc, s) => acc + (s.DeliveredCases ?? (s.DeliveryStatus === 'REJECTED' ? 0 : s.TotalCases) ?? 0), 0);

  // 7. Total Returned Quantity
  const totalReturnedQuantity = todaySales.length > 0
    ? todaySales.reduce((acc, s) => acc + (s.RejectedCases ?? (s.DeliveryStatus === 'REJECTED' ? s.TotalCases : 0) ?? 0), 0)
    : sales.reduce((acc, s) => acc + (s.RejectedCases ?? (s.DeliveryStatus === 'REJECTED' ? s.TotalCases : 0) ?? 0), 0);

  // 8. Total Rejected Quantity
  const totalRejectedQuantity = totalReturnedQuantity;

  // 9. Actual Sales (Cases)
  const actualSalesCases = totalDeliveredQuantity;

  // 10. Remaining Floor Stock
  const remainingFloorStock = inventory.reduce((acc, item) => acc + item.Quantity, 0);

  // 11. Stock Currently in Vehicles (In-Transit)
  const stockInVehicles = inventory.reduce((acc, item) => acc + (item.InTransitQuantity || 0), 0);

  // 12. Total Sales Amount (Realized Actual Sales)
  const totalSalesAmount = todaySales.length > 0
    ? todaySales.reduce((acc, s) => acc + (s.ActualGrandTotal ?? (s.DeliveryStatus === 'REJECTED' ? 0 : s.GrandTotal) ?? 0), 0)
    : sales.reduce((acc, s) => acc + (s.ActualGrandTotal ?? (s.DeliveryStatus === 'REJECTED' ? 0 : s.GrandTotal) ?? 0), 0);

  // 13. Total Cash Collected
  const totalCashCollected = (todaySales.length > 0 ? todaySales : sales)
    .reduce((acc, s) => acc + (s.CashCollected || 0), 0) + 
    payments.reduce((acc, p) => acc + (p.Amount || 0), 0);

  // 14. Total Credit Sales
  const totalCreditSales = (todaySales.length > 0 ? todaySales : sales)
    .reduce((acc, s) => acc + (s.CreditAmount || 0), 0);

  // 15. Outstanding Customer Balance
  const totalOpeningBalances = outlets.reduce((acc, o) => acc + (o.OpeningBalance || 0), 0);
  const allActualSalesRevenue = sales.reduce((acc, s) => acc + (s.ActualGrandTotal ?? (s.DeliveryStatus === 'REJECTED' ? 0 : s.GrandTotal) ?? 0), 0);
  const allPayments = payments.reduce((acc, p) => acc + (p.Amount || 0), 0);
  const outstandingCustomerBalance = totalOpeningBalances + allActualSalesRevenue - allPayments;

  // 16. Number of Active Outlets
  const activeOutlets = outlets.filter(o => o.Status === 'Active' || !o.Status).length;

  // 17. Number of Outlets Served Today
  const outletsServedToday = (todaySales.length > 0 ? todaySales : sales)
    .filter(s => (s.DeliveredCases ?? 0) > 0).length;

  // 18. Number of Closed / Unserved Outlets
  const closedOrUnservedOutlets = (todaySales.length > 0 ? todaySales : sales)
    .filter(s => s.DeliveryStatus === 'REJECTED' || (s.DeliveredCases === 0 && s.RejectedCases && s.RejectedCases > 0)).length;

  // Chart data
  const comparisonData = inventory.map(item => ({
    name: item.SKU,
    FloorStock: item.Quantity,
    InTransit: item.InTransitQuantity || 0,
    MinLevel: item.MinThreshold
  }));

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600"></div>
          <span className="text-sm font-medium text-gray-500">Loading KFM Beverages Live Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      {/* Personalized Welcome, Role Metrics & Action Items */}
      <PersonalizedWelcome
        inventory={inventory}
        sales={sales}
        outlets={outlets}
        loads={loads}
        payments={payments}
        stockInwards={stockInwards}
      />

      {/* CORE BUSINESS FLOW BANNER: Booked -> Loaded -> Dispatched -> Delivered -> Returned -> Actual Sale */}
      <div className="bg-white text-slate-900 p-4 md:p-5 rounded-2xl border border-red-100 shadow-xs">
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[11px] font-black uppercase tracking-widest text-red-600 flex items-center gap-1.5">
            <Layers className="h-4 w-4" /> Daily Stock &amp; Sales Flow Pipeline
          </div>
          <span className="text-[11px] text-slate-500 font-mono font-medium">Real-Time Reconciliation</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="bg-white p-3 rounded-xl border border-red-100 shadow-2xs">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block font-bold">1. Booked Orders</span>
            <div className="text-xl md:text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">{totalBookedQuantity}</div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Booked Cases</span>
          </div>

          <div className="bg-red-50/40 p-3 rounded-xl border border-red-100 shadow-2xs">
            <span className="text-[10px] uppercase tracking-wider text-red-700 block font-bold">2. Truck Loaded</span>
            <div className="text-xl md:text-2xl font-bold text-red-900 mt-1 font-mono tabular-nums">{totalLoadedQuantity}</div>
            <span className="text-[10px] text-red-700 block mt-0.5">Loaded Cases</span>
          </div>

          <div className="bg-red-50/60 p-3 rounded-xl border border-red-200/70 shadow-2xs">
            <span className="text-[10px] uppercase tracking-wider text-red-800 block font-bold">3. Dispatched</span>
            <div className="text-xl md:text-2xl font-bold text-red-950 mt-1 font-mono tabular-nums">{totalDispatchedQuantity}</div>
            <span className="text-[10px] text-red-700 block mt-0.5">On Route</span>
          </div>

          <div className="bg-red-50/80 p-3 rounded-xl border border-red-200 shadow-2xs">
            <span className="text-[10px] uppercase tracking-wider text-red-900 block font-bold">4. Delivered</span>
            <div className="text-xl md:text-2xl font-bold text-red-950 mt-1 font-mono tabular-nums">{totalDeliveredQuantity}</div>
            <span className="text-[10px] text-red-800 block mt-0.5">Accepted by Shops</span>
          </div>

          <div className="bg-rose-50/60 p-3 rounded-xl border border-rose-200 shadow-2xs">
            <span className="text-[10px] uppercase tracking-wider text-rose-800 block font-bold">5. Returned</span>
            <div className="text-xl md:text-2xl font-bold text-rose-900 mt-1 font-mono tabular-nums">{totalReturnedQuantity}</div>
            <span className="text-[10px] text-rose-700 block mt-0.5">Rejected / Closed</span>
          </div>

          <div className="bg-red-600 p-3 rounded-xl border border-red-700 text-white shadow-xs">
            <span className="text-[10px] uppercase tracking-wider text-red-100 block font-black">6. Sold Stock</span>
            <div className="text-xl md:text-2xl font-black text-white mt-1 font-mono tabular-nums">{actualSalesCases}</div>
            <span className="text-[10px] text-red-100 block mt-0.5 font-bold">Net Realized Cases</span>
          </div>
        </div>
      </div>

      {/* 18 KPIS ORGANIZED IN 4 DISTINCT OPERATIONAL DOMAINS */}
      <div className="space-y-6">
        
        {/* DOMAIN 1: WAREHOUSE & PHYSICAL INVENTORY */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <Package className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              1. Warehouse Stock (Godown)
            </h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard
              label="1. Morning Stock (Opening)"
              value={openingFloorStock}
              unit="cases"
              subtext="Start of day godown floor"
              icon={Package}
              variant="default"
            />
            <StatCard
              label="2. Stock Added Today"
              value={`+${stockAddedToday.toLocaleString()}`}
              unit="cases"
              subtext="Plant / production inward"
              icon={PlusCircle}
              variant="emerald"
            />
            <StatCard
              label="10. Current Warehouse Stock"
              value={remainingFloorStock}
              unit="cases"
              subtext="Available on floor now"
              icon={Package}
              variant="rose"
            />
            <StatCard
              label="11. Stock in Delivery Trucks"
              value={stockInVehicles}
              unit="cases"
              subtext="Loaded on active routes"
              icon={Truck}
              variant="blue"
            />
          </div>
        </div>

        {/* DOMAIN 2: OPERATIONS & DISPATCH QUANTITIES */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <Truck className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Orders, Deliveries &amp; Returns
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
            <StatCard
              label="3. Booked Orders"
              value={totalBookedQuantity}
              unit="ctn"
              subtext="Salesmen booked demand"
              variant="default"
            />
            <StatCard
              label="4. Loaded in Trucks"
              value={totalLoadedQuantity}
              unit="ctn"
              subtext="Loaded on vehicles"
              variant="amber"
            />
            <StatCard
              label="5. Out for Delivery"
              value={totalDispatchedQuantity}
              unit="ctn"
              subtext="Dispatched onto routes"
              variant="blue"
            />
            <StatCard
              label="6. Delivered to Shops"
              value={totalDeliveredQuantity}
              unit="ctn"
              subtext="Accepted by shopkeepers"
              variant="emerald"
            />
            <StatCard
              label="7 & 8. Returned Cases"
              value={totalReturnedQuantity}
              unit="ctn"
              subtext="Not accepted / closed"
              variant="rose"
            />
            <StatCard
              label="9. Final Sold Stock"
              value={actualSalesCases}
              unit="ctn"
              subtext="Net delivered volume"
              variant="slate"
            />
          </div>
        </div>

        {/* DOMAIN 3: FINANCIALS & REVENUE */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <DollarSign className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              3. Cash, Sales &amp; Customer Khata
            </h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard
              label="12. Total Sales Realized"
              value={`PKR ${totalSalesAmount.toLocaleString()}`}
              subtext="Delivered invoice revenue"
              icon={DollarSign}
              variant="default"
            />
            <StatCard
              label="13. Cash Collected"
              value={`PKR ${totalCashCollected.toLocaleString()}`}
              subtext="Cash in hand & received"
              icon={Coins}
              variant="emerald"
            />
            <StatCard
              label="14. Credit Sales (Udhaar)"
              value={`PKR ${totalCreditSales.toLocaleString()}`}
              subtext="Added to customer khata"
              icon={TrendingUp}
              variant="amber"
            />
            <StatCard
              label="15. Total Customer Balance Due"
              value={`PKR ${outstandingCustomerBalance.toLocaleString()}`}
              subtext="Total due from registered shops"
              icon={AlertCircle}
              variant="rose"
            />
          </div>
        </div>

        {/* DOMAIN 4: OUTLETS & COVERAGE */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <Store className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              4. Shops &amp; Delivery Progress
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <StatCard
              label="16. Active Shops"
              value={activeOutlets}
              unit="shops"
              subtext="Total customer accounts registered"
              icon={Store}
              variant="default"
            />
            <StatCard
              label="17. Shops Delivered Today"
              value={outletsServedToday}
              unit="shops"
              subtext="Completed deliveries on route"
              icon={CheckCircle2}
              variant="emerald"
            />
            <StatCard
              label="18. Shops Closed / Not Delivered"
              value={closedOrUnservedOutlets}
              unit="shops"
              subtext="Shop closed or rejected delivery"
              icon={XCircle}
              variant="rose"
            />
          </div>
        </div>

      </div>

      {/* INVENTORY POSITION CHART & LIVE STOCK BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-gray-900">Live Stock Position vs In-Transit</CardTitle>
            <p className="text-xs text-gray-500">Comparing Physical Floor Stock with Stock on Vehicles</p>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', color: '#0f172a', borderRadius: '8px', border: '1px solid #fecaca', fontSize: '12px', boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.1)' }}
                  />
                  <Bar dataKey="FloorStock" fill="#DC2626" name="Floor Stock (Cases)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="InTransit" fill="#F87171" name="In-Transit on Vehicles" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Product Quick Status */}
        <Card className="bg-white border-red-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-gray-900">SKU Floor Summary</CardTitle>
            <p className="text-xs text-gray-500">Live physical stock on warehouse floor</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {inventory.map(item => (
              <div key={item.ID} className="flex items-center justify-between p-2.5 rounded-lg border border-red-100 bg-red-50/20">
                <div>
                  <span className="font-bold text-xs text-gray-900 block">{item.Name}</span>
                  <span className="text-[10px] text-gray-500">
                    {item.Size || 'Standard'} • Rate: PKR {item.Price}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-black text-sm text-gray-900 block">{item.Quantity} ctn</span>
                  {item.Quantity <= item.MinThreshold ? (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white shadow-2xs">
                      Low Stock
                    </span>
                  ) : (
                    <span className="text-[10px] text-red-700 font-semibold">In Stock</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
