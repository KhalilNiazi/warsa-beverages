import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { 
  fetchCashSlips, 
  saveCashSlip, 
  deleteCashSlip, 
  getDailyExpectedSalesCash, 
  fetchOrderBookers, 
  fetchRoutes, 
  getCurrentUser,
  canModifyData 
} from '@/src/api';
import { 
  CashSlipRecord, 
  CashDenomination, 
  CashSlipExpense, 
  OrderBooker, 
  RouteRecord,
  SaleRecord
} from '@/src/types';
import { 
  Banknote, 
  Plus, 
  Printer, 
  Search, 
  Calendar, 
  User, 
  Truck, 
  Fuel, 
  Wrench, 
  Coffee, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Trash2, 
  Edit3, 
  Coins, 
  MessageCircle, 
  ArrowRight, 
  RotateCcw,
  Sparkles,
  Download,
  Receipt,
  Eye,
  SlidersHorizontal,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  ShieldAlert
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/src/lib/utils';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

const DEFAULT_DENOMINATIONS: CashDenomination = {
  note5000: 0,
  note1000: 0,
  note500: 0,
  note100: 0,
  note50: 0,
  note20: 0,
  note10: 0,
  coins: 0
};

export function CashSlipBook() {
  const canEdit = canModifyData();
  const [slips, setSlips] = useState<CashSlipRecord[]>([]);
  const [orderBookers, setOrderBookers] = useState<OrderBooker[]>([]);
  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterSalesman, setFilterSalesman] = useState<string>('ALL');
  const [filterRoute, setFilterRoute] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Active View / Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewingSlip, setViewingSlip] = useState<CashSlipRecord | null>(null);
  const [editingSlipId, setEditingSlipId] = useState<string | null>(null);
  const [slipToDelete, setSlipToDelete] = useState<string | null>(null);

  // Form State
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formSalesman, setFormSalesman] = useState('');
  const [formRoute, setFormRoute] = useState('');
  const [formVehicleType, setFormVehicleType] = useState<'Rickshaw' | 'Bike' | 'Suzuki' | 'Van' | 'Other'>('Rickshaw');
  const [formVehicleNumber, setFormVehicleNumber] = useState('');
  const [formReceivedBy, setFormReceivedBy] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Denominations
  const [denominations, setDenominations] = useState<CashDenomination>(DEFAULT_DENOMINATIONS);

  // Expenses
  const [fuelExpense, setFuelExpense] = useState<number>(0);
  const [vehicleExpense, setVehicleExpense] = useState<number>(0);
  const [personalExpense, setPersonalExpense] = useState<number>(0);
  const [otherExpense, setOtherExpense] = useState<number>(0);
  const [itemizedExpenses, setItemizedExpenses] = useState<CashSlipExpense[]>([]);

  // System Match Data (From Daily Sales Report)
  const [matchScope, setMatchScope] = useState<'ALL_DAY' | 'BY_SALESMAN' | 'BY_ROUTE'>('ALL_DAY');
  const [matchedSalesList, setMatchedSalesList] = useState<SaleRecord[]>([]);
  const [showInvoicesList, setShowInvoicesList] = useState(false);

  const [systemCashData, setSystemCashData] = useState<{
    expectedCash: number;
    creditAmount: number;
    deliveredAmount: number;
    invoicesCount: number;
  }>({
    expectedCash: 0,
    creditAmount: 0,
    deliveredAmount: 0,
    invoicesCount: 0
  });

  const printVoucherRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Load initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const [slipList, obList, routeList] = await Promise.all([
        fetchCashSlips(),
        fetchOrderBookers(),
        fetchRoutes()
      ]);
      setSlips(slipList);
      setOrderBookers(obList);
      setRoutes(routeList);

      const currentUser = getCurrentUser();
      if (currentUser && !formReceivedBy) {
        setFormReceivedBy(currentUser.name);
      }
    } catch (err) {
      console.error('Error loading cash slip data:', err);
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

  // Listen for navigation requests from Daily Sales Report
  useEffect(() => {
    const navDate = localStorage.getItem('warsa_active_cash_slip_date');
    const autoOpen = localStorage.getItem('warsa_auto_open_cash_slip');
    if (navDate) {
      setFilterDate(navDate);
      setFormDate(navDate);
      localStorage.removeItem('warsa_active_cash_slip_date');
      if (autoOpen === 'true') {
        localStorage.removeItem('warsa_auto_open_cash_slip');
        handleOpenNew(navDate);
      }
    }
  }, []);

  // Update expected cash from Daily Sales Report when Form Date, Route, Salesman, or Match Scope changes
  useEffect(() => {
    if (!isFormOpen) return;
    const fetchExpected = async () => {
      try {
        const rFilter = matchScope === 'BY_ROUTE' ? formRoute : undefined;
        const sFilter = matchScope === 'ALL_DAY' ? undefined : formSalesman;
        const res = await getDailyExpectedSalesCash(formDate, rFilter, sFilter);
        setSystemCashData({
          expectedCash: res.expectedCash,
          creditAmount: res.creditAmount,
          deliveredAmount: res.deliveredAmount,
          invoicesCount: res.invoicesCount
        });
        setMatchedSalesList(res.matchedSales || []);
      } catch (err) {
        console.error('Error getting expected cash:', err);
      }
    };
    fetchExpected();
  }, [formDate, formRoute, formSalesman, matchScope, isFormOpen]);

  // Navigate to Daily Sales Report for matched date
  const handleOpenDailyReport = (targetDate?: string) => {
    const dateToUse = targetDate || filterDate || formDate || format(new Date(), 'yyyy-MM-dd');
    localStorage.setItem('warsa_active_report_date', dateToUse);
    window.dispatchEvent(new CustomEvent('navigate_page', { detail: 'reports' }));
  };

  // Quick Match: Auto-fill note denominations to balance expected cash minus expenses
  const handleQuickMatchDenominations = () => {
    const netCashNeeded = Math.max(0, systemCashData.expectedCash - totalExpenses);
    let remaining = netCashNeeded;
    const n5000 = Math.floor(remaining / 5000); remaining %= 5000;
    const n1000 = Math.floor(remaining / 1000); remaining %= 1000;
    const n500 = Math.floor(remaining / 500); remaining %= 500;
    const n100 = Math.floor(remaining / 100); remaining %= 100;
    const n50 = Math.floor(remaining / 50); remaining %= 50;
    const n20 = Math.floor(remaining / 20); remaining %= 20;
    const n10 = Math.floor(remaining / 10); remaining %= 10;
    const coins = remaining;
    setDenominations({
      note5000: n5000,
      note1000: n1000,
      note500: n500,
      note100: n100,
      note50: n50,
      note20: n20,
      note10: n10,
      coins: coins
    });
  };

  // Denomination Math
  const physicalCashTotal = 
    (denominations.note5000 || 0) * 5000 +
    (denominations.note1000 || 0) * 1000 +
    (denominations.note500 || 0) * 500 +
    (denominations.note100 || 0) * 100 +
    (denominations.note50 || 0) * 50 +
    (denominations.note20 || 0) * 20 +
    (denominations.note10 || 0) * 10 +
    (denominations.coins || 0);

  // Total Expenses
  const totalExpenses = (fuelExpense || 0) + (vehicleExpense || 0) + (personalExpense || 0) + (otherExpense || 0);

  // Total Accounted by Salesman
  const totalAccountedCash = physicalCashTotal + totalExpenses;

  // Comparison with Daily Sales Report
  const difference = totalAccountedCash - systemCashData.expectedCash;
  const matchStatus: 'EXACT_MATCH' | 'SHORTAGE' | 'EXCESS' = 
    difference === 0 ? 'EXACT_MATCH' : difference < 0 ? 'SHORTAGE' : 'EXCESS';

  // Handle Note Count Changes
  const handleDenomChange = (key: keyof CashDenomination, value: string) => {
    const parsed = parseInt(value, 10);
    setDenominations(prev => ({
      ...prev,
      [key]: isNaN(parsed) || parsed < 0 ? 0 : parsed
    }));
  };

  const handleDenomIncrement = (key: keyof CashDenomination, amount: number) => {
    setDenominations(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + amount)
    }));
  };

  // Open Form for New Cash Slip
  const handleOpenNew = (initialDate?: string) => {
    setEditingSlipId(null);
    const dateToUse = initialDate || filterDate || format(new Date(), 'yyyy-MM-dd');
    setFormDate(dateToUse);
    if (orderBookers.length > 0) {
      setFormSalesman(orderBookers[0].Name);
      setFormRoute(orderBookers[0].AssignedRoutes?.[0] || routes[0]?.Name || '');
    } else {
      setFormSalesman('');
      setFormRoute(routes[0]?.Name || '');
    }
    setMatchScope('ALL_DAY');
    setShowInvoicesList(false);
    setFormVehicleType('Rickshaw');
    setFormVehicleNumber('');
    setDenominations(DEFAULT_DENOMINATIONS);
    setFuelExpense(0);
    setVehicleExpense(0);
    setPersonalExpense(0);
    setOtherExpense(0);
    setItemizedExpenses([]);
    setFormNotes('');
    const user = getCurrentUser();
    setFormReceivedBy(user?.name || 'Muhammad Tariq (Manager)');
    setIsFormOpen(true);
  };

  // Open Form to Edit Slip
  const handleEditSlip = (slip: CashSlipRecord) => {
    setEditingSlipId(slip.id);
    setFormDate(slip.date);
    setFormSalesman(slip.salesmanName);
    setFormRoute(slip.route);
    setFormVehicleType(slip.vehicleType || 'Rickshaw');
    setFormVehicleNumber(slip.vehicleNumber || '');
    setDenominations(slip.denominations || DEFAULT_DENOMINATIONS);
    setFuelExpense(slip.fuelExpense || 0);
    setVehicleExpense(slip.vehicleExpense || 0);
    setPersonalExpense(slip.personalExpense || 0);
    setOtherExpense(slip.otherExpense || 0);
    setItemizedExpenses(slip.expenseDetails || []);
    setFormNotes(slip.notes || '');
    setFormReceivedBy(slip.receivedBy || '');
    setSystemCashData({
      expectedCash: slip.expectedSalesCash || 0,
      creditAmount: slip.creditSales || 0,
      deliveredAmount: slip.totalDeliveredSales || 0,
      invoicesCount: slip.totalInvoicesCount || 0
    });
    setIsFormOpen(true);
  };

  // Save Cash Slip
  const handleSaveSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSalesman.trim()) {
      alert('Please select or enter the Salesman / Order Booker name.');
      return;
    }

    const slipNumber = editingSlipId 
      ? (slips.find(s => s.id === editingSlipId)?.slipNumber || `CS-${formDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`)
      : `CS-${formDate.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const newRecord: CashSlipRecord = {
      id: editingSlipId || `CS-${Date.now()}`,
      slipNumber,
      date: formDate,
      salesmanName: formSalesman,
      route: formRoute,
      vehicleType: formVehicleType,
      vehicleNumber: formVehicleNumber,
      denominations,
      totalPhysicalCash: physicalCashTotal,
      fuelExpense,
      vehicleExpense,
      personalExpense,
      otherExpense,
      expenseDetails: itemizedExpenses,
      totalExpenses,
      totalAccountedCash,
      expectedSalesCash: systemCashData.expectedCash,
      creditSales: systemCashData.creditAmount,
      totalDeliveredSales: systemCashData.deliveredAmount,
      totalInvoicesCount: systemCashData.invoicesCount,
      difference,
      matchStatus,
      notes: formNotes,
      submittedBy: `${formSalesman} (Salesman)`,
      receivedBy: formReceivedBy || 'Cashier / Manager',
      verifiedBy: 'Management Audit',
      status: matchStatus === 'EXACT_MATCH' ? 'VERIFIED' : 'APPROVED',
      createdAt: editingSlipId ? (slips.find(s => s.id === editingSlipId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveCashSlip(newRecord);
    setIsFormOpen(false);
    setEditingSlipId(null);
    loadData();
  };

  // Delete Slip
  const confirmDeleteSlip = async () => {
    if (slipToDelete) {
      await deleteCashSlip(slipToDelete);
      setSlipToDelete(null);
      loadData();
      if (viewingSlip?.id === slipToDelete) {
        setViewingSlip(null);
      }
    }
  };

  // PDF Export / WhatsApp Share for Slip
  const handleShareSlipPDF = async (slip: CashSlipRecord) => {
    if (!printVoucherRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(printVoucherRef.current, { 
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], `Cash_Slip_${slip.slipNumber}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Cash Slip ${slip.slipNumber}`,
          text: `WARSA Pure Water - Daily Cash Slip for ${slip.salesmanName} on ${slip.date}. Net Cash: Rs. ${slip.totalPhysicalCash.toLocaleString()}. Difference: Rs. ${slip.difference}.`
        });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        const waText = encodeURIComponent(
          `*WARSA Pure Water - Cash Slip*\n` +
          `*Slip #:* ${slip.slipNumber}\n` +
          `*Date:* ${slip.date}\n` +
          `*Salesman:* ${slip.salesmanName} (${slip.route})\n` +
          `*Expected Daily Sales Cash:* Rs. ${slip.expectedSalesCash.toLocaleString()}\n` +
          `*Physical Notes Handed:* Rs. ${slip.totalPhysicalCash.toLocaleString()}\n` +
          `*Expenses Deducted:* Rs. ${slip.totalExpenses.toLocaleString()} (Fuel: ${slip.fuelExpense}, Bike/Rickshaw: ${slip.vehicleExpense}, Food/Personal: ${slip.personalExpense})\n` +
          `*Total Accounted:* Rs. ${slip.totalAccountedCash.toLocaleString()}\n` +
          `*Difference:* ${slip.difference === 0 ? 'Exact Match (0 Difference)' : (slip.difference < 0 ? `Shortage: Rs. ${Math.abs(slip.difference)}` : `Excess: Rs. ${slip.difference}`)}\n` +
          `*Received By:* ${slip.receivedBy}`
        );
        window.open(`https://wa.me/?text=${waText}`, '_blank');
      }
    } catch (error) {
      console.error('Error sharing slip:', error);
      alert('Could not export PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  // Image Export (PNG) for Slip
  const handleDownloadSlipImage = async (slip: CashSlipRecord) => {
    if (!printVoucherRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(printVoucherRef.current, { 
        scale: 2,
        backgroundColor: '#ffffff' 
      });
      const imgData = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imgData;
      a.download = `Cash_Slip_${slip.slipNumber}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading slip image:', error);
      alert('Could not download slip picture.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrintSlip = () => {
    window.print();
  };

  // Filtered Cash Slips List
  const filteredSlips = slips.filter(slip => {
    if (filterDate && slip.date !== filterDate) return false;
    if (filterSalesman !== 'ALL' && slip.salesmanName.toLowerCase() !== filterSalesman.toLowerCase()) return false;
    if (filterRoute !== 'ALL' && !slip.route.toLowerCase().includes(filterRoute.toLowerCase())) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNumber = slip.slipNumber.toLowerCase().includes(q);
      const matchSalesman = slip.salesmanName.toLowerCase().includes(q);
      const matchRoute = slip.route.toLowerCase().includes(q);
      const matchNotes = (slip.notes || '').toLowerCase().includes(q);
      if (!matchNumber && !matchSalesman && !matchRoute && !matchNotes) return false;
    }
    return true;
  });

  // Calculate summary stats for filtered list
  const totalPhysicalCashCollected = filteredSlips.reduce((sum, s) => sum + s.totalPhysicalCash, 0);
  const totalExpensesLogged = filteredSlips.reduce((sum, s) => sum + s.totalExpenses, 0);
  const totalExpectedSales = filteredSlips.reduce((sum, s) => sum + s.expectedSalesCash, 0);
  const totalShortages = filteredSlips.reduce((sum, s) => sum + (s.difference < 0 ? Math.abs(s.difference) : 0), 0);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Banknote className="h-7 w-7 text-red-600" />
              <span>Cash Slip Book</span>
            </h1>
            <Badge className="bg-red-50 text-red-700 border-red-200 text-xs font-bold">
              Notes & Expenses Settlement
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Salesman daily cash recovery, note denominations count, route expense deductions (fuel, maintenance, food), and exact reconciliation with the Daily Sales Report.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => handleOpenDailyReport(filterDate)}
            className="border-gray-300 hover:bg-gray-100 text-gray-800 font-bold h-11 px-4 rounded-xl shadow-xs gap-2 text-sm"
          >
            <ExternalLink className="h-4 w-4 text-blue-600" />
            <span>Daily Sales Report</span>
          </Button>

          {!canEdit ? (
            <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-bold px-3 py-2 flex items-center gap-1.5 shadow-sm">
              <ShieldAlert className="h-4 w-4 text-amber-600" /> Read-Only (ASM Restricted)
            </Badge>
          ) : (
            <Button 
              onClick={() => handleOpenNew()}
              className="bg-red-600 hover:bg-red-700 text-white font-bold h-11 px-5 rounded-xl shadow-xs gap-2 flex-1 sm:flex-none text-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Create New Cash Slip</span>
            </Button>
          )}
        </div>
      </div>

      {/* ASM Read-Only Banner */}
      {!canEdit && (
        <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-xl flex items-center justify-between gap-3 text-amber-950 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Area Sales Manager (ASM) Read-Only Inspection:</strong> You can inspect all cash recovery slips, denomination tallies, route expenses, and settlement differences. Creating, editing, and deleting cash slips are restricted.
            </span>
          </div>
          <Badge className="bg-amber-200 text-amber-950 font-bold hover:bg-amber-200 border-none shrink-0">
            Read-Only
          </Badge>
        </div>
      )}

      {/* Daily Sales Report Live Matching Bar */}
      <div className="bg-gradient-to-r from-red-50 via-white to-amber-50 rounded-2xl border border-red-200 p-4 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-600 text-white rounded-xl shadow-xs shrink-0">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Closing Balance Match Status:</span>
              <Badge className="bg-red-600 text-white text-xs font-bold">
                {filterDate ? format(new Date(filterDate), 'dd MMMM yyyy') : 'All Recorded Dates'}
              </Badge>
              {totalShortages === 0 ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs font-bold gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>100% Balanced Closing</span>
                </Badge>
              ) : (
                <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-xs font-bold gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Discrepancy: - PKR {totalShortages.toLocaleString()}</span>
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Every cash slip accounts for physical notes + route deductions (petrol, rickshaw repair, food) and is checked against daily sales invoices.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenDailyReport(filterDate)}
            className="bg-white border-gray-300 hover:bg-gray-50 text-gray-800 text-xs font-bold h-9 gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5 text-blue-600" />
            <span>Open Daily Sales Report</span>
          </Button>
          <Button
            size="sm"
            onClick={() => handleOpenNew(filterDate)}
            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold h-9 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Match Slip for Date</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="border-gray-200/80 shadow-xs bg-gradient-to-br from-white to-gray-50/50">
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Cash Slips</span>
              <Receipt className="h-4 w-4 text-gray-400" />
            </div>
            <p className="text-2xl font-black text-gray-900">{filteredSlips.length}</p>
            <p className="text-[11px] text-gray-400">Total settlement slips logged</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 shadow-xs bg-gradient-to-br from-emerald-50/40 to-white">
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Physical Cash Notes</span>
              <Banknote className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-emerald-700">PKR {totalPhysicalCashCollected.toLocaleString()}</p>
            <p className="text-[11px] text-emerald-600/80 font-medium">Net currency notes submitted</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 shadow-xs bg-gradient-to-br from-amber-50/40 to-white">
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Route Expenses</span>
              <Fuel className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-2xl font-black text-amber-700">PKR {totalExpensesLogged.toLocaleString()}</p>
            <p className="text-[11px] text-amber-600/80 font-medium">Fuel, repair & personal deductions</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 shadow-xs bg-gradient-to-br from-rose-50/40 to-white">
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Total Shortage</span>
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="text-2xl font-black text-rose-700">PKR {totalShortages.toLocaleString()}</p>
            <p className="text-[11px] text-rose-600/80 font-medium">Total sales cash discrepancy</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="border-gray-200/80 shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search slip #, salesman, route..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="h-9 text-xs"
              />
              {filterDate && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setFilterDate('')}
                  className="h-9 px-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Salesman Filter */}
            <select
              value={filterSalesman}
              onChange={(e) => setFilterSalesman(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="ALL">-- All Salesmen / Bookers --</option>
              {orderBookers.map(ob => (
                <option key={ob.ID} value={ob.Name}>{ob.Name}</option>
              ))}
            </select>

            {/* Route Filter */}
            <select
              value={filterRoute}
              onChange={(e) => setFilterRoute(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="ALL">-- All Delivery Routes --</option>
              {routes.map(r => (
                <option key={r.ID} value={r.Name}>{r.Name}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Cash Slips Table / List */}
      <Card className="border-gray-200/80 shadow-xs overflow-hidden">
        <CardHeader className="p-4 sm:p-5 border-b border-gray-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg font-bold text-gray-900">
              Cash Slip Register ({filteredSlips.length})
            </CardTitle>
            <p className="text-xs text-gray-500">
              Click any slip to view, print official voucher, or verify difference with Daily Sales Report
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading Cash Slip Book...</div>
          ) : filteredSlips.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Banknote className="h-12 w-12 text-gray-300 mx-auto" />
              <h3 className="text-sm font-bold text-gray-700">No Cash Slips Found</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                No cash settlement slips have been created matching your filter. Click the button above to create a new daily cash slip!
              </p>
              {canEdit && (
                <Button onClick={handleOpenNew} size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs">
                  + Create First Cash Slip
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/80 text-gray-600 uppercase text-[11px] font-semibold border-b border-gray-200/60">
                  <tr>
                    <th className="px-4 py-3.5">Slip # / Date</th>
                    <th className="px-4 py-3.5">Salesman & Route</th>
                    <th className="px-4 py-3.5 text-right">Physical Cash Notes</th>
                    <th className="px-4 py-3.5 text-right">Route Expenses</th>
                    <th className="px-4 py-3.5 text-right">Total Accounted</th>
                    <th className="px-4 py-3.5 text-right">Expected Sales Cash</th>
                    <th className="px-4 py-3.5 text-center">Reconciliation Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSlips.map((slip) => {
                    const isExact = slip.matchStatus === 'EXACT_MATCH';
                    const isShortage = slip.matchStatus === 'SHORTAGE';

                    return (
                      <tr 
                        key={slip.id} 
                        onClick={() => setViewingSlip(slip)}
                        className="hover:bg-red-50/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3.5">
                          <span className="font-bold text-red-600 block">{slip.slipNumber}</span>
                          <span className="text-gray-500 text-[11px]">{format(new Date(slip.date), 'dd MMM yyyy')}</span>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="font-bold text-gray-900 block">{slip.salesmanName}</span>
                          <span className="text-gray-500 text-[11px] flex items-center gap-1">
                            <Truck className="h-3 w-3 text-gray-400" />
                            {slip.route} {slip.vehicleType ? `(${slip.vehicleType})` : ''}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right font-black text-gray-900">
                          PKR {slip.totalPhysicalCash.toLocaleString()}
                          <span className="block text-[10px] text-gray-400 font-normal">
                            5K: {slip.denominations.note5000} | 1K: {slip.denominations.note1000} | 500: {slip.denominations.note500}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right font-bold text-amber-700">
                          PKR {slip.totalExpenses.toLocaleString()}
                          <span className="block text-[10px] text-gray-400 font-normal">
                            Fuel: {slip.fuelExpense} | Rep: {slip.vehicleExpense}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right font-black text-gray-900">
                          PKR {slip.totalAccountedCash.toLocaleString()}
                        </td>

                        <td className="px-4 py-3.5 text-right font-bold text-gray-600">
                          PKR {slip.expectedSalesCash.toLocaleString()}
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          {isExact ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-bold text-[10px] gap-1 px-2.5 py-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              <span>Exact Match (PKR 0)</span>
                            </Badge>
                          ) : isShortage ? (
                            <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 font-bold text-[10px] gap-1 px-2.5 py-1">
                              <AlertTriangle className="h-3 w-3 text-rose-600" />
                              <span>Shortage: PKR {Math.abs(slip.difference).toLocaleString()}</span>
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 font-bold text-[10px] gap-1 px-2.5 py-1">
                              <CheckCircle2 className="h-3 w-3 text-blue-600" />
                              <span>Excess: +PKR {slip.difference.toLocaleString()}</span>
                            </Badge>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDailyReport(slip.date)}
                            className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-700"
                            title="Open in Daily Sales Report"
                          >
                            <FileText className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingSlip(slip)}
                            className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                            title="View Slip Voucher"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditSlip(slip)}
                                className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600"
                                title="Edit Cash Slip"
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSlipToDelete(slip.id)}
                                className="h-8 w-8 p-0 text-gray-500 hover:text-rose-600"
                                title="Delete Cash Slip"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: CREATE / EDIT CASH SLIP FORM                           */}
      {/* ------------------------------------------------------------- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-red-600 to-red-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <Banknote className="h-6 w-6" />
                <div>
                  <h3 className="text-base sm:text-lg font-black leading-tight">
                    {editingSlipId ? "Edit Cash Settlement Slip" : "Daily Cash Settlement Slip"}
                  </h3>
                  <p className="text-xs text-red-100">
                    Record collected cash notes count, route expenses, and reconcile against the Daily Sales Report.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg bg-red-800/60 hover:bg-red-800 text-white text-xs"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveSlip} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              
              {/* Section 1: Salesman & Route Details */}
              <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/60 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <h4 className="text-xs font-bold text-gray-900 uppercase flex items-center gap-1.5">
                    <User className="h-4 w-4 text-red-600" />
                    1. Salesman & Route Information
                  </h4>
                  <span className="text-[11px] text-gray-500 font-medium">Daily Recovery Duty</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">Date *</label>
                    <Input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="h-9 text-xs bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">Salesman / Booker *</label>
                    <select
                      value={formSalesman}
                      onChange={(e) => {
                        const name = e.target.value;
                        setFormSalesman(name);
                        const ob = orderBookers.find(o => o.Name === name);
                        if (ob && ob.AssignedRoutes && ob.AssignedRoutes.length > 0) {
                          setFormRoute(ob.AssignedRoutes[0]);
                        }
                      }}
                      className="h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold"
                      required
                    >
                      <option value="">-- Choose Salesman --</option>
                      {orderBookers.map(ob => (
                        <option key={ob.ID} value={ob.Name}>{ob.Name} ({ob.Phone || 'OB'})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">Route *</label>
                    <select
                      value={formRoute}
                      onChange={(e) => setFormRoute(e.target.value)}
                      className="h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                      required
                    >
                      <option value="">-- Choose Route --</option>
                      {routes.map(r => (
                        <option key={r.ID} value={r.Name}>{r.Name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">Vehicle</label>
                    <div className="flex gap-1.5">
                      <select
                        value={formVehicleType}
                        onChange={(e: any) => setFormVehicleType(e.target.value)}
                        className="h-9 w-1/2 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                      >
                        <option value="Rickshaw">Rickshaw</option>
                        <option value="Bike">Bike</option>
                        <option value="Suzuki">Suzuki</option>
                        <option value="Van">Van / Shahzore</option>
                        <option value="Other">Other</option>
                      </select>
                      <Input
                        placeholder="Reg No. (e.g. LE-1234)"
                        value={formVehicleNumber}
                        onChange={(e) => setFormVehicleNumber(e.target.value)}
                        className="h-9 text-xs w-1/2 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Match Mode Selection */}
                <div className="pt-2 border-t border-gray-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-gray-700">Reconcile Closing Balance Against:</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-gray-200 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setMatchScope('ALL_DAY')}
                      className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-md transition-all",
                        matchScope === 'ALL_DAY'
                          ? "bg-red-600 text-white shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      )}
                    >
                      Full Day (All Daily Sales Invoices)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatchScope('BY_SALESMAN')}
                      className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-md transition-all",
                        matchScope === 'BY_SALESMAN'
                          ? "bg-red-600 text-white shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      )}
                    >
                      Selected Salesman Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatchScope('BY_ROUTE')}
                      className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-md transition-all",
                        matchScope === 'BY_ROUTE'
                          ? "bg-red-600 text-white shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      )}
                    >
                      Selected Route Only
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 2: Currency Denominations Counter */}
              <div className="p-4 rounded-xl border border-red-200 bg-red-50/20 space-y-3">
                <div className="flex items-center justify-between border-b border-red-200 pb-2">
                  <h4 className="text-xs font-bold text-gray-900 uppercase flex items-center gap-1.5">
                    <Banknote className="h-4 w-4 text-red-600" />
                    2. Currency Notes Breakdown & Count
                  </h4>
                  <span className="text-xs font-black text-red-600">
                    Total Notes: PKR {physicalCashTotal.toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  
                  {/* Rs. 5000 */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded">Rs. 5,000</span>
                      <span className="text-xs font-bold text-gray-600">
                        = PKR {((denominations.note5000 || 0) * 5000).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={denominations.note5000 || ''}
                        onChange={(e) => handleDenomChange('note5000', e.target.value)}
                        className="h-9 text-xs font-bold"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDenomIncrement('note5000', 1)} className="h-9 px-2 text-xs font-bold shrink-0">
                        +1
                      </Button>
                    </div>
                  </div>

                  {/* Rs. 1000 */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-blue-900 bg-blue-100 px-2 py-0.5 rounded">Rs. 1,000</span>
                      <span className="text-xs font-bold text-gray-600">
                        = PKR {((denominations.note1000 || 0) * 1000).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={denominations.note1000 || ''}
                        onChange={(e) => handleDenomChange('note1000', e.target.value)}
                        className="h-9 text-xs font-bold"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDenomIncrement('note1000', 1)} className="h-9 px-2 text-xs font-bold shrink-0">
                        +1
                      </Button>
                    </div>
                  </div>

                  {/* Rs. 500 */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded">Rs. 500</span>
                      <span className="text-xs font-bold text-gray-600">
                        = PKR {((denominations.note500 || 0) * 500).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={denominations.note500 || ''}
                        onChange={(e) => handleDenomChange('note500', e.target.value)}
                        className="h-9 text-xs font-bold"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDenomIncrement('note500', 1)} className="h-9 px-2 text-xs font-bold shrink-0">
                        +1
                      </Button>
                    </div>
                  </div>

                  {/* Rs. 100 */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-purple-900 bg-purple-100 px-2 py-0.5 rounded">Rs. 100</span>
                      <span className="text-xs font-bold text-gray-600">
                        = PKR {((denominations.note100 || 0) * 100).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={denominations.note100 || ''}
                        onChange={(e) => handleDenomChange('note100', e.target.value)}
                        className="h-9 text-xs font-bold"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDenomIncrement('note100', 1)} className="h-9 px-2 text-xs font-bold shrink-0">
                        +1
                      </Button>
                    </div>
                  </div>

                  {/* Rs. 50 */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-teal-900 bg-teal-100 px-2 py-0.5 rounded">Rs. 50</span>
                      <span className="text-xs font-bold text-gray-600">
                        = PKR {((denominations.note50 || 0) * 50).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={denominations.note50 || ''}
                        onChange={(e) => handleDenomChange('note50', e.target.value)}
                        className="h-9 text-xs font-bold"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDenomIncrement('note50', 5)} className="h-9 px-2 text-xs font-bold shrink-0">
                        +5
                      </Button>
                    </div>
                  </div>

                  {/* Rs. 20 */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded">Rs. 20</span>
                      <span className="text-xs font-bold text-gray-600">
                        = PKR {((denominations.note20 || 0) * 20).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={denominations.note20 || ''}
                        onChange={(e) => handleDenomChange('note20', e.target.value)}
                        className="h-9 text-xs font-bold"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDenomIncrement('note20', 5)} className="h-9 px-2 text-xs font-bold shrink-0">
                        +5
                      </Button>
                    </div>
                  </div>

                  {/* Rs. 10 */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-gray-800 bg-gray-100 px-2 py-0.5 rounded">Rs. 10</span>
                      <span className="text-xs font-bold text-gray-600">
                        = PKR {((denominations.note10 || 0) * 10).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={denominations.note10 || ''}
                        onChange={(e) => handleDenomChange('note10', e.target.value)}
                        className="h-9 text-xs font-bold"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDenomIncrement('note10', 5)} className="h-9 px-2 text-xs font-bold shrink-0">
                        +5
                      </Button>
                    </div>
                  </div>

                  {/* Coins */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-rose-800 bg-rose-50 px-2 py-0.5 rounded">Coins & Small Change</span>
                      <span className="text-xs font-bold text-gray-600">
                        = PKR {(denominations.coins || 0).toLocaleString()}
                      </span>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Coin Amount"
                      value={denominations.coins || ''}
                      onChange={(e) => handleDenomChange('coins', e.target.value)}
                      className="h-9 text-xs font-bold"
                    />
                  </div>

                </div>
              </div>

              {/* Section 3: Route Expenses Deducted */}
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/20 space-y-3">
                <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                  <h4 className="text-xs font-bold text-gray-900 uppercase flex items-center gap-1.5">
                    <Fuel className="h-4 w-4 text-amber-600" />
                    3. Route Expenses Deducted from Cash
                  </h4>
                  <span className="text-xs font-black text-amber-800">
                    Total Expenses: PKR {totalExpenses.toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                  
                  {/* Fuel Expense */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                      <Fuel className="h-3.5 w-3.5 text-amber-600" />
                      <span>Fuel / Petrol</span>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Rs. 0"
                      value={fuelExpense || ''}
                      onChange={(e) => setFuelExpense(parseFloat(e.target.value) || 0)}
                      className="h-9 text-xs font-bold text-amber-800"
                    />
                    <span className="text-[10px] text-gray-400 block">Rickshaw/Bike petrol</span>
                  </div>

                  {/* Vehicle Repair / Maintenance */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                      <Wrench className="h-3.5 w-3.5 text-blue-600" />
                      <span>Vehicle Maintenance</span>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Rs. 0"
                      value={vehicleExpense || ''}
                      onChange={(e) => setVehicleExpense(parseFloat(e.target.value) || 0)}
                      className="h-9 text-xs font-bold text-blue-800"
                    />
                    <span className="text-[10px] text-gray-400 block">Puncture, oil, repair</span>
                  </div>

                  {/* Personal / Food / Tea */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                      <Coffee className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Personal Use / Food</span>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Rs. 0"
                      value={personalExpense || ''}
                      onChange={(e) => setPersonalExpense(parseFloat(e.target.value) || 0)}
                      className="h-9 text-xs font-bold text-emerald-800"
                    />
                    <span className="text-[10px] text-gray-400 block">Staff lunch, tea, personal</span>
                  </div>

                  {/* Other Expense */}
                  <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                      <Receipt className="h-3.5 w-3.5 text-purple-600" />
                      <span>Other Route Expenses</span>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Rs. 0"
                      value={otherExpense || ''}
                      onChange={(e) => setOtherExpense(parseFloat(e.target.value) || 0)}
                      className="h-9 text-xs font-bold text-purple-800"
                    />
                    <span className="text-[10px] text-gray-400 block">Toll tax, labor, misc</span>
                  </div>

                </div>
              </div>

              {/* Section 4: Real-Time Comparison with Daily Sales Report */}
              <div className="p-4 sm:p-5 rounded-2xl border-2 border-slate-300 bg-white shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-red-600" />
                    <div>
                      <h4 className="text-sm font-black text-gray-900 uppercase">
                        4. Daily Sales Report Verification & Reconciliation
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        Comparing Salesman's Cash Slip (Physical Notes + Expenses) with System Expected Sales Collection
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs font-bold">
                    {systemCashData.invoicesCount} Invoices Matched
                  </Badge>
                </div>

                {/* Side-by-Side Comparison Box */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  
                  {/* System Expected */}
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                    <span className="text-[11px] font-bold text-gray-500 uppercase">Daily Sales Report Expected Cash</span>
                    <p className="text-xl font-black text-gray-900">
                      PKR {systemCashData.expectedCash.toLocaleString()}
                    </p>
                    <div className="text-[10px] text-gray-400 space-y-0.5 pt-1 border-t border-gray-200">
                      <div>Delivered Sales: PKR {systemCashData.deliveredAmount.toLocaleString()}</div>
                      <div>Customer Credit: PKR {systemCashData.creditAmount.toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Salesman Cash Accounted */}
                  <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 space-y-1">
                    <span className="text-[11px] font-bold text-blue-800 uppercase">Salesman Accounted Total</span>
                    <p className="text-xl font-black text-blue-900">
                      PKR {totalAccountedCash.toLocaleString()}
                    </p>
                    <div className="text-[10px] text-blue-700/80 space-y-0.5 pt-1 border-t border-blue-200">
                      <div>Physical Notes Handed: PKR {physicalCashTotal.toLocaleString()}</div>
                      <div>Route Expenses Deducted: PKR {totalExpenses.toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Difference Engine */}
                  <div className={cn(
                    "p-3.5 rounded-xl border-2 space-y-1 flex flex-col justify-center",
                    matchStatus === 'EXACT_MATCH' 
                      ? "bg-emerald-50 border-emerald-400 text-emerald-900"
                      : matchStatus === 'SHORTAGE'
                        ? "bg-rose-50 border-rose-400 text-rose-900"
                        : "bg-blue-50 border-blue-400 text-blue-900"
                  )}>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold uppercase">Difference</span>
                      {matchStatus === 'EXACT_MATCH' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {matchStatus === 'SHORTAGE' && <AlertTriangle className="h-4 w-4 text-rose-600" />}
                      {matchStatus === 'EXCESS' && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                    </div>

                    <p className="text-2xl font-black">
                      {matchStatus === 'EXACT_MATCH' 
                        ? "PKR 0 (Exact Match)" 
                        : (matchStatus === 'SHORTAGE' ? `- PKR ${Math.abs(difference).toLocaleString()}` : `+ PKR ${difference.toLocaleString()}`)
                      }
                    </p>

                    <p className="text-[11px] font-bold">
                      {matchStatus === 'EXACT_MATCH' && "✅ Cash matches daily sales collection exactly. No discrepancy."}
                      {matchStatus === 'SHORTAGE' && `⚠️ Cash Shortage: Salesman has a pending shortage of PKR ${Math.abs(difference).toLocaleString()}`}
                      {matchStatus === 'EXCESS' && `ℹ️ Cash Surplus: An excess of PKR ${difference.toLocaleString()} was collected`}
                    </p>
                  </div>

                </div>

                {/* Actions & Matched Invoices Quick Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleQuickMatchDenominations}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8 gap-1.5 shadow-xs"
                      title="Auto-fill currency notes so physical cash + expenses equals expected cash"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>⚡ Auto-Tally Notes to Match Expected Cash</span>
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowInvoicesList(!showInvoicesList)}
                      className="bg-white border-gray-300 hover:bg-gray-100 text-gray-800 font-bold text-xs h-8 gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                      <span>{showInvoicesList ? 'Hide Matched Invoices' : `View ${matchedSalesList.length} Matched Invoices`}</span>
                      {showInvoicesList ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDailyReport(formDate)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold h-8 gap-1"
                    >
                      <span>Open Daily Sales Report</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Collapsible Matched Invoices Table from Daily Sales Report */}
                {showInvoicesList && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                    <div className="bg-gray-100/80 px-3 py-2 border-b border-gray-200 flex justify-between items-center text-xs font-bold text-gray-700">
                      <span>Daily Sales Invoices Reconciled ({matchedSalesList.length} Invoices on {formDate})</span>
                      <span className="text-[11px] text-gray-500">Formula: Net Cash = Actual Bill - Customer Credit</span>
                    </div>
                    {matchedSalesList.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-400">
                        No delivered invoices found for {formDate} matching current scope.
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-gray-50 text-[11px] font-bold text-gray-600 uppercase border-b border-gray-200 sticky top-0">
                            <tr>
                              <th className="p-2">Invoice #</th>
                              <th className="p-2">Outlet</th>
                              <th className="p-2">Booker / Route</th>
                              <th className="p-2 text-right">Delivered Cases</th>
                              <th className="p-2 text-right">Bill Amount</th>
                              <th className="p-2 text-right">Credit (Udhaar)</th>
                              <th className="p-2 text-right text-emerald-700">Net Expected Cash</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {matchedSalesList.map((sale) => {
                              const bill = sale.ActualGrandTotal || sale.GrandTotal || 0;
                              const credit = sale.CreditAmount || 0;
                              const netCash = Math.max(0, bill - credit);
                              return (
                                <tr key={sale.ID} className="hover:bg-gray-50/80">
                                  <td className="p-2 font-mono font-bold text-gray-900">{sale.ID}</td>
                                  <td className="p-2">
                                    <div className="font-bold text-gray-800">{sale.OutletName}</div>
                                    <div className="text-[10px] text-gray-400">{sale.OutletCode}</div>
                                  </td>
                                  <td className="p-2 text-[11px] text-gray-600">
                                    <div>{sale.OrderBookerName || '—'}</div>
                                    <div className="text-[10px] text-gray-400">{sale.Route || '—'}</div>
                                  </td>
                                  <td className="p-2 text-right font-medium">{sale.ActualDeliveredQty || sale.DeliveredQty || 0}</td>
                                  <td className="p-2 text-right font-medium">PKR {bill.toLocaleString()}</td>
                                  <td className="p-2 text-right font-medium text-amber-700">PKR {credit.toLocaleString()}</td>
                                  <td className="p-2 text-right font-bold text-emerald-700">PKR {netCash.toLocaleString()}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                      Received / Handed Over To (Cashier / Manager)
                    </label>
                    <Input
                      value={formReceivedBy}
                      onChange={(e) => setFormReceivedBy(e.target.value)}
                      placeholder="e.g. Muhammad Tariq (Manager / Cashier)"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                      Special Notes / Remarks
                    </label>
                    <Input
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="e.g. All currency checked. Fuel slip attached."
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex justify-end items-center gap-3 pt-4 border-t border-gray-200 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsFormOpen(false)}
                  className="text-xs font-semibold h-10 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-10 px-6 gap-2 shadow-xs"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{editingSlipId ? "Update Cash Slip" : "Save & Record Cash Slip"}</span>
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: VIEW & PRINT OFFICIAL CASH SLIP VOUCHER                */}
      {/* ------------------------------------------------------------- */}
      {viewingSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
            
            {/* Action Bar - Clean Light Red & White Theme */}
            <div className="p-4 bg-white border-b border-red-100 text-slate-900 flex justify-between items-center shrink-0 print:hidden shadow-2xs">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-red-600" />
                <span className="font-bold text-sm text-slate-900">Official Cash Settlement Voucher ({viewingSlip.slipNumber})</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadSlipImage(viewingSlip)}
                  disabled={isExporting}
                  className="bg-white border-red-200 text-slate-700 hover:bg-red-50 hover:text-red-700 text-xs h-8 gap-1.5 shadow-2xs"
                >
                  <Download className="h-3.5 w-3.5 text-red-600" />
                  <span>Save Picture (PNG)</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleShareSlipPDF(viewingSlip)}
                  disabled={isExporting}
                  className="bg-white border-red-200 text-slate-700 hover:bg-red-50 hover:text-red-700 text-xs h-8 gap-1.5 shadow-2xs"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-red-600" />
                  <span>WhatsApp PDF</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handlePrintSlip}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs h-8 gap-1.5 shadow-xs font-bold"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Slip</span>
                </Button>
                <button
                  onClick={() => setViewingSlip(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Printable Voucher Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={printVoucherRef}>
              
              {/* Slip Header */}
              <div className="text-center border-b-2 border-red-600 pb-4">
                <div className="flex justify-center items-center gap-2">
                  <img src="/warsa-logo.png" alt="Warsa" className="h-9 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">KFM BEVERAGES (WARSA)</h2>
                </div>
                <p className="text-xs text-slate-600 font-bold">40-1 Saddar Bazar Lahore | Phone: 0336-4574227</p>
                <div className="inline-block mt-2 px-4 py-1 bg-red-600 text-white font-black text-xs uppercase tracking-widest rounded-full shadow-xs">
                  DAILY CASH SETTLEMENT SLIP
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 text-xs border border-black p-3 bg-gray-50 gap-2 font-medium">
                <div>
                  <span className="font-bold text-gray-600">Slip No:</span> <strong className="text-red-700">{viewingSlip.slipNumber}</strong>
                </div>
                <div className="text-right">
                  <span className="font-bold text-gray-600">Date:</span> <strong>{format(new Date(viewingSlip.date), 'dd MMMM yyyy')}</strong>
                </div>
                <div>
                  <span className="font-bold text-gray-600">Salesman:</span> <strong className="text-black">{viewingSlip.salesmanName}</strong>
                </div>
                <div className="text-right">
                  <span className="font-bold text-gray-600">Route:</span> <strong>{viewingSlip.route}</strong>
                </div>
                <div>
                  <span className="font-bold text-gray-600">Vehicle:</span> <strong>{viewingSlip.vehicleType || 'Rickshaw'} {viewingSlip.vehicleNumber ? `(${viewingSlip.vehicleNumber})` : ''}</strong>
                </div>
                <div className="text-right">
                  <span className="font-bold text-gray-600">Received By:</span> <strong>{viewingSlip.receivedBy || 'Cashier'}</strong>
                </div>
              </div>

              {/* Currency Denominations Table */}
              <div className="space-y-1">
                <h4 className="text-xs font-black uppercase text-black border-b border-black pb-1">
                  1. Currency Denomination Breakdown
                </h4>
                <table className="w-full text-xs border-collapse border border-black">
                  <thead className="bg-gray-100 font-bold">
                    <tr>
                      <th className="border border-black p-1.5 text-center">Note Value</th>
                      <th className="border border-black p-1.5 text-center">Quantity</th>
                      <th className="border border-black p-1.5 text-right">Total Amount (PKR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-black p-1 font-bold text-center">Rs. 5,000</td>
                      <td className="border border-black p-1 text-center font-bold">{viewingSlip.denominations.note5000 || 0}</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {((viewingSlip.denominations.note5000 || 0) * 5000).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1 font-bold text-center">Rs. 1,000</td>
                      <td className="border border-black p-1 text-center font-bold">{viewingSlip.denominations.note1000 || 0}</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {((viewingSlip.denominations.note1000 || 0) * 1000).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1 font-bold text-center">Rs. 500</td>
                      <td className="border border-black p-1 text-center font-bold">{viewingSlip.denominations.note500 || 0}</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {((viewingSlip.denominations.note500 || 0) * 500).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1 font-bold text-center">Rs. 100</td>
                      <td className="border border-black p-1 text-center font-bold">{viewingSlip.denominations.note100 || 0}</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {((viewingSlip.denominations.note100 || 0) * 100).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1 font-bold text-center">Rs. 50</td>
                      <td className="border border-black p-1 text-center font-bold">{viewingSlip.denominations.note50 || 0}</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {((viewingSlip.denominations.note50 || 0) * 50).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1 font-bold text-center">Rs. 20</td>
                      <td className="border border-black p-1 text-center font-bold">{viewingSlip.denominations.note20 || 0}</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {((viewingSlip.denominations.note20 || 0) * 20).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1 font-bold text-center">Rs. 10</td>
                      <td className="border border-black p-1 text-center font-bold">{viewingSlip.denominations.note10 || 0}</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {((viewingSlip.denominations.note10 || 0) * 10).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1 font-bold text-center">Coins & Small Change</td>
                      <td className="border border-black p-1 text-center font-bold">-</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {(viewingSlip.denominations.coins || 0).toLocaleString()}</td>
                    </tr>
                    <tr className="bg-gray-100 font-black">
                      <td colSpan={2} className="border border-black p-1.5 text-left uppercase">
                        Total Physical Cash Handed Over
                      </td>
                      <td className="border border-black p-1.5 text-right text-sm">
                        PKR {viewingSlip.totalPhysicalCash.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Route Expenses Table */}
              <div className="space-y-1">
                <h4 className="text-xs font-black uppercase text-black border-b border-black pb-1">
                  2. Route Expenses Deducted
                </h4>
                <table className="w-full text-xs border-collapse border border-black">
                  <thead className="bg-gray-100 font-bold">
                    <tr>
                      <th className="border border-black p-1.5 text-left">Expense Category</th>
                      <th className="border border-black p-1.5 text-right">Amount (PKR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-black p-1">Fuel / Petrol Expense</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {viewingSlip.fuelExpense.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1">Vehicle / Rickshaw Maintenance & Repair</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {viewingSlip.vehicleExpense.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1">Personal Use / Driver Food & Tea</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {viewingSlip.personalExpense.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1">Other Route Expenses (Tolls, Labor, etc.)</td>
                      <td className="border border-black p-1 text-right font-bold">PKR {viewingSlip.otherExpense.toLocaleString()}</td>
                    </tr>
                    <tr className="bg-gray-100 font-black">
                      <td className="border border-black p-1.5 text-left uppercase">Total Expenses Deducted</td>
                      <td className="border border-black p-1.5 text-right text-sm">PKR {viewingSlip.totalExpenses.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Daily Sales Report Match Summary */}
              <div className="space-y-1">
                <h4 className="text-xs font-black uppercase text-black border-b border-black pb-1 flex justify-between items-center">
                  <span>3. Daily Sales Report & Closing Balance Reconciliation</span>
                  <span className="text-[10px] font-bold">Formula: (B + C) - A</span>
                </h4>
                <table className="w-full text-xs border-collapse border border-black">
                  <tbody>
                    <tr>
                      <td className="border border-black p-1.5 font-bold">A. System Expected Sales Cash (Daily Sales Invoices):</td>
                      <td className="border border-black p-1.5 text-right font-bold">PKR {viewingSlip.expectedSalesCash.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1.5 font-bold">B. Net Physical Cash Handed Over:</td>
                      <td className="border border-black p-1.5 text-right font-bold">PKR {viewingSlip.totalPhysicalCash.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1.5 font-bold">C. Route Expenses Deducted:</td>
                      <td className="border border-black p-1.5 text-right font-bold">PKR {viewingSlip.totalExpenses.toLocaleString()}</td>
                    </tr>
                    <tr className="bg-gray-100">
                      <td className="border border-black p-1.5 font-black uppercase">D. Total Accounted by Salesman (B + C):</td>
                      <td className="border border-black p-1.5 text-right font-black">PKR {viewingSlip.totalAccountedCash.toLocaleString()}</td>
                    </tr>
                    <tr className={cn(
                      "font-black text-sm",
                      viewingSlip.difference === 0 ? "bg-emerald-100" : (viewingSlip.difference < 0 ? "bg-rose-100" : "bg-blue-100")
                    )}>
                      <td className="border border-black p-2 font-black uppercase">
                        CLOSING DIFFERENCE (D - A):
                      </td>
                      <td className="border border-black p-2 text-right font-black">
                        {viewingSlip.difference === 0 
                          ? "PKR 0 (EXACT MATCH)" 
                          : (viewingSlip.difference < 0 
                              ? `SHORTAGE: - PKR ${Math.abs(viewingSlip.difference).toLocaleString()}` 
                              : `EXCESS: + PKR ${viewingSlip.difference.toLocaleString()}`
                            )
                        }
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Discrepancy / Missing Cash Box */}
                <div className={cn(
                  "p-2.5 border border-black text-xs font-bold rounded-xs mt-2",
                  viewingSlip.difference === 0 
                    ? "bg-emerald-50 text-emerald-950" 
                    : viewingSlip.difference < 0 
                      ? "bg-rose-50 text-rose-950" 
                      : "bg-blue-50 text-blue-950"
                )}>
                  {viewingSlip.difference === 0 && (
                    <div className="flex items-center gap-1.5">
                      <span>✅</span>
                      <span><strong>100% BALANCED CLOSING:</strong> Accounted physical cash and expenses exactly match expected daily sales invoices. Zero missing cash.</span>
                    </div>
                  )}
                  {viewingSlip.difference < 0 && (
                    <div className="space-y-1">
                      <div className="text-rose-900 font-black uppercase flex items-center gap-1.5 text-xs">
                        <span>⚠️</span>
                        <span>CASH SHORTAGE / MISSING CASH: - PKR {Math.abs(viewingSlip.difference).toLocaleString()}</span>
                      </div>
                      <p className="text-rose-800 font-medium text-[11px] leading-tight">
                        Discrepancy detected between expected sales invoices (PKR {viewingSlip.expectedSalesCash.toLocaleString()}) and salesman cash accounted (PKR {viewingSlip.totalAccountedCash.toLocaleString()}). Salesman / Booker owes PKR {Math.abs(viewingSlip.difference).toLocaleString()} to balance the daily accounts.
                      </p>
                    </div>
                  )}
                  {viewingSlip.difference > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span>ℹ️</span>
                      <span><strong>CASH SURPLUS:</strong> + PKR {viewingSlip.difference.toLocaleString()} excess cash accounted beyond expected sales invoices.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {viewingSlip.notes && (
                <div className="p-2 border border-black text-xs bg-gray-50">
                  <strong>Notes / Remarks:</strong> {viewingSlip.notes}
                </div>
              )}

              {/* Signatures */}
              <div className="pt-8 flex justify-between items-end text-xs font-bold border-t border-black">
                <div className="text-center space-y-3">
                  <div className="border-b border-black w-36"></div>
                  <span>SALESMAN SIGNATURE</span>
                </div>
                <div className="text-center space-y-3">
                  <div className="border-b border-black w-36"></div>
                  <span>CASHIER / RECEIVER</span>
                </div>
                <div className="text-center space-y-3">
                  <div className="border-b border-black w-36"></div>
                  <span>AUDIT & MANAGER</span>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Confirm Delete Cash Slip Dialog */}
      <ConfirmDialog
        isOpen={Boolean(slipToDelete)}
        title="Delete Cash Slip Record"
        description="Are you sure you want to delete this Cash Slip record? This cannot be undone."
        onConfirm={confirmDeleteSlip}
        onCancel={() => setSlipToDelete(null)}
      />

    </div>
  );
}
