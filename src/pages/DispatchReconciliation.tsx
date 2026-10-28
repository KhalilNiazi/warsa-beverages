import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { 
  fetchInventory, 
  fetchSales, 
  fetchOutlets, 
  fetchDispatchLoads, 
  getDailyReconciliation, 
  restockLoadReturnsToFloor, 
  addFloorStockInward, 
  updateFloorStockQuantity,
  saveDispatchLoad
} from '@/src/api';
import { InventoryItem, SaleRecord, Outlet, DispatchLoad, ReconciliationSummary, DeliveryStatus } from '@/src/types';
import { DeliveryStatusModal } from '@/src/components/DeliveryStatusModal';
import { 
  Truck, 
  Package, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RotateCcw, 
  ArrowDownToLine, 
  FileSpreadsheet, 
  Printer, 
  MessageCircle, 
  Calendar,
  Layers,
  Store,
  DollarSign,
  Plus
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/src/lib/utils';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

export function DispatchReconciliation() {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loads, setLoads] = useState<DispatchLoad[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Delivery status modal target
  const [selectedSaleForDelivery, setSelectedSaleForDelivery] = useState<SaleRecord | null>(null);

  // Inward stock addition state
  const [isInwardModalOpen, setIsInwardModalOpen] = useState(false);
  const [inwardProductId, setInwardProductId] = useState('');
  const [inwardQty, setInwardQty] = useState<number>(100);

  // Create dispatch load state
  const [isNewLoadModalOpen, setIsNewLoadModalOpen] = useState(false);
  const [loadRoute, setLoadRoute] = useState('');
  const [loadDriver, setLoadDriver] = useState('');
  const [loadVehicle, setLoadVehicle] = useState('');

  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [invData, salesData, outletsData, loadsData, recData] = await Promise.all([
        fetchInventory(),
        fetchSales(),
        fetchOutlets(),
        fetchDispatchLoads(),
        getDailyReconciliation(selectedDate)
      ]);
      setInventory(invData);
      setSales(salesData);
      setOutlets(outletsData);
      setLoads(loadsData);
      setReconciliation(recData);
      if (invData.length > 0 && !inwardProductId) {
        setInwardProductId(invData[0].ID);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [selectedDate]);

  // Handle WhatsApp Share
  const handleWhatsAppShare = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], `Stock_Reconciliation_${selectedDate}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Stock Reconciliation ${selectedDate}`,
          text: `Daily Stock Reconciliation and Actual Sales Report for ${selectedDate}`
        });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.open(`https://wa.me/?text=Please%20find%20the%20Stock%20Reconciliation%20Report%20for%20${selectedDate}%20attached.`, '_blank');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate report PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAddInwardStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inwardProductId || inwardQty <= 0) return;
    await addFloorStockInward(inwardProductId, inwardQty);
    setIsInwardModalOpen(false);
    loadAllData();
  };

  const handleRestockReturnedCases = async (loadId: string) => {
    if (confirm('Restock all returned cases from this load back into the live floor stock?')) {
      await restockLoadReturnsToFloor(loadId);
      loadAllData();
    }
  };

  const totalLiveFloorStock = inventory.reduce((sum, i) => sum + i.Quantity, 0);
  const totalInTransitStock = inventory.reduce((sum, i) => sum + (i.InTransitQuantity || 0), 0);

  const dailySalesList = sales.filter(s => s.Date.slice(0, 10) === selectedDate);
  const rejectedShopsCount = dailySalesList.filter(s => s.DeliveryStatus === 'REJECTED').length;
  const partialShopsCount = dailySalesList.filter(s => s.DeliveryStatus === 'PARTIAL').length;
  const acceptedShopsCount = dailySalesList.filter(s => s.DeliveryStatus === 'DELIVERED' || !s.DeliveryStatus).length;

  return (
    <>
      <style type="text/css" media="print">
        {`
          @page { size: portrait; margin: 0.5cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
          .print\\:hidden { display: none !important; }
        `}
      </style>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 print:p-0 print:m-0 print:w-full print:max-w-none">
        
        {/* Header Controls (Hidden on Print) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                Stock Reconciliation & Dispatch
              </h1>
              <Badge className="bg-red-600 hover:bg-red-700 text-white font-medium">8-Point Audit</Badge>
            </div>
            <p className="text-sm md:text-base text-gray-500 mt-1">
              Floor stock balance, vehicle load dispatches, outlet intake, rejected/returned goods, and actual sales.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
              <Calendar className="h-4 w-4 text-slate-500" />
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="h-7 w-36 border-0 p-0 text-sm focus-visible:ring-0"
              />
            </div>

            <Button onClick={() => setIsInwardModalOpen(true)} variant="outline" className="gap-1.5 border-slate-300">
              <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
              Add Floor Stock
            </Button>

            <Button onClick={handleWhatsAppShare} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" disabled={isExporting}>
              <MessageCircle className="h-4 w-4" />
              {isExporting ? 'Generating...' : 'Share WA'}
            </Button>

            <Button onClick={handlePrint} className="bg-red-600 hover:bg-red-700 gap-1.5">
              <Printer className="h-4 w-4" />
              Print Audit
            </Button>
          </div>
        </div>

        {/* Live Top Status Cards (Floor Stock, Dispatched, Actual Sold, Returned) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 print:hidden">
          {/* Card 1: Live Floor Stock */}
          <Card className="border-slate-200 bg-white">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">1. Live Floor Stock</span>
              <Package className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-slate-900">{totalLiveFloorStock} <span className="text-xs font-normal text-slate-500">Cases</span></div>
              <p className="text-xs text-slate-500 mt-1">Available in warehouse</p>
            </CardContent>
          </Card>

          {/* Card 2: Dispatched on Load */}
          <Card className="border-slate-200 bg-white">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">2. Dispatched Load</span>
              <Truck className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-blue-600">
                {reconciliation?.totalDispatchedCases || 0} <span className="text-xs font-normal text-slate-500">Cases</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{dailySalesList.length} Outlets Booked</p>
            </CardContent>
          </Card>

          {/* Card 3: Actual Sales Realized */}
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">3. Actual Sales Sold</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-emerald-700">
                {reconciliation?.actualDailySales.totalDeliveredCases || 0} <span className="text-xs font-normal text-emerald-600">Cases</span>
              </div>
              <p className="text-xs text-emerald-700 font-medium mt-1">
                PKR {(reconciliation?.actualDailySales.totalActualRevenue || 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Returned / Not Accepted */}
          <Card className={cn("border-slate-200", (reconciliation?.totalRejectedCases || 0) > 0 ? "border-rose-300 bg-rose-50/40" : "bg-white")}>
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <span className={cn("text-xs font-bold uppercase tracking-wide", (reconciliation?.totalRejectedCases || 0) > 0 ? "text-rose-800" : "text-slate-500")}>
                4. Returned / Rejected
              </span>
              <XCircle className={cn("h-4 w-4", (reconciliation?.totalRejectedCases || 0) > 0 ? "text-rose-600" : "text-slate-400")} />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className={cn("text-2xl font-bold", (reconciliation?.totalRejectedCases || 0) > 0 ? "text-rose-700" : "text-slate-900")}>
                {reconciliation?.totalRejectedCases || 0} <span className="text-xs font-normal text-slate-500">Cases</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {rejectedShopsCount + partialShopsCount} shops returned stock
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Action Banner for Outlet Delivery Confirmation */}
        <div className="bg-red-50/70 border border-red-200 text-slate-900 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs print:hidden">
          <div className="space-y-1">
            <h3 className="font-bold text-base flex items-center gap-2 text-slate-900">
              <Truck className="h-5 w-5 text-red-600" />
              Outlet Delivery Reconciliation Status
            </h3>
            <p className="text-xs md:text-sm text-slate-600">
              {dailySalesList.length} shops scheduled today: <strong className="text-slate-900">{acceptedShopsCount} accepted</strong>, <strong className="text-slate-900">{rejectedShopsCount} rejected</strong>, <strong className="text-slate-900">{partialShopsCount} partial</strong>. Click "Confirm / Record Outcome" on any shop below to log non-acceptances and returned cases.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {reconciliation && reconciliation.totalRejectedCases > 0 && (
              <Badge className="bg-red-600 text-white py-1 px-3 text-xs font-bold shadow-xs">
                {reconciliation.totalRejectedCases} Cases to Restock
              </Badge>
            )}
          </div>
        </div>

        {/* 8-POINT COMPLETE RECONCILIATION DOCUMENT (PRINT & EXPORT CONTAINER) */}
        <div ref={reportRef} className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-2xs font-sans text-slate-900 print:border-0 print:p-0 print:shadow-none space-y-6">
          
          {/* Header of Audit Sheet */}
          <div className="border-b-2 border-red-600 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-red-600">Official Stock Control & Audit System</span>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase">
                Daily Stock Reconciliation & Actual Sales Summary
              </h2>
              <p className="text-xs text-slate-500">KFM Beverages (WARSA) Pure Drinking Water • 40-1 Saddar Bazar Lahore</p>
            </div>
            <div className="text-left md:text-right bg-slate-50 p-2 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-500">Audit Date</p>
              <p className="text-base font-bold text-slate-900">{format(parseISO(selectedDate), 'EEEE, dd MMMM yyyy')}</p>
            </div>
          </div>

          {/* POINT 1, POINT 2, POINT 6: Floor Stock & Load Summary Matrix */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="bg-red-600 text-white rounded w-5 h-5 flex items-center justify-center text-xs font-bold">1</span>
                Stock Floor Balance & Load Movement Matrix
              </h3>
              <span className="text-xs text-slate-500 font-medium">(Points 1, 2 & 6: Opening Floor, Dispatched, Restocked, Live Balance)</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Product Name</th>
                    <th className="p-2.5 text-center">SKU</th>
                    <th className="p-2.5 text-center bg-slate-200/60 font-black">1. Opening Floor Stock</th>
                    <th className="p-2.5 text-center text-blue-700 bg-blue-50 font-black">2. Dispatched Load</th>
                    <th className="p-2.5 text-center text-emerald-700 bg-emerald-50">3. Actual Sold/Delivered</th>
                    <th className="p-2.5 text-center text-rose-700 bg-rose-50">5. Returned / Not Accepted</th>
                    <th className="p-2.5 text-center bg-red-600 text-white font-black">6. Live Remaining Floor Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventory.map(prod => {
                    const opening = prod.OpeningStock ?? prod.Quantity;
                    const dispatched = reconciliation?.dispatchedStock.find(d => d.productId === prod.ID)?.qty || 0;
                    
                    // Sold count for this prod
                    let prodSold = 0;
                    let prodReturned = 0;
                    dailySalesList.forEach(sale => {
                      const item = sale.Items.find(i => i.ProductID === prod.ID);
                      if (item) {
                        const dQty = item.DeliveredQty !== undefined ? item.DeliveredQty : (sale.DeliveryStatus === 'REJECTED' ? 0 : item.Quantity);
                        const rQty = item.RejectedQty !== undefined ? item.RejectedQty : (sale.DeliveryStatus === 'REJECTED' ? item.Quantity : 0);
                        prodSold += dQty;
                        prodReturned += rQty;
                      }
                    });

                    return (
                      <tr key={prod.ID} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{prod.Name}</td>
                        <td className="p-2.5 text-center text-slate-500 font-mono">{prod.SKU}</td>
                        <td className="p-2.5 text-center font-bold bg-slate-50">{opening}</td>
                        <td className="p-2.5 text-center font-bold text-blue-700 bg-blue-50/40">{dispatched}</td>
                        <td className="p-2.5 text-center font-bold text-emerald-700 bg-emerald-50/40">{prodSold}</td>
                        <td className="p-2.5 text-center font-bold text-rose-700 bg-rose-50/40">{prodReturned}</td>
                        <td className="p-2.5 text-center font-black bg-slate-100 text-slate-900 text-sm">
                          {prod.Quantity}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={2} className="p-2.5 text-right uppercase">Total Cases:</td>
                    <td className="p-2.5 text-center font-black">{reconciliation?.totalOpeningCases || 0}</td>
                    <td className="p-2.5 text-center font-black text-blue-700">{reconciliation?.totalDispatchedCases || 0}</td>
                    <td className="p-2.5 text-center font-black text-emerald-700">{reconciliation?.actualDailySales.totalDeliveredCases || 0}</td>
                    <td className="p-2.5 text-center font-black text-rose-700">{reconciliation?.totalRejectedCases || 0}</td>
                    <td className="p-2.5 text-center font-black bg-red-600 text-white text-sm">
                      {totalLiveFloorStock}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* POINT 7: ACTUAL DAILY SALES SUMMARY (BOOKED VS REALIZED) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="bg-red-600 text-white rounded w-5 h-5 flex items-center justify-center text-xs font-bold">7</span>
                Actual Daily Sales Summary (Realized vs. Planned)
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 font-medium">Booked / Planned Orders</span>
                <p className="text-lg font-bold text-slate-900">{reconciliation?.totalDispatchedCases || 0} Cases</p>
                <p className="text-slate-600 font-medium">PKR {(reconciliation?.actualDailySales.totalBookedRevenue || 0).toLocaleString()}</p>
              </div>

              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                <span className="text-emerald-800 font-bold">✓ Actual Delivered Sales</span>
                <p className="text-lg font-black text-emerald-700">{reconciliation?.actualDailySales.totalDeliveredCases || 0} Cases</p>
                <p className="text-emerald-800 font-bold">PKR {(reconciliation?.actualDailySales.totalActualRevenue || 0).toLocaleString()}</p>
              </div>

              <div className="bg-rose-50 p-3 rounded-lg border border-rose-200">
                <span className="text-rose-800 font-bold">✕ Not Accepted / Returned</span>
                <p className="text-lg font-black text-rose-700">{reconciliation?.totalRejectedCases || 0} Cases</p>
                <p className="text-rose-700 font-medium">PKR {(reconciliation?.actualDailySales.totalLostOrReturnedRevenue || 0).toLocaleString()}</p>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 font-medium">Acceptance Rate</span>
                <p className="text-lg font-bold text-slate-900">
                  {reconciliation && reconciliation.totalDispatchedCases > 0 
                    ? `${((reconciliation.actualDailySales.totalDeliveredCases / reconciliation.totalDispatchedCases) * 100).toFixed(1)}%`
                    : '100%'}
                </p>
                <p className="text-slate-500">{acceptedShopsCount} of {dailySalesList.length} shops fulfilled</p>
              </div>
            </div>
          </div>

          {/* POINT 5: SHOPS THAT DID NOT ACCEPT STOCK OR RETURNED GOODS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="bg-rose-600 text-white rounded w-5 h-5 flex items-center justify-center text-xs">5</span>
                Stock Not Accepted or Returned by Outlets
              </h3>
              <Badge variant="destructive" className="text-xs">
                {reconciliation?.rejectedAndReturned.length || 0} Item Rejection Events
              </Badge>
            </div>

            {(!reconciliation?.rejectedAndReturned || reconciliation.rejectedAndReturned.length === 0) ? (
              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                No stock rejections or returns recorded for this date. All dispatched orders were accepted in full.
              </div>
            ) : (
              <div className="overflow-x-auto border border-rose-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-rose-100/70 text-rose-950 font-bold uppercase border-b border-rose-200">
                    <tr>
                      <th className="p-2.5">Shop / Customer</th>
                      <th className="p-2.5 text-center">Inv #</th>
                      <th className="p-2.5">Product</th>
                      <th className="p-2.5 text-center text-rose-700 font-bold">Qty Not Accepted</th>
                      <th className="p-2.5">Rejection Reason</th>
                      <th className="p-2.5">Remarks / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100 bg-rose-50/20">
                    {reconciliation.rejectedAndReturned.map((rej, idx) => (
                      <tr key={idx} className="hover:bg-rose-50/60">
                        <td className="p-2.5 font-bold text-slate-900">
                          [{rej.outletCode}] {rej.outletName}
                        </td>
                        <td className="p-2.5 text-center font-mono font-medium text-slate-600">#{rej.saleId}</td>
                        <td className="p-2.5 font-medium">{rej.productName}</td>
                        <td className="p-2.5 text-center font-black text-rose-700 bg-rose-100/50">{rej.rejectedQty} Cases</td>
                        <td className="p-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            {rej.reason}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600 italic">
                          {rej.notes || 'Returned to vehicle / pending restock'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-rose-100/80 font-bold">
                    <tr>
                      <td colSpan={3} className="p-2.5 text-right uppercase text-rose-900">Total Returned / Rejected:</td>
                      <td className="p-2.5 text-center text-rose-900 font-black text-sm">{reconciliation.totalRejectedCases} Cases</td>
                      <td colSpan={2} className="p-2.5 text-rose-800 text-xs">
                        *Returned stock balance can be added back to live floor inventory.
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* POINT 3, 4, 8: OUTLET-WISE STOCK INTAKE & ACTUAL SALES */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="bg-red-600 text-white rounded w-5 h-5 flex items-center justify-center text-xs font-bold">4</span>
                Outlet-Wise Stock Intake & Sales Breakdown (Points 3, 4 & 8)
              </h3>
              <span className="text-xs text-slate-500 font-medium">Per Outlet Dispatched vs. Accepted vs. Returned</span>
            </div>

            {dailySalesList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg text-sm border border-slate-200">
                No outlet orders recorded for {selectedDate}.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Outlet / Customer</th>
                      <th className="p-2.5">Route</th>
                      <th className="p-2.5 text-center">Inv #</th>
                      <th className="p-2.5 text-center">Dispatched</th>
                      <th className="p-2.5 text-center text-emerald-700 font-bold">Accepted</th>
                      <th className="p-2.5 text-center text-rose-700 font-bold">Returned</th>
                      <th className="p-2.5 text-center">Delivery Status</th>
                      <th className="p-2.5 text-right">Actual Bill (PKR)</th>
                      <th className="p-2.5 text-right print:hidden">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailySalesList.map(sale => {
                      const outlet = outlets.find(o => o.Name === sale.OutletName || o.Address === sale.Address);
                      const delivered = sale.DeliveredCases !== undefined ? sale.DeliveredCases : (sale.DeliveryStatus === 'REJECTED' ? 0 : sale.TotalCases);
                      const rejected = sale.RejectedCases !== undefined ? sale.RejectedCases : (sale.DeliveryStatus === 'REJECTED' ? sale.TotalCases : 0);
                      const actualTotal = sale.ActualGrandTotal !== undefined ? sale.ActualGrandTotal : (sale.DeliveryStatus === 'REJECTED' ? 0 : sale.GrandTotal);

                      return (
                        <tr key={sale.ID} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">
                            [{outlet?.Code || '-'}] {sale.OutletName}
                          </td>
                          <td className="p-2.5 text-slate-500">{sale.Route || outlet?.Route || '-'}</td>
                          <td className="p-2.5 text-center font-mono text-slate-600">#{sale.ID}</td>
                          <td className="p-2.5 text-center font-semibold">{sale.TotalCases}</td>
                          <td className="p-2.5 text-center font-bold text-emerald-700 bg-emerald-50/30">{delivered}</td>
                          <td className="p-2.5 text-center font-bold text-rose-700 bg-rose-50/30">{rejected}</td>
                          <td className="p-2.5 text-center">
                            {sale.DeliveryStatus === 'REJECTED' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                                Not Accepted
                              </span>
                            ) : sale.DeliveryStatus === 'PARTIAL' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                                Partial Accepted
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                Fully Delivered
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            {actualTotal.toFixed(0)}
                          </td>
                          <td className="p-2.5 text-right print:hidden">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedSaleForDelivery(sale)}
                              className="h-7 text-xs px-2 border-slate-300 hover:bg-slate-100"
                            >
                              Update Status
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={3} className="p-2.5 text-right uppercase">Total:</td>
                      <td className="p-2.5 text-center font-black">{reconciliation?.totalDispatchedCases || 0}</td>
                      <td className="p-2.5 text-center font-black text-emerald-700">{reconciliation?.actualDailySales.totalDeliveredCases || 0}</td>
                      <td className="p-2.5 text-center font-black text-rose-700">{reconciliation?.totalRejectedCases || 0}</td>
                      <td className="p-2.5 text-center font-medium text-slate-500">
                        {acceptedShopsCount} Fully / {rejectedShopsCount + partialShopsCount} Returned
                      </td>
                      <td className="p-2.5 text-right font-black text-slate-900 text-sm">
                        PKR {(reconciliation?.actualDailySales.totalActualRevenue || 0).toLocaleString()}
                      </td>
                      <td className="print:hidden"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Signature & Sign-Off Section */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-3 gap-4 text-center text-xs text-slate-600">
            <div className="space-y-6">
              <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
              <p className="font-bold uppercase tracking-wider text-slate-900">Floor Store Manager</p>
            </div>
            <div className="space-y-6">
              <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
              <p className="font-bold uppercase tracking-wider text-slate-900">Dispatch / Vehicle Incharge</p>
            </div>
            <div className="space-y-6">
              <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
              <p className="font-bold uppercase tracking-wider text-slate-900">Accounts & Reconciliation</p>
            </div>
          </div>

        </div>

      </div>

      {/* Delivery Confirmation & Rejection Modal */}
      {selectedSaleForDelivery && (
        <DeliveryStatusModal
          sale={selectedSaleForDelivery}
          onClose={() => setSelectedSaleForDelivery(null)}
          onSuccess={loadAllData}
        />
      )}

      {/* Add Floor Stock Inward Modal */}
      {isInwardModalOpen && (
        <div 
          style={{ zIndex: 999999 }}
          className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
                Add Inward Floor Stock
              </h3>
              <button onClick={() => setIsInwardModalOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleAddInwardStock} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Select Product</label>
                <select
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500"
                  value={inwardProductId}
                  onChange={e => setInwardProductId(e.target.value)}
                  required
                >
                  {inventory.map(p => (
                    <option key={p.ID} value={p.ID}>{p.Name} (Current Floor: {p.Quantity})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Quantity to Inward (Cases / Bottles)</label>
                <Input
                  type="number"
                  min="1"
                  value={inwardQty}
                  onChange={e => setInwardQty(Number(e.target.value))}
                  required
                  className="h-10"
                />
              </div>

              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800">
                This will immediately increase the live floor balance available in the warehouse.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsInwardModalOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Add to Floor Stock</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
