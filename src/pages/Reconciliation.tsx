import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { 
  fetchInventory, 
  fetchSales, 
  fetchDispatchLoads, 
  fetchOutlets,
  canModifyData 
} from '@/src/api';
import { 
  InventoryItem, 
  SaleRecord, 
  DispatchLoad, 
  Outlet 
} from '@/src/types';
import { 
  ClipboardCheck, 
  Calendar, 
  Printer, 
  MessageCircle, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Package, 
  Truck, 
  Layers, 
  Store, 
  DollarSign, 
  ArrowRight,
  RotateCcw,
  Sparkles,
  Search,
  Filter,
  ShieldAlert
} from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { cn } from '@/src/lib/utils';

export function Reconciliation() {
  const canEdit = canModifyData();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loads, setLoads] = useState<DispatchLoad[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedRoute, setSelectedRoute] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'summary' | 'outlet_intake' | 'returns_log' | 'floor_stock'>('summary');
  
  const reportRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [showIframeWarning, setShowIframeWarning] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invData, salesData, loadsData, outletsData] = await Promise.all([
        fetchInventory(),
        fetchSales(),
        fetchDispatchLoads(),
        fetchOutlets()
      ]);
      setInventory(invData);
      setSales(salesData);
      setLoads(loadsData);
      setOutlets(outletsData);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const handleDataRefreshed = () => {
      loadData();
    };
    window.addEventListener('warsa_data_refreshed', handleDataRefreshed);
    return () => window.removeEventListener('warsa_data_refreshed', handleDataRefreshed);
  }, []);

  // Filter sales & loads for selected date and route
  const dateSales = sales.filter(s => {
    const isDateMatch = isSameDay(parseISO(s.Date), parseISO(selectedDate));
    const isRouteMatch = selectedRoute === 'ALL' || (s.Route && s.Route.toLowerCase().includes(selectedRoute.toLowerCase()));
    return isDateMatch && isRouteMatch;
  });

  const dateLoads = loads.filter(l => {
    const isDateMatch = l.Date === selectedDate;
    const isRouteMatch = selectedRoute === 'ALL' || (l.Route && l.Route.toLowerCase().includes(selectedRoute.toLowerCase()));
    return isDateMatch && isRouteMatch;
  });

  // Extract unique routes
  const availableRoutes = Array.from(new Set(sales.map(s => s.Route).filter(Boolean)));

  // Identify all active products sold or loaded
  const activeProducts = inventory;

  // 1. Opening stock available on the floor
  const openingStockPerProduct: Record<string, number> = {};
  let totalOpeningStock = 0;
  inventory.forEach(item => {
    const opening = item.OpeningStock ?? item.Quantity;
    openingStockPerProduct[item.ID] = opening;
    totalOpeningStock += opening;
  });

  // 2. Stock dispatched according to the load
  const dispatchedPerProduct: Record<string, number> = {};
  let totalDispatchedCases = 0;
  dateLoads.forEach(load => {
    load.Items.forEach(i => {
      dispatchedPerProduct[i.ProductID] = (dispatchedPerProduct[i.ProductID] || 0) + i.DispatchedQty;
      totalDispatchedCases += i.DispatchedQty;
    });
  });

  // Fallback: If no formal load created yet, use the booked sales as dispatched load
  if (totalDispatchedCases === 0 && dateSales.length > 0) {
    dateSales.forEach(s => {
      s.Items.forEach(i => {
        dispatchedPerProduct[i.ProductID] = (dispatchedPerProduct[i.ProductID] || 0) + i.Quantity;
        totalDispatchedCases += i.Quantity;
      });
    });
  }

  // 3 & 4. Stock received by each outlet & Outlet wise stock intake
  let totalReceivedCases = 0;
  let totalRejectedCases = 0;
  let totalPlannedRevenue = 0;
  let totalActualRevenue = 0;
  let totalRejectedRevenue = 0;

  const receivedPerProduct: Record<string, number> = {};
  const rejectedPerProduct: Record<string, number> = {};

  const outletIntakeRows = dateSales.map(sale => {
    const isRejected = sale.DeliveryStatus === 'REJECTED';
    let outletReceived = 0;
    let outletRejected = 0;
    let outletDeliveredAmount = 0;
    const productIntake: Record<string, { booked: number; received: number; rejected: number; reason?: string }> = {};

    sale.Items.forEach(item => {
      const dQty = item.DeliveredQty !== undefined ? item.DeliveredQty : (isRejected ? 0 : item.Quantity);
      const rQty = item.RejectedQty !== undefined ? item.RejectedQty : (isRejected ? item.Quantity : 0);

      outletReceived += dQty;
      outletRejected += rQty;
      outletDeliveredAmount += (dQty * item.Price);

      receivedPerProduct[item.ProductID] = (receivedPerProduct[item.ProductID] || 0) + dQty;
      rejectedPerProduct[item.ProductID] = (rejectedPerProduct[item.ProductID] || 0) + rQty;

      productIntake[item.ProductID] = {
        booked: item.Quantity,
        received: dQty,
        rejected: rQty,
        reason: item.RejectionReason || sale.RejectionReason
      };
    });

    const plannedTotal = sale.GrandTotal || 0;
    const actualGrandTotal = sale.ActualGrandTotal !== undefined ? sale.ActualGrandTotal : Math.max(0, outletDeliveredAmount - (sale.Discount || 0));
    const rejectedValue = Math.max(0, plannedTotal - actualGrandTotal);

    totalReceivedCases += outletReceived;
    totalRejectedCases += outletRejected;
    totalPlannedRevenue += plannedTotal;
    totalActualRevenue += actualGrandTotal;
    totalRejectedRevenue += rejectedValue;

    const matchedOutlet = outlets.find(o => o.Name === sale.OutletName || o.Address === sale.Address);

    return {
      saleId: sale.ID,
      outletName: sale.OutletName,
      outletCode: matchedOutlet?.Code || '-',
      route: sale.Route || matchedOutlet?.Route || '-',
      ownerName: sale.OwnerName || matchedOutlet?.OwnerName || '-',
      deliveryStatus: sale.DeliveryStatus || 'DELIVERED',
      rejectionReason: sale.RejectionReason || (isRejected ? 'Shop Closed' : undefined),
      rejectionNotes: sale.RejectionNotes,
      bookedCases: sale.TotalCases,
      receivedCases: outletReceived,
      rejectedCases: outletRejected,
      plannedTotal,
      actualGrandTotal,
      rejectedValue,
      productIntake
    };
  });

  // 5. Stock not accepted or returned list
  const returnedOutletItems: {
    saleId: string;
    outletName: string;
    route: string;
    productName: string;
    rejectedQty: number;
    reason: string;
    value: number;
  }[] = [];

  dateSales.forEach(sale => {
    const isRejected = sale.DeliveryStatus === 'REJECTED';
    sale.Items.forEach(item => {
      const rQty = item.RejectedQty !== undefined ? item.RejectedQty : (isRejected ? item.Quantity : 0);
      if (rQty > 0) {
        returnedOutletItems.push({
          saleId: sale.ID,
          outletName: sale.OutletName,
          route: sale.Route,
          productName: item.ProductName,
          rejectedQty: rQty,
          reason: (item.RejectionReason || sale.RejectionReason || 'Shop Closed').toString(),
          value: rQty * item.Price
        });
      }
    });
  });

  // 6. Remaining stock on the floor after distribution
  const liveFloorPerProduct: Record<string, number> = {};
  let totalLiveFloorStock = 0;
  inventory.forEach(item => {
    liveFloorPerProduct[item.ID] = item.Quantity;
    totalLiveFloorStock += item.Quantity;
  });

  // Print & Share
  const handlePrint = () => {
    if (window.self !== window.top) {
      setShowIframeWarning(true);
    }
    setTimeout(() => {
      try { window.print(); } catch(e) {}
    }, 150);
  };

  const handleShareWA = async () => {
    if (!reportRef.current) return;
    setIsSharing(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], `Reconciliation_Report_${selectedDate}.pdf`, { type: 'application/pdf' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Reconciliation ${selectedDate}`, text: `Daily Stock & Sales Reconciliation for ${selectedDate}` });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.open(`https://wa.me/?text=Please%20find%20the%20Reconciliation%20Report%20for%20${selectedDate}%20attached.`, '_blank');
      }
    } catch (e) {
      console.error(e);
      alert("Failed to generate PDF");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <>
      <style type="text/css" media="print">
        {`
          @page { size: landscape; margin: 0.5cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
          .print\\:hidden { display: none !important; }
        `}
      </style>

      {showIframeWarning && (
        <div className="bg-amber-100 text-amber-800 p-4 mb-4 max-w-7xl mx-auto flex justify-between items-center print:hidden text-sm rounded-md shadow-sm mt-4">
          <p><strong>Note:</strong> If the print dialog didn't open, please click <strong>"Open in New Tab"</strong> at the top right to print.</p>
          <Button variant="ghost" size="sm" onClick={() => setShowIframeWarning(false)}>Dismiss</Button>
        </div>
      )}

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 print:p-0 print:m-0 print:w-full print:max-w-none">
        {/* Top Header & Action Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <ClipboardCheck className="h-7 w-7 text-red-600" /> Daily Closing & Math Check
              </h1>
              {!canEdit && (
                <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-bold px-2.5 py-1 text-xs flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> ASM Inspection
                </Badge>
              )}
            </div>
            <p className="text-sm md:text-base text-gray-500 mt-1">
              Check morning stock, truck loads, shop deliveries, returned bottles, and final warehouse stock.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200">
              <Calendar className="h-4 w-4 text-gray-500 ml-2" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-8 border-0 text-xs font-semibold focus-visible:ring-0 w-36"
              />
            </div>

            <select
              className="h-10 text-xs font-semibold rounded-lg border border-gray-300 bg-white px-3 py-1 focus:outline-none focus:ring-2 focus:ring-red-500"
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
            >
              <option value="ALL">All Routes</option>
              {availableRoutes.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <Button onClick={handleShareWA} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5" disabled={isSharing}>
              <MessageCircle className="h-4 w-4" /> {isSharing ? 'Generating...' : 'Share PDF'}
            </Button>
            <Button onClick={handlePrint} className="bg-red-600 hover:bg-red-700 text-white text-xs gap-1.5">
              <Printer className="h-4 w-4" /> Print Sheet
            </Button>
          </div>
        </div>

        {/* ASM Read-Only Banner */}
        {!canEdit && (
          <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-xl flex items-center justify-between gap-3 text-amber-950 text-xs shadow-sm print:hidden">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Area Sales Manager (ASM) Read-Only Inspection:</strong> You have full visibility into all closing numbers, truck distribution audits, shop deliveries, bottle returns, and warehouse stock reconciliation.
              </span>
            </div>
            <Badge className="bg-amber-200 text-amber-950 font-bold hover:bg-amber-200 border-none shrink-0">
              Read-Only
            </Badge>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 print:hidden overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab('summary')}
            className={cn(
              "px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'summary'
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-900"
            )}
          >
            1. Daily Closing Summary
          </button>
          <button
            onClick={() => setActiveTab('outlet_intake')}
            className={cn(
              "px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'outlet_intake'
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-900"
            )}
          >
            2. Shop-by-Shop Delivery Details ({outletIntakeRows.length})
          </button>
          <button
            onClick={() => setActiveTab('returns_log')}
            className={cn(
              "px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5",
              activeTab === 'returns_log'
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-900"
            )}
          >
            3. Returned Bottles List
            {totalRejectedCases > 0 && (
              <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {totalRejectedCases} cs
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('floor_stock')}
            className={cn(
              "px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'floor_stock'
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-900"
            )}
          >
            4. Warehouse Stock Count
          </button>
        </div>

        {/* Printable & Screen Report Container */}
        <div ref={reportRef} className="space-y-6 bg-white p-4 sm:p-6 rounded-xl border border-gray-200 print:border-0 print:p-0">
          
          {/* Printable Header Banner */}
          <div className="border-b-2 border-black pb-3 text-center">
            <h2 className="text-xl font-black uppercase tracking-wider text-black">
              KFM Beverages (WARSA) - DAILY STOCK & SALES CLOSING
            </h2>
            <div className="flex justify-center gap-6 text-xs text-gray-700 font-semibold mt-1">
              <span>Date: <strong>{format(parseISO(selectedDate), 'dd MMMM yyyy (EEEE)')}</strong></span>
              <span>Route: <strong>{selectedRoute}</strong></span>
              <span>Total Shops: <strong>{outletIntakeRows.length}</strong></span>
            </div>
          </div>

          {/* 8-POINT EXECUTIVE DASHBOARD METRICS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-xs">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="text-[10px] text-gray-500 font-bold uppercase truncate">1. Morning Stock</div>
              <div className="text-base font-black text-gray-900">{totalOpeningStock}</div>
              <div className="text-[9px] text-gray-400">cases</div>
            </div>

            <div className="bg-amber-50/80 p-2.5 rounded-lg border border-amber-200">
              <div className="text-[10px] text-amber-800 font-bold uppercase truncate">2. Loaded in Trucks</div>
              <div className="text-base font-black text-amber-800">{totalDispatchedCases}</div>
              <div className="text-[9px] text-amber-600">cases loaded</div>
            </div>

            <div className="bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-200">
              <div className="text-[10px] text-emerald-800 font-bold uppercase truncate">3. Delivered to Shops</div>
              <div className="text-base font-black text-emerald-700">{totalReceivedCases}</div>
              <div className="text-[9px] text-emerald-600">cases accepted</div>
            </div>

            <div className="bg-blue-50/80 p-2.5 rounded-lg border border-blue-200">
              <div className="text-[10px] text-blue-800 font-bold uppercase truncate">4. Shops Visited</div>
              <div className="text-base font-black text-blue-800">{outletIntakeRows.length}</div>
              <div className="text-[9px] text-blue-600">shops drop</div>
            </div>

            <div className="bg-red-50/80 p-2.5 rounded-lg border border-red-200">
              <div className="text-[10px] text-red-800 font-bold uppercase truncate">5. Returned Bottles</div>
              <div className="text-base font-black text-red-700">{totalRejectedCases}</div>
              <div className="text-[9px] text-red-600">cases returned</div>
            </div>

            <div className="bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-300">
              <div className="text-[10px] text-emerald-900 font-bold uppercase truncate">6. Warehouse Stock</div>
              <div className="text-base font-black text-emerald-800">{totalLiveFloorStock}</div>
              <div className="text-[9px] text-emerald-700">remaining now</div>
            </div>

            <div className="bg-purple-50/80 p-2.5 rounded-lg border border-purple-200">
              <div className="text-[10px] text-purple-800 font-bold uppercase truncate">7. Total Sales Amount</div>
              <div className="text-sm font-black text-purple-900">PKR {totalActualRevenue.toLocaleString()}</div>
              <div className="text-[9px] text-purple-600">delivered revenue</div>
            </div>

            <div className="bg-slate-100 p-2.5 rounded-lg border border-slate-300">
              <div className="text-[10px] text-gray-700 font-bold uppercase truncate">8. Returned Value</div>
              <div className="text-sm font-black text-red-600">PKR {totalRejectedRevenue.toLocaleString()}</div>
              <div className="text-[9px] text-gray-500">not delivered value</div>
            </div>
          </div>

          {/* MASTER 8-POINT RECONCILIATION TABLE (Point 1, 2, 3, 5, 6 per SKU) */}
          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase text-gray-800 tracking-wider flex items-center gap-1.5">
              <Package className="h-4 w-4 text-red-600" /> Complete Product Reconciliation (Floor Stock vs Dispatched vs Intake vs Live Floor)
            </h3>
            <div className="border border-black rounded overflow-x-auto shadow-2xs">
              <table className="w-full min-w-[650px] text-xs text-left border-collapse">
                <thead className="bg-red-600 text-white uppercase text-[11px] font-bold">
                  <tr>
                    <th className="py-2 px-3 border-r border-red-500">Product SKU</th>
                    <th className="py-2 px-2 text-center border-r border-red-500 bg-red-700">1. Opening Floor</th>
                    <th className="py-2 px-2 text-center border-r border-red-500 bg-red-800">2. Dispatched Load</th>
                    <th className="py-2 px-2 text-center border-r border-red-500 bg-red-700">3. Outlet Received</th>
                    <th className="py-2 px-2 text-center border-r border-red-500 bg-red-900">5. Returned / Refused</th>
                    <th className="py-2 px-2 text-center border-r border-red-500 bg-red-700">6. Live Floor Balance</th>
                    <th className="py-2 px-3 text-right bg-red-800">Actual Sold Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {inventory.map(item => {
                    const opening = openingStockPerProduct[item.ID] || 0;
                    const dispatched = dispatchedPerProduct[item.ID] || 0;
                    const received = receivedPerProduct[item.ID] || 0;
                    const returned = rejectedPerProduct[item.ID] || 0;
                    const liveFloor = item.Quantity;
                    const soldVal = received * item.Price;

                    return (
                      <tr key={item.ID} className="hover:bg-gray-50">
                        <td className="py-2 px-3 font-bold text-gray-900 border-r border-gray-200">
                          {item.Name}
                          <span className="block text-[10px] font-normal text-gray-500">{item.SKU} (@ PKR {item.Price})</span>
                        </td>
                        <td className="py-2 px-2 text-center font-semibold text-gray-700 border-r border-gray-200 bg-slate-50/50">
                          {opening} cs
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-amber-800 border-r border-gray-200 bg-amber-50/30">
                          {dispatched} cs
                        </td>
                        <td className="py-2 px-2 text-center font-black text-emerald-700 border-r border-gray-200 bg-emerald-50/30">
                          {received} cs
                        </td>
                        <td className="py-2 px-2 text-center font-black text-red-600 border-r border-gray-200 bg-red-50/30">
                          {returned > 0 ? `${returned} cs` : '-'}
                        </td>
                        <td className="py-2 px-2 text-center font-black text-teal-800 border-r border-gray-200 bg-teal-50/40">
                          {liveFloor} cs
                        </td>
                        <td className="py-2 px-3 text-right font-black text-gray-900">
                          PKR {soldVal.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total summary footer */}
                  <tr className="bg-gray-200 font-black text-gray-900 border-t-2 border-black">
                    <td className="py-2.5 px-3 uppercase tracking-wider border-r border-gray-300">TOTAL SUMMARY</td>
                    <td className="py-2.5 px-2 text-center border-r border-gray-300">{totalOpeningStock} cs</td>
                    <td className="py-2.5 px-2 text-center border-r border-gray-300 text-amber-900">{totalDispatchedCases} cs</td>
                    <td className="py-2.5 px-2 text-center border-r border-gray-300 text-emerald-900">{totalReceivedCases} cs</td>
                    <td className="py-2.5 px-2 text-center border-r border-gray-300 text-red-700">{totalRejectedCases} cs</td>
                    <td className="py-2.5 px-2 text-center border-r border-gray-300 text-teal-900">{totalLiveFloorStock} cs</td>
                    <td className="py-2.5 px-3 text-right text-black">PKR {totalActualRevenue.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. OUTLET WISE STOCK INTAKE MATRIX */}
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-black uppercase text-gray-800 tracking-wider flex items-center gap-1.5">
              <Store className="h-4 w-4 text-red-600" /> 4. Outlet Wise Stock Intake & Delivery Status Matrix
            </h3>
            <div className="border border-black rounded overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-[#e5e7eb] text-gray-900 uppercase font-bold text-[10px] border-b border-black">
                  <tr>
                    <th className="py-2 px-2 border-r border-gray-300 w-12 text-center">Code</th>
                    <th className="py-2 px-3 border-r border-gray-300">Customer / Outlet</th>
                    <th className="py-2 px-2 border-r border-gray-300">Route</th>
                    {inventory.map(inv => (
                      <th key={inv.ID} className="py-2 px-2 text-center border-r border-gray-300">
                        {inv.Name}
                      </th>
                    ))}
                    <th className="py-2 px-2 text-center border-r border-gray-300 bg-emerald-100">Received</th>
                    <th className="py-2 px-2 text-center border-r border-gray-300 bg-red-100">Rejected</th>
                    <th className="py-2 px-2 border-r border-gray-300">Delivery Status & Reason</th>
                    <th className="py-2 px-3 text-right">Actual Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {outletIntakeRows.length === 0 ? (
                    <tr>
                      <td colSpan={6 + inventory.length} className="py-6 text-center text-gray-400 text-xs">
                        No outlet sales records found for this date and route filter.
                      </td>
                    </tr>
                  ) : (
                    outletIntakeRows.map((row, idx) => (
                      <tr key={idx} className={row.rejectedCases > 0 ? "bg-amber-50/20" : "hover:bg-gray-50"}>
                        <td className="py-2 px-2 text-center font-bold text-gray-600 border-r border-gray-200">{row.outletCode}</td>
                        <td className="py-2 px-3 font-semibold text-gray-900 border-r border-gray-200">
                          {row.outletName}
                        </td>
                        <td className="py-2 px-2 text-gray-500 border-r border-gray-200 text-[11px]">{row.route}</td>
                        
                        {/* Product Intake Counts */}
                        {inventory.map(inv => {
                          const intake = row.productIntake[inv.ID];
                          if (!intake) return <td key={inv.ID} className="py-2 px-2 text-center border-r border-gray-200 text-gray-300">-</td>;
                          return (
                            <td key={inv.ID} className="py-2 px-2 text-center border-r border-gray-200 font-bold">
                              <span className="text-emerald-700">{intake.received}</span>
                              {intake.rejected > 0 && (
                                <span className="block text-[9px] text-red-600 font-bold">
                                  ({intake.rejected} ret)
                                </span>
                              )}
                            </td>
                          );
                        })}

                        <td className="py-2 px-2 text-center font-black text-emerald-800 bg-emerald-50/50 border-r border-gray-200">
                          {row.receivedCases} cs
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-red-700 bg-red-50/50 border-r border-gray-200">
                          {row.rejectedCases > 0 ? `${row.rejectedCases} cs` : '-'}
                        </td>
                        <td className="py-2 px-2 border-r border-gray-200 text-[11px]">
                          {row.deliveryStatus === 'DELIVERED' && (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Fully Accepted
                            </span>
                          )}
                          {row.deliveryStatus === 'PARTIAL' && (
                            <div className="text-amber-800 font-semibold flex flex-col">
                              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Partial</span>
                              {row.rejectionReason && <span className="text-[10px] text-gray-500">{row.rejectionReason}</span>}
                            </div>
                          )}
                          {row.deliveryStatus === 'REJECTED' && (
                            <div className="text-red-700 font-bold flex flex-col">
                              <span className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Not Accepted</span>
                              <span className="text-[10px] text-red-600 font-medium">{row.rejectionReason || 'Shop Closed'}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-black text-gray-900">
                          PKR {row.actualGrandTotal.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Matrix Total Row */}
                  {outletIntakeRows.length > 0 && (
                    <tr className="bg-gray-200 font-black text-gray-900 border-t-2 border-black">
                      <td colSpan={3} className="py-2.5 px-3 uppercase text-center border-r border-gray-300">
                        TOTAL OUTLET INTAKE
                      </td>
                      {inventory.map(inv => (
                        <td key={inv.ID} className="py-2.5 px-2 text-center border-r border-gray-300">
                          {receivedPerProduct[inv.ID] || 0}
                        </td>
                      ))}
                      <td className="py-2.5 px-2 text-center border-r border-gray-300 text-emerald-900 bg-emerald-200">
                        {totalReceivedCases} cs
                      </td>
                      <td className="py-2.5 px-2 text-center border-r border-gray-300 text-red-900 bg-red-200">
                        {totalRejectedCases} cs
                      </td>
                      <td className="py-2.5 px-2 border-r border-gray-300 text-xs">
                        {outletIntakeRows.filter(r => r.deliveryStatus === 'DELIVERED').length} Accepted, {outletIntakeRows.filter(r => r.deliveryStatus === 'REJECTED').length} Rejected
                      </td>
                      <td className="py-2.5 px-3 text-right text-black">
                        PKR {totalActualRevenue.toLocaleString()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. STOCK NOT ACCEPTED OR RETURNED BY OUTLETS TABLE */}
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-black uppercase text-red-700 tracking-wider flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4 text-red-600" /> 5. Detail of Stock Not Accepted or Returned by Outlets
            </h3>
            {returnedOutletItems.length === 0 ? (
              <div className="p-4 bg-emerald-50 rounded border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                No stock rejections or returns recorded for this date. 100% of dispatched stock was successfully accepted!
              </div>
            ) : (
              <div className="border border-red-300 rounded overflow-x-auto shadow-2xs">
                <table className="w-full min-w-[650px] text-xs text-left border-collapse">
                  <thead className="bg-red-700 text-white uppercase font-bold text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Inv #</th>
                      <th className="py-2 px-3">Outlet / Shop Name</th>
                      <th className="py-2 px-3">Route</th>
                      <th className="py-2 px-3">Product Name</th>
                      <th className="py-2 px-3 text-center">Returned Qty</th>
                      <th className="py-2 px-3">Specific Rejection Reason</th>
                      <th className="py-2 px-3 text-right">Returned Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100 bg-white">
                    {returnedOutletItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-red-50/50">
                        <td className="py-2 px-3 font-bold text-red-600">#{item.saleId}</td>
                        <td className="py-2 px-3 font-bold text-gray-900">{item.outletName}</td>
                        <td className="py-2 px-3 text-gray-600">{item.route}</td>
                        <td className="py-2 px-3 font-medium text-gray-800">{item.productName}</td>
                        <td className="py-2 px-3 text-center font-black text-red-600 bg-red-50">
                          {item.rejectedQty} Cases
                        </td>
                        <td className="py-2 px-3 font-bold text-gray-800">
                          <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-[11px]">
                            {item.reason}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-black text-gray-900">
                          PKR {item.value.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-red-100 font-black text-red-900 border-t border-red-300">
                      <td colSpan={4} className="py-2 px-3 uppercase tracking-wider">TOTAL UNACCEPTED STOCK</td>
                      <td className="py-2 px-3 text-center">{totalRejectedCases} Cases</td>
                      <td></td>
                      <td className="py-2 px-3 text-right">PKR {totalRejectedRevenue.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 7 & 8. FINANCIAL & RECONCILIATION SUMMARY BOXES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            {/* Left Box: Daily Sales vs Planned Variance */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
              <h4 className="font-bold text-xs uppercase text-gray-700 tracking-wider">
                7. Daily Sales Reconciliation
              </h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Planned / Expected Sales Volume:</span>
                  <span className="font-semibold">{totalDispatchedCases} Cases (PKR {totalPlannedRevenue.toLocaleString()})</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-bold">
                  <span>Actual Delivered Sales (Net):</span>
                  <span>{totalReceivedCases} Cases (PKR {totalActualRevenue.toLocaleString()})</span>
                </div>
                <div className="flex justify-between text-red-700 font-bold border-t border-gray-200 pt-1">
                  <span>Unaccepted / Returned Revenue:</span>
                  <span>- PKR {totalRejectedRevenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-[11px] pt-1">
                  <span>Delivery Success Ratio:</span>
                  <span className="font-bold text-gray-800">
                    {totalDispatchedCases > 0 ? ((totalReceivedCases / totalDispatchedCases) * 100).toFixed(1) : 100}%
                  </span>
                </div>
              </div>
            </div>

            {/* Right Box: Physical Floor Reconciliation Sign-off */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
              <h4 className="font-bold text-xs uppercase text-gray-700 tracking-wider">
                8. Warehouse Floor & Driver Sign-off
              </h4>
              <div className="grid grid-cols-2 gap-3 pt-2 text-[11px]">
                <div className="border-t border-black pt-2 text-center">
                  <span className="font-bold text-gray-800 block">Warehouse Supervisor</span>
                  <span className="text-gray-500 text-[10px]">Verified Remaining Floor: {totalLiveFloorStock} cs</span>
                </div>
                <div className="border-t border-black pt-2 text-center">
                  <span className="font-bold text-gray-800 block">Driver / Order Booker</span>
                  <span className="text-gray-500 text-[10px]">Restocked Returns: {totalRejectedCases} cs</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
