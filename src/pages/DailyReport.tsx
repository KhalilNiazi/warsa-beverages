import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/src/components/ui/input';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { fetchSales, fetchInventory, fetchOutlets, getDailyReconciliation, fetchCashSlips } from '@/src/api';
import { SaleRecord, InventoryItem, Outlet, ReconciliationSummary, CashSlipRecord } from '@/src/types';
import { 
  Printer, 
  MessageCircle, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RotateCcw, 
  Banknote, 
  ArrowRight, 
  Plus, 
  Eye, 
  Fuel, 
  Wrench, 
  Coffee, 
  Truck,
  Receipt,
  Download
} from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { format, isSameDay, parseISO } from 'date-fns';
import { cn } from '@/src/lib/utils';

export function DailyReport() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationSummary | null>(null);
  const [cashSlips, setCashSlips] = useState<CashSlipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeView, setActiveView] = useState<'matrix' | 'reconciliation' | 'cash_settlement'>('matrix');
  const [showIframeWarning, setShowIframeWarning] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Sync date when navigated from Cash Slip Book
  useEffect(() => {
    const navDate = localStorage.getItem('warsa_active_report_date');
    if (navDate) {
      setSelectedDate(navDate);
      localStorage.removeItem('warsa_active_report_date');
    }
  }, []);

  const navigateToCashSlip = (autoOpen = false) => {
    localStorage.setItem('warsa_active_cash_slip_date', selectedDate);
    if (autoOpen) {
      localStorage.setItem('warsa_auto_open_cash_slip', 'true');
    }
    window.dispatchEvent(new CustomEvent('navigate_page', { detail: 'cashSlipBook' }));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [salesData, invData, outletsData, recData, slipsData] = await Promise.all([
        fetchSales(),
        fetchInventory(),
        fetchOutlets(),
        getDailyReconciliation(selectedDate),
        fetchCashSlips()
      ]);
      setSales(salesData);
      setInventory(invData);
      setOutlets(outletsData);
      setReconciliation(recData);
      setCashSlips(slipsData);
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
  }, [selectedDate]);

  const handleWhatsAppShare = async () => {
    if (!reportRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], `Daily_Report_${selectedDate}.pdf`, { type: 'application/pdf' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Daily Report ${selectedDate}`,
          text: `Here is the daily report for ${selectedDate}.`
        });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        window.open(`https://wa.me/?text=Please%20find%20the%20downloaded%20Daily%20Report%20for%20${selectedDate}%20attached.`, '_blank');
      }
    } catch (error) {
      console.error('Error sharing report:', error);
      alert('Failed to generate or share PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!reportRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(reportRef.current, { 
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imgData;
      a.download = `Daily_Sales_Report_${selectedDate}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (window.self !== window.top) {
      setShowIframeWarning(true);
    }
    setTimeout(() => {
      try { window.print(); } catch(e) {}
    }, 100);
  };

  const dailySales = sales.filter(s => isSameDay(parseISO(s.Date), parseISO(selectedDate)));

  const soldProductIds = new Set<string>();
  dailySales.forEach(s => {
    s.Items.forEach(i => soldProductIds.add(i.ProductID));
  });

  const columns = inventory.filter(inv => soldProductIds.has(inv.ID) || inventory.length <= 4);

  let overallTotalCases = 0;
  let overallDeliveredCases = 0;
  let overallRejectedCases = 0;
  let overallBookedAmount = 0;
  let overallActualAmount = 0;
  const colTotals: Record<string, number> = {};
  const colDeliveredTotals: Record<string, number> = {};

  // Cash calculations from daily sales
  let expectedCashFromInvoices = 0;
  let creditFromInvoices = 0;

  dailySales.forEach(s => {
    const isRejected = s.DeliveryStatus === 'REJECTED';
    const actualVal = isRejected ? 0 : (s.ActualGrandTotal !== undefined ? s.ActualGrandTotal : s.GrandTotal);
    const credit = s.CreditAmount || 0;
    creditFromInvoices += credit;

    if (s.CashCollected !== undefined) {
      expectedCashFromInvoices += s.CashCollected;
    } else {
      expectedCashFromInvoices += Math.max(0, actualVal - credit);
    }
  });

  const matchingDaySlips = cashSlips.filter(s => s.date === selectedDate);
  const totalSlipsAccounted = matchingDaySlips.reduce((sum, s) => sum + s.totalAccountedCash, 0);
  const totalSlipsPhysical = matchingDaySlips.reduce((sum, s) => sum + s.totalPhysicalCash, 0);
  const totalSlipsExpenses = matchingDaySlips.reduce((sum, s) => sum + s.totalExpenses, 0);
  const totalSlipsFuel = matchingDaySlips.reduce((sum, s) => sum + s.fuelExpense, 0);
  const totalSlipsVehicle = matchingDaySlips.reduce((sum, s) => sum + s.vehicleExpense, 0);
  const totalSlipsPersonal = matchingDaySlips.reduce((sum, s) => sum + s.personalExpense, 0);
  const totalSlipsOther = matchingDaySlips.reduce((sum, s) => sum + s.otherExpense, 0);

  const dayDifference = totalSlipsAccounted - expectedCashFromInvoices;
  const isExactDayMatch = matchingDaySlips.length > 0 && dayDifference === 0;
  const isDayShortage = matchingDaySlips.length > 0 && dayDifference < 0;
  const isDayExcess = matchingDaySlips.length > 0 && dayDifference > 0;

  const aggregatedDenominations = matchingDaySlips.reduce((acc, slip) => {
    return {
      note5000: (acc.note5000 || 0) + (slip.denominations?.note5000 || 0),
      note1000: (acc.note1000 || 0) + (slip.denominations?.note1000 || 0),
      note500: (acc.note500 || 0) + (slip.denominations?.note500 || 0),
      note100: (acc.note100 || 0) + (slip.denominations?.note100 || 0),
      note50: (acc.note50 || 0) + (slip.denominations?.note50 || 0),
      note20: (acc.note20 || 0) + (slip.denominations?.note20 || 0),
      note10: (acc.note10 || 0) + (slip.denominations?.note10 || 0),
      coins: (acc.coins || 0) + (slip.denominations?.coins || 0),
    };
  }, { note5000: 0, note1000: 0, note500: 0, note100: 0, note50: 0, note20: 0, note10: 0, coins: 0 });

  const reportRows = dailySales.map(sale => {
    const outlet = outlets.find(o => o.Name === sale.OutletName || o.Address === sale.Address);
    
    let saleCases = 0;
    let saleDeliveredCases = 0;
    let saleRejectedCases = 0;
    const prodCounts: Record<string, number> = {};
    const prodDeliveredCounts: Record<string, number> = {};

    sale.Items.forEach(item => {
      const dQty = item.DeliveredQty !== undefined ? item.DeliveredQty : (sale.DeliveryStatus === 'REJECTED' ? 0 : item.Quantity);
      const rQty = item.RejectedQty !== undefined ? item.RejectedQty : (sale.DeliveryStatus === 'REJECTED' ? item.Quantity : 0);

      prodCounts[item.ProductID] = (prodCounts[item.ProductID] || 0) + item.Quantity;
      prodDeliveredCounts[item.ProductID] = (prodDeliveredCounts[item.ProductID] || 0) + dQty;

      colTotals[item.ProductID] = (colTotals[item.ProductID] || 0) + item.Quantity;
      colDeliveredTotals[item.ProductID] = (colDeliveredTotals[item.ProductID] || 0) + dQty;

      saleCases += item.Quantity;
      saleDeliveredCases += dQty;
      saleRejectedCases += rQty;
    });

    const actualAmount = sale.ActualGrandTotal !== undefined ? sale.ActualGrandTotal : (sale.DeliveryStatus === 'REJECTED' ? 0 : sale.GrandTotal);

    overallTotalCases += saleCases;
    overallDeliveredCases += saleDeliveredCases;
    overallRejectedCases += saleRejectedCases;
    overallBookedAmount += sale.GrandTotal;
    overallActualAmount += actualAmount;

    return {
      ID: sale.ID,
      Code: outlet?.Code || '-',
      CustomerName: sale.OutletName,
      Route: sale.Route || outlet?.Route || '-',
      OB: outlet?.OB || sale.OwnerName || '-',
      DeliveryStatus: sale.DeliveryStatus || (saleRejectedCases > 0 ? (saleDeliveredCases === 0 ? 'REJECTED' : 'PARTIAL') : 'DELIVERED'),
      RejectionReason: sale.RejectionReason,
      ProductCounts: prodCounts,
      ProductDeliveredCounts: prodDeliveredCounts,
      TotalCases: saleCases,
      DeliveredCases: saleDeliveredCases,
      RejectedCases: saleRejectedCases,
      Amount: sale.GrandTotal,
      ActualAmount: actualAmount,
      Average: saleCases > 0 ? (sale.GrandTotal / saleCases) : 0
    };
  });

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
          <p><strong>Note:</strong> If the print dialog didn't open, it's because the preview window blocks popups. Please click the <strong>"Open in New Tab"</strong> icon at the top right of the screen to print.</p>
          <Button variant="ghost" size="sm" onClick={() => setShowIframeWarning(false)}>Dismiss</Button>
        </div>
      )}
      
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6 print:p-0 print:m-0 print:w-full print:max-w-none print:space-y-4">
        
        {/* Header - Hidden on print */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Daily Sales & Delivery Report</h1>
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveView('matrix')}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-md transition-all",
                    activeView === 'matrix' ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Table Sheet View
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('cash_settlement')}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5",
                    activeView === 'cash_settlement' ? "bg-white text-red-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Banknote className="h-3.5 w-3.5" />
                  <span>Cash Slip Settlement</span>
                  {matchingDaySlips.length > 0 && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                      isExactDayMatch ? "bg-emerald-100 text-emerald-800" : (isDayShortage ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800")
                    )}>
                      {isExactDayMatch ? "Exact Match" : (isDayShortage ? `-PKR ${Math.abs(dayDifference).toLocaleString()}` : `+PKR ${dayDifference.toLocaleString()}`)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('reconciliation')}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-md transition-all",
                    activeView === 'reconciliation' ? "bg-white text-red-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Daily Summary View
                </button>
              </div>
            </div>
            <p className="text-sm md:text-base text-gray-500 mt-1">
              {dailySales.length} shops ordered • {overallDeliveredCases} cases delivered • {overallRejectedCases} cases returned.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
            />
            <Button onClick={handleDownloadImage} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100 bg-white" disabled={isGenerating}>
              <Download className="w-4 h-4 mr-2 text-blue-600" />
              {isGenerating ? 'Rendering...' : 'Save Picture (PNG)'}
            </Button>
            <Button onClick={handleWhatsAppShare} className="bg-green-600 hover:bg-green-700 text-white" disabled={isGenerating}>
              <MessageCircle className="w-4 h-4 mr-2" />
              {isGenerating ? 'Preparing...' : 'Share WhatsApp'}
            </Button>
            <Button onClick={handlePrint} className="bg-red-600 hover:bg-red-700 text-white">
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
          </div>
        </div>

        {/* Realized Sales vs Booked Summary Pill */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs print:hidden">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Booked Load</span>
            <p className="text-lg font-bold text-slate-900">{overallTotalCases} Cases (PKR {overallBookedAmount.toLocaleString()})</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-emerald-700 uppercase">Actual Delivered Sales</span>
            <p className="text-lg font-bold text-emerald-700">{overallDeliveredCases} Cases (PKR {overallActualAmount.toLocaleString()})</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-rose-700 uppercase">Not Accepted / Returned</span>
            <p className="text-lg font-bold text-rose-700">{overallRejectedCases} Cases (PKR {(overallBookedAmount - overallActualAmount).toLocaleString()})</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Live Remaining Floor</span>
            <p className="text-lg font-bold text-slate-900">{inventory.reduce((a, b) => a + b.Quantity, 0)} Cases</p>
          </div>
        </div>

        {/* Cash Slip Settlement Reconciliation Banner */}
        <div className={cn(
          "p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs print:hidden transition-all",
          matchingDaySlips.length === 0 
            ? "bg-amber-50/80 border-amber-200 text-amber-950"
            : isExactDayMatch
              ? "bg-emerald-50/90 border-emerald-300 text-emerald-950"
              : isDayShortage
                ? "bg-rose-50/90 border-rose-300 text-rose-950"
                : "bg-blue-50/90 border-blue-300 text-blue-950"
        )}>
          <div className="flex items-start sm:items-center gap-3">
            <div className={cn(
              "p-2 rounded-xl shrink-0",
              matchingDaySlips.length === 0 ? "bg-amber-100 text-amber-700" : (isExactDayMatch ? "bg-emerald-100 text-emerald-700" : (isDayShortage ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"))
            )}>
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black">Cash Slip Settlement Reconciliation:</span>
                {matchingDaySlips.length === 0 ? (
                  <Badge variant="outline" className="bg-white text-amber-800 border-amber-300 text-[10px]">
                    No Cash Slip Logged For Today
                  </Badge>
                ) : isExactDayMatch ? (
                  <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-black gap-1 border border-emerald-300">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Exact Match (PKR 0 Discrepancy)
                  </Badge>
                ) : isDayShortage ? (
                  <Badge className="bg-rose-100 text-rose-800 text-[10px] font-black gap-1 border border-rose-300">
                    <AlertTriangle className="h-3 w-3 text-rose-600" />
                    Shortage: PKR {Math.abs(dayDifference).toLocaleString()}
                  </Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-800 text-[10px] font-black gap-1 border border-blue-300">
                    Surplus: +PKR {dayDifference.toLocaleString()}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-gray-600 mt-1">
                {matchingDaySlips.length > 0 
                  ? `System Expected Cash: PKR ${expectedCashFromInvoices.toLocaleString()} | Salesman Accounted: PKR ${totalSlipsAccounted.toLocaleString()} (Physical Notes: PKR ${totalSlipsPhysical.toLocaleString()} + Deductions: PKR ${totalSlipsExpenses.toLocaleString()})`
                  : `Total ${dailySales.length} orders on ${format(parseISO(selectedDate), 'dd MMM yyyy')}. Verify salesman cash settlement slip with note denominations & fuel/repair expenses.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveView('cash_settlement')}
              className="h-8 text-xs font-bold gap-1.5 bg-white border-gray-300 hover:border-red-300 text-gray-800"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>View Match Sheet</span>
            </Button>
            <Button
              size="sm"
              onClick={() => navigateToCashSlip(false)}
              className="h-8 text-xs font-bold gap-1.5 bg-red-600 hover:bg-red-700 text-white"
            >
              <span>Open Cash Slip Book</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 print:hidden">Loading report...</div>
        ) : activeView === 'cash_settlement' ? (
          /* CASH SLIP SETTLEMENT & COMPARISON VIEW */
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <Banknote className="h-6 w-6 text-red-600" />
                    <span>Daily Sales vs Cash Slip Book Reconciliation</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Matching physical cash handed over + route expenses against invoices generated on {format(parseISO(selectedDate), 'dd MMMM yyyy')}
                  </p>
                </div>

                <Button
                  onClick={() => navigateToCashSlip(true)}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold h-9 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Create / Edit Cash Slip for this Date</span>
                </Button>
              </div>

              {/* 3-Way Reconciliation Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. Daily Sales Report Cash */}
                <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 space-y-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">1. Daily Sales Report (System Cash)</span>
                  <p className="text-2xl font-black text-gray-900">
                    PKR {expectedCashFromInvoices.toLocaleString()}
                  </p>
                  <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-200">
                    <div className="flex justify-between">
                      <span>Total Delivered Amount:</span>
                      <strong className="text-gray-800">PKR {overallActualAmount.toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Customer Credit:</span>
                      <strong className="text-amber-700">PKR {creditFromInvoices.toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Invoices Delivered:</span>
                      <strong className="text-gray-800">{dailySales.length} Orders</strong>
                    </div>
                  </div>
                </div>

                {/* 2. Salesman Accounted Cash */}
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2">
                  <span className="text-xs font-bold text-blue-700 uppercase">2. Salesman Accounted Cash</span>
                  <p className="text-2xl font-black text-blue-950">
                    PKR {totalSlipsAccounted.toLocaleString()}
                  </p>
                  <div className="text-xs text-blue-900/80 space-y-1 pt-2 border-t border-blue-200">
                    <div className="flex justify-between">
                      <span>Physical Notes Handed:</span>
                      <strong className="text-blue-950">PKR {totalSlipsPhysical.toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Expenses Deducted:</span>
                      <strong className="text-amber-800">PKR {totalSlipsExpenses.toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Slips Registered:</span>
                      <strong className="text-blue-950">{matchingDaySlips.length} Cash Slip(s)</strong>
                    </div>
                  </div>
                </div>

                {/* 3. Real-Time Discrepancy / Difference */}
                <div className={cn(
                  "p-4 rounded-xl border-2 space-y-2 flex flex-col justify-center",
                  matchingDaySlips.length === 0 
                    ? "bg-gray-50 border-gray-300 text-gray-700"
                    : isExactDayMatch
                      ? "bg-emerald-50 border-emerald-400 text-emerald-950"
                      : isDayShortage
                        ? "bg-rose-50 border-rose-400 text-rose-950"
                        : "bg-blue-50 border-blue-400 text-blue-950"
                )}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase">3. Difference</span>
                    {isExactDayMatch && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                    {isDayShortage && <AlertTriangle className="h-5 w-5 text-rose-600" />}
                  </div>
                  
                  <p className="text-2xl font-black">
                    {matchingDaySlips.length === 0
                      ? "Pending Slip"
                      : isExactDayMatch
                        ? "PKR 0 (EXACT MATCH)"
                        : isDayShortage
                          ? `- PKR ${Math.abs(dayDifference).toLocaleString()}`
                          : `+ PKR ${dayDifference.toLocaleString()}`
                    }
                  </p>

                  <p className="text-xs font-bold pt-1">
                    {matchingDaySlips.length === 0 && "No cash settlement slip has been logged yet by the salesman for this date."}
                    {isExactDayMatch && "✅ Accounted cash exactly matches system sales collection! No discrepancy."}
                    {isDayShortage && `⚠️ Cash Shortage: Salesman has a pending deficit of PKR ${Math.abs(dayDifference).toLocaleString()}.`}
                    {isDayExcess && `ℹ️ Cash Surplus: An excess of PKR ${dayDifference.toLocaleString()} was received.`}
                  </p>
                </div>

              </div>

              {/* Slips Breakdown for Selected Date */}
              {matchingDaySlips.length > 0 ? (
                <div className="space-y-4 pt-2">
                  <h3 className="text-sm font-bold text-gray-900 uppercase">
                    Cash Slip Records for {format(parseISO(selectedDate), 'dd MMM yyyy')}
                  </h3>

                  <div className="grid grid-cols-1 gap-4">
                    {matchingDaySlips.map(slip => (
                      <div key={slip.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-200 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-red-600">{slip.slipNumber}</span>
                            <span className="text-gray-400">•</span>
                            <span className="font-bold text-gray-900">{slip.salesmanName}</span>
                            <span className="text-xs text-gray-500">({slip.route})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              Vehicle: <strong>{slip.vehicleType} {slip.vehicleNumber ? `(${slip.vehicleNumber})` : ''}</strong>
                            </span>
                            {slip.matchStatus === 'EXACT_MATCH' ? (
                              <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Exact Match (PKR 0)</Badge>
                            ) : (
                              <Badge className="bg-rose-100 text-rose-800 text-[10px]">Shortage: PKR {Math.abs(slip.difference).toLocaleString()}</Badge>
                            )}
                          </div>
                        </div>

                        {/* Note breakdown & expense mini table */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          {/* Notes */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-1">
                            <span className="font-bold text-gray-700 block text-[11px] uppercase">Currency Notes Handed:</span>
                            <div className="grid grid-cols-4 gap-1 text-[11px] text-gray-600">
                              <div>5000: <strong>{slip.denominations.note5000 || 0}</strong></div>
                              <div>1000: <strong>{slip.denominations.note1000 || 0}</strong></div>
                              <div>500: <strong>{slip.denominations.note500 || 0}</strong></div>
                              <div>100: <strong>{slip.denominations.note100 || 0}</strong></div>
                              <div>50: <strong>{slip.denominations.note50 || 0}</strong></div>
                              <div>20: <strong>{slip.denominations.note20 || 0}</strong></div>
                              <div>10: <strong>{slip.denominations.note10 || 0}</strong></div>
                              <div>Coins: <strong>PKR {slip.denominations.coins || 0}</strong></div>
                            </div>
                            <div className="font-black text-gray-900 pt-1 text-right border-t border-gray-100">
                              Total Notes: PKR {slip.totalPhysicalCash.toLocaleString()}
                            </div>
                          </div>

                          {/* Expenses */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-1">
                            <span className="font-bold text-amber-800 block text-[11px] uppercase">Route Deductions:</span>
                            <div className="grid grid-cols-2 gap-1 text-[11px] text-gray-600">
                              <div>Fuel: <strong>PKR {slip.fuelExpense}</strong></div>
                              <div>Vehicle Repair: <strong>PKR {slip.vehicleExpense}</strong></div>
                              <div>Personal/Food: <strong>PKR {slip.personalExpense}</strong></div>
                              <div>Other: <strong>PKR {slip.otherExpense}</strong></div>
                            </div>
                            <div className="font-black text-amber-800 pt-1 text-right border-t border-gray-100">
                              Total Deductions: PKR {slip.totalExpenses.toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {slip.notes && (
                          <p className="text-[11px] text-gray-500 italic bg-white p-2 rounded border border-gray-200">
                            <strong>Note:</strong> {slip.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 space-y-3">
                  <Banknote className="h-10 w-10 text-gray-400 mx-auto" />
                  <h4 className="text-sm font-bold text-gray-700">No Cash Slip Entered for this Date</h4>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    The Daily Sales Report shows Rs. {expectedCashFromInvoices.toLocaleString()} expected cash. Create a cash slip to record notes count and expenses.
                  </p>
                  <Button
                    onClick={() => navigateToCashSlip(true)}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white text-xs"
                  >
                    + Create Cash Slip for this Date Now
                  </Button>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div ref={reportRef} className="print-report w-full bg-white print:bg-white text-black font-sans text-xs p-4 border border-slate-200 print:border-0 rounded-xl">
            <div className="text-center mb-4 font-bold text-lg uppercase tracking-widest border-b-2 border-black pb-2">
              KFM Beverages (WARSA) - DAILY SALES & STOCK REPORT ({format(parseISO(selectedDate), 'dd MMM yyyy')})
            </div>

            {/* Main Table */}
            <table className="w-full border-collapse border border-black mb-4 print:mb-2 text-[11px]">
              <thead>
                <tr>
                  <th className="border border-black bg-[#e2aa1e] text-black font-bold italic py-1 px-2 text-center w-12">CODE</th>
                  <th className="border border-black bg-[#e2aa1e] text-black font-bold italic py-1 px-2 text-left">CUSTOMER NAME</th>
                  <th className="border border-black bg-[#e2aa1e] text-black font-bold italic py-1 px-2 text-left">ROUTE</th>
                  <th className="border border-black bg-[#e2aa1e] text-black font-bold italic py-1 px-2 text-left">OB</th>
                  {columns.map(col => (
                    <th key={col.ID} className="border border-black bg-[#e2aa1e] text-black font-bold italic py-1 px-2 text-center w-16">{col.Name}</th>
                  ))}
                  <th className="border border-black bg-[#e2aa1e] text-black font-bold italic py-1 px-2 text-center w-16">DISPATCH</th>
                  <th className="border border-black bg-[#9bbb59] text-black font-bold italic py-1 px-2 text-center w-16">DELIVERED</th>
                  <th className="border border-black bg-[#f28c8c] text-black font-bold italic py-1 px-2 text-center w-16">RETURN</th>
                  <th className="border border-black bg-[#e2aa1e] text-black font-bold italic py-1 px-2 text-center w-24">ACTUAL AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.length === 0 ? (
                  <tr>
                    <td colSpan={8 + columns.length} className="border border-black p-4 text-center text-gray-500 font-bold text-base">
                      No orders found for this date.
                    </td>
                  </tr>
                ) : (
                  reportRows.map((row, idx) => {
                    const isRejected = row.DeliveryStatus === 'REJECTED';
                    const isPartial = row.DeliveryStatus === 'PARTIAL';

                    return (
                      <tr key={idx} className={cn(isRejected ? "bg-rose-50" : isPartial ? "bg-amber-50/50" : "bg-[#f2f2f2]")}>
                        <td className="border border-black px-2 py-1 text-center font-bold">{row.Code}</td>
                        <td className="border border-black px-2 py-1 text-left font-medium">
                          {row.CustomerName}
                          {isRejected && <span className="ml-1 text-[10px] font-bold text-red-600">[{row.RejectionReason || 'NOT ACCEPTED'}]</span>}
                          {isPartial && <span className="ml-1 text-[10px] font-bold text-amber-700">[PARTIAL]</span>}
                        </td>
                        <td className="border border-black px-2 py-1 text-left">{row.Route}</td>
                        <td className="border border-black px-2 py-1 text-left">{row.OB}</td>
                        {columns.map(col => (
                          <td key={col.ID} className="border border-black px-2 py-1 text-center font-medium">
                            {row.ProductCounts[col.ID] || ''}
                          </td>
                        ))}
                        <td className="border border-black px-2 py-1 text-center font-bold">{row.TotalCases}</td>
                        <td className="border border-black px-2 py-1 text-center font-black text-emerald-800 bg-emerald-50/60">{row.DeliveredCases}</td>
                        <td className="border border-black px-2 py-1 text-center font-black text-rose-800 bg-rose-50/60">{row.RejectedCases || '-'}</td>
                        <td className="border border-black px-2 py-1 text-right font-black">
                          {row.ActualAmount.toFixed(0)}
                        </td>
                      </tr>
                    );
                  })
                )}
               
                {reportRows.length > 0 && (
                  <tr className="bg-[#c8c800] font-bold text-black text-sm">
                    <td colSpan={4} className="border border-black px-2 py-2 text-center uppercase tracking-widest text-xs font-black">TOTAL ACTUALS</td>
                    {columns.map(col => (
                      <td key={col.ID} className="border border-black px-2 py-2 text-center font-black">
                        {colTotals[col.ID] || 0}
                      </td>
                    ))}
                    <td className="border border-black px-2 py-2 text-center font-black">{overallTotalCases}</td>
                    <td className="border border-black px-2 py-2 text-center font-black text-emerald-950 bg-emerald-200">{overallDeliveredCases}</td>
                    <td className="border border-black px-2 py-2 text-center font-black text-rose-950 bg-rose-200">{overallRejectedCases}</td>
                    <td className="border border-black px-2 py-2 text-right font-black">PKR {overallActualAmount.toFixed(0)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Bottom Section Layout (Load and Store Balance) */}
            {reportRows.length > 0 && (
              <div className="flex flex-col md:flex-row gap-4 print:flex-row print:gap-1 items-start mt-6 print:mt-4">
                
                {/* Sale and Load Summaries */}
                <div className="flex w-full md:w-[65%] print:w-[65%]">
                   <div className="border border-black w-24 md:w-32 flex items-center justify-center font-bold italic text-base bg-[#e2e2e2]">
                     LOAD AUDIT
                   </div>
                   
                   <div className="flex-1 border border-black border-l-0">
                     <table className="w-full text-center border-collapse text-xs">
                       <thead>
                         <tr>
                           <th className="border border-black border-t-0 py-1 bg-[#d9d9d9] font-bold"></th>
                           {columns.map(col => <th key={col.ID} className="border border-black border-t-0 py-1 bg-[#c5c5c5] italic text-[11px] font-bold text-[#7f1d1d]">{col.Name}</th>)}
                           <th className="border border-black border-t-0 border-r-0 py-1 bg-[#c5c5c5] italic text-[11px] font-bold text-[#7f1d1d]">TOTAL</th>
                         </tr>
                       </thead>
                       <tbody>
                         <tr>
                           <td className="border border-black py-1 px-2 font-bold italic bg-[#4bacc6] text-black">DISPATCHED</td>
                           {columns.map(col => <td key={col.ID} className="border border-black bg-[#fcd5b4] font-bold">{colTotals[col.ID] || 0}</td>)}
                           <td className="border border-black border-r-0 bg-[#9bbb59] font-bold">{overallTotalCases}</td>
                         </tr>
                         <tr>
                           <td className="border border-black py-1 px-2 font-bold italic bg-[#9bbb59] text-black">ACTUAL DELIVERED</td>
                           {columns.map(col => <td key={col.ID} className="border border-black bg-emerald-100 font-bold">{colDeliveredTotals[col.ID] || 0}</td>)}
                           <td className="border border-black border-r-0 bg-[#4bacc6] font-bold">{overallDeliveredCases}</td>
                         </tr>
                         <tr>
                           <td className="border border-black py-1 px-2 font-bold italic bg-[#f28c8c] text-black">RETURNED / REJECTED</td>
                           {columns.map(col => <td key={col.ID} className="border border-black bg-rose-100 font-bold">{(colTotals[col.ID] || 0) - (colDeliveredTotals[col.ID] || 0)}</td>)}
                           <td className="border border-black border-r-0 bg-rose-200 font-black text-rose-900">{overallRejectedCases}</td>
                         </tr>
                       </tbody>
                     </table>
                   </div>
                </div>

                {/* Warehouse Live Floor Balance (Right Block) */}
                <div className="w-full md:w-[35%] print:w-[35%] flex">
                  <div className="w-2 border-b border-black"></div>
                  <table className="flex-1 border-collapse border border-black bg-[#e2e2e2] text-xs">
                    <tbody>
                      <tr>
                        <td colSpan={2} className="border border-black italic font-bold text-center py-1 bg-[#d9d9d9]">LIVE FLOOR STOCK REMAINING</td>
                      </tr>
                      {inventory.map(col => (
                        <tr key={col.ID}>
                          <td className="border border-black font-bold italic text-left py-1 bg-[#e2e2e2] px-2 w-2/3">{col.Name}</td>
                          <td className="border border-black bg-white font-bold text-center w-1/3">{col.Quantity}</td>
                        </tr>
                      ))}
                      <tr className="bg-red-600 text-white font-black">
                        <td className="border border-black font-bold italic text-left py-1 px-2">TOTAL FLOOR CASES</td>
                        <td className="border border-black text-center py-1">{inventory.reduce((a, b) => a + b.Quantity, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Daily Cash & Closing Balance Reconciliation Block (Part of the printed/downloaded picture) */}
            {reportRows.length > 0 && (
              <div className="mt-4 print:mt-3 border border-black bg-white text-xs">
                {/* Section Header */}
                <div className="bg-red-600 text-white font-bold uppercase py-1.5 px-3 flex flex-wrap justify-between items-center text-xs tracking-wider">
                  <div className="flex items-center gap-2">
                    <span className="bg-white text-red-700 px-2 py-0.5 text-[10px] font-black rounded-xs shadow-2xs">DAILY CASH AUDIT</span>
                    <span>CLOSING BALANCE & CASH SLIP SETTLEMENT</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-200">
                    Status: {
                      matchingDaySlips.length === 0
                        ? "PENDING CASH SLIP"
                        : isExactDayMatch
                          ? "EXACT MATCH (PKR 0)"
                          : isDayShortage
                            ? `SHORTAGE (-PKR ${Math.abs(dayDifference).toLocaleString()})`
                            : `SURPLUS (+PKR ${dayDifference.toLocaleString()})`
                    }
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 divide-y md:divide-y-0 md:divide-x print:divide-y-0 print:divide-x divide-black">
                  {/* 1. System Invoices Cash */}
                  <div className="p-2 space-y-1.5 bg-[#f8fafc]">
                    <div className="font-black text-black border-b border-black pb-1 uppercase text-[11px] flex justify-between">
                      <span>1. System Sales Invoices</span>
                      <span className="text-gray-600">{dailySales.length} Orders</span>
                    </div>
                    <table className="w-full text-[11px] border-collapse">
                      <tbody>
                        <tr>
                          <td className="py-0.5 text-gray-700">Gross Delivered Sales:</td>
                          <td className="py-0.5 text-right font-bold">PKR {overallActualAmount.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-gray-700">Less: Customer Credit (Udhaar):</td>
                          <td className="py-0.5 text-right font-bold text-amber-800">- PKR {creditFromInvoices.toLocaleString()}</td>
                        </tr>
                        <tr className="border-t border-black font-black bg-[#fcd5b4]/80">
                          <td className="py-1 uppercase">Expected Sales Cash:</td>
                          <td className="py-1 text-right font-black text-xs">PKR {expectedCashFromInvoices.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="text-[10px] text-gray-500 italic pt-0.5">
                      Net cash expected after customer credit deduction.
                    </div>
                  </div>

                  {/* 2. Salesman Cash & Deductions Accounted */}
                  <div className="p-2 space-y-1.5 bg-[#f8fafc]">
                    <div className="font-black text-black border-b border-black pb-1 uppercase text-[11px] flex justify-between">
                      <span>2. Salesman Settlement</span>
                      <span className="text-gray-600">
                        {matchingDaySlips.length > 0 ? `${matchingDaySlips.length} Slip(s) Logged` : 'No Slip Logged'}
                      </span>
                    </div>
                    <table className="w-full text-[11px] border-collapse">
                      <tbody>
                        <tr>
                          <td className="py-0.5 text-gray-700">Physical Cash Notes:</td>
                          <td className="py-0.5 text-right font-bold">PKR {totalSlipsPhysical.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-gray-700">Route Fuel Expense:</td>
                          <td className="py-0.5 text-right font-bold">PKR {totalSlipsFuel.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-gray-700">Vehicle / Rickshaw Repair:</td>
                          <td className="py-0.5 text-right font-bold">PKR {totalSlipsVehicle.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-gray-700">Meals, Tea & Other:</td>
                          <td className="py-0.5 text-right font-bold">PKR {(totalSlipsPersonal + totalSlipsOther).toLocaleString()}</td>
                        </tr>
                        <tr className="border-t border-black font-black bg-[#9bbb59]/60">
                          <td className="py-1 uppercase">Total Accounted:</td>
                          <td className="py-1 text-right font-black text-xs text-blue-950">PKR {totalSlipsAccounted.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 3. Closing Balance Match / Missing Difference */}
                  <div className={cn(
                    "p-2.5 flex flex-col justify-between space-y-2",
                    matchingDaySlips.length === 0
                      ? "bg-amber-50"
                      : isExactDayMatch
                        ? "bg-emerald-50"
                        : isDayShortage
                          ? "bg-rose-50"
                          : "bg-blue-50"
                  )}>
                    <div>
                      <div className="font-black border-b border-black pb-1 uppercase text-[11px] flex justify-between items-center">
                        <span>3. Closing Balance Total Match</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 border border-black rounded-xs bg-white">
                          Diff = Accounted - Expected
                        </span>
                      </div>
                      <div className="mt-2 text-center p-2 border border-black bg-white rounded-xs">
                        <div className="text-[10px] uppercase font-bold text-gray-600">Reconciliation Discrepancy</div>
                        <div className={cn(
                          "text-base font-black tracking-tight",
                          matchingDaySlips.length === 0
                            ? "text-amber-800"
                            : isExactDayMatch
                              ? "text-emerald-700"
                              : isDayShortage
                                ? "text-rose-700"
                                : "text-blue-700"
                        )}>
                          {matchingDaySlips.length === 0
                            ? `PENDING SLIP (Rs. ${expectedCashFromInvoices.toLocaleString()})`
                            : isExactDayMatch
                              ? "PKR 0 (EXACT MATCH)"
                              : isDayShortage
                                ? `- PKR ${Math.abs(dayDifference).toLocaleString()} (MISSING CASH)`
                                : `+ PKR ${dayDifference.toLocaleString()} (EXCESS SURPLUS)`
                          }
                        </div>
                      </div>
                    </div>

                    <div className={cn(
                      "p-1.5 border border-black text-[11px] font-bold leading-tight",
                      matchingDaySlips.length === 0
                        ? "bg-amber-100 text-amber-950"
                        : isExactDayMatch
                          ? "bg-emerald-100 text-emerald-950"
                          : isDayShortage
                            ? "bg-rose-100 text-rose-950"
                            : "bg-blue-100 text-blue-950"
                    )}>
                      {matchingDaySlips.length === 0 && (
                        <span>⚠️ <strong>CASH SLIP PENDING:</strong> Salesman has not submitted the daily cash slip yet. Expected collection is PKR {expectedCashFromInvoices.toLocaleString()}.</span>
                      )}
                      {isExactDayMatch && (
                        <span>✅ <strong>PERFECT RECONCILIATION:</strong> Accounted cash and route expenses exactly match expected sales invoices. Zero missing cash.</span>
                      )}
                      {isDayShortage && (
                        <span>⚠️ <strong>CASH MISSING / DEFICIT:</strong> PKR {Math.abs(dayDifference).toLocaleString()} is MISSING from today's collection! Salesman owes this pending deficit.</span>
                      )}
                      {isDayExcess && (
                        <span>ℹ️ <strong>CASH SURPLUS:</strong> +PKR {dayDifference.toLocaleString()} excess cash accounted beyond expected sales.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Currency Notes Breakdown Bar */}
                {matchingDaySlips.length > 0 && (
                  <div className="border-t border-black bg-gray-100 px-3 py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
                    <span className="font-black uppercase text-black">Denomination Breakdown:</span>
                    <div className="flex flex-wrap items-center gap-x-2.5 text-[11px] font-semibold text-gray-800">
                      <span>5000: <strong>{aggregatedDenominations.note5000}</strong></span>
                      <span>1000: <strong>{aggregatedDenominations.note1000}</strong></span>
                      <span>500: <strong>{aggregatedDenominations.note500}</strong></span>
                      <span>100: <strong>{aggregatedDenominations.note100}</strong></span>
                      <span>50: <strong>{aggregatedDenominations.note50}</strong></span>
                      <span>20: <strong>{aggregatedDenominations.note20}</strong></span>
                      <span>10: <strong>{aggregatedDenominations.note10}</strong></span>
                      <span>Coins: <strong>PKR {aggregatedDenominations.coins.toLocaleString()}</strong></span>
                      <span className="font-black text-black bg-white px-2 py-0.5 border border-black rounded-xs">
                        Physical Cash: PKR {totalSlipsPhysical.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Signatures */}
            {reportRows.length > 0 && (
              <div className="mt-8 print:mt-6 flex justify-between items-end text-xs font-bold pt-4 border-t border-black">
                <div className="space-y-4 text-center">
                  <div className="border-b border-black w-32 md:w-36"></div>
                  <span>STORE MAN (STOCK)</span>
                </div>
                <div className="space-y-4 text-center">
                  <div className="border-b border-black w-32 md:w-36"></div>
                  <span>SALESMAN / BOOKER</span>
                </div>
                <div className="space-y-4 text-center">
                  <div className="border-b border-black w-32 md:w-36"></div>
                  <span>CASHIER (ACCOUNTS)</span>
                </div>
                <div className="space-y-4 text-center">
                  <div className="border-b border-black w-32 md:w-36"></div>
                  <span>MANAGEMENT AUDIT</span>
                </div>
              </div>
            )}
            
          </div>
        )}
      </div>
    </>
  );
}
