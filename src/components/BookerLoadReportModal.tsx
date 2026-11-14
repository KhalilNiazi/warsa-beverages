import React, { useState, useMemo, useRef } from 'react';
import { SaleRecord, Outlet, InventoryItem } from '@/src/types';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { 
  Printer, 
  Download, 
  FileSpreadsheet, 
  Truck, 
  Package, 
  Store, 
  Calendar, 
  User, 
  Route as RouteIcon,
  CheckCircle2,
  Layers,
  Sparkles,
  Gift,
  ArrowUpDown,
  Search,
  Check
} from 'lucide-react';
import { format } from 'date-fns';
import { exportToExcel, exportToCSV } from '@/src/utils/excelHelper';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { cn } from '@/src/lib/utils';

export interface SkuDefinition {
  id: string;
  sku: string;
  name: string;
  shortLabel: string;
  size: string;
  bottlesPerCase: number;
  rate: number;
  rank: number;
  isPromo: boolean;
}

// Order: strictly first 500ml, then 1.5L, then 19L, then 5L, followed by promo and others
export const getSkuRank = (skuOrName: string, isPromo: boolean = false): number => {
  if (isPromo) return 50; // Promo appears right after regular SKUs
  const s = (skuOrName || '').toLowerCase();
  if (s.includes('500') || s.includes('half')) return 10;
  if (s.includes('1.5') || s.includes('1500') || s.includes('1-5')) return 20;
  if (s.includes('19') || s.includes('can') || s.includes('gallon')) return 30; // First 500ml, then 1.5L, then 19L
  if (/\b5\s*l\b|\b5000\s*ml\b/.test(s)) return 40;
  return 45; // Other regular SKUs
};

interface BookerLoadReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: SaleRecord[];
  outlets: Outlet[];
  inventory: InventoryItem[];
  defaultBooker?: string;
  isOrderBookerOnly?: boolean;
}

export function BookerLoadReportModal({
  isOpen,
  onClose,
  sales,
  outlets,
  inventory,
  defaultBooker = '',
  isOrderBookerOnly = false,
}: BookerLoadReportModalProps) {
  const printSheetRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedBooker, setSelectedBooker] = useState<string>(defaultBooker || 'ALL');
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');
  const [outletSearch, setOutletSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'ALL' | 'LOAD_ONLY' | 'OUTLET_ONLY'>('ALL');
  const [isExporting, setIsExporting] = useState(false);

  // Extract unique Order Bookers from sales & outlets
  const uniqueBookers = useMemo(() => {
    const set = new Set<string>();
    sales.forEach(s => {
      if (s.BookedBy) set.add(s.BookedBy);
      if (s.OrderBooker) set.add(s.OrderBooker);
    });
    outlets.forEach(o => {
      if (o.OB) set.add(o.OB);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [sales, outlets]);

  // Extract unique routes
  const uniqueRoutes = useMemo(() => {
    const set = new Set<string>();
    sales.forEach(s => {
      if (s.Route) set.add(s.Route);
    });
    outlets.forEach(o => {
      if (o.Route) set.add(o.Route);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [sales, outlets]);

  // Filter sales based on selected date, booker, route, and search query
  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      // Date filter
      if (selectedDate && sale.Date) {
        const saleDateStr = sale.Date.split('T')[0];
        if (saleDateStr !== selectedDate) return false;
      }

      // Booker filter
      if (selectedBooker && selectedBooker !== 'ALL') {
        const matchesBookedBy = sale.BookedBy && sale.BookedBy.toLowerCase() === selectedBooker.toLowerCase();
        const matchesOB = sale.OrderBooker && sale.OrderBooker.toLowerCase() === selectedBooker.toLowerCase();
        if (!matchesBookedBy && !matchesOB) return false;
      }

      // Route filter
      if (selectedRoute && selectedRoute !== 'ALL') {
        if (!sale.Route || !sale.Route.toLowerCase().includes(selectedRoute.toLowerCase())) {
          return false;
        }
      }

      // Outlet search filter
      if (outletSearch.trim()) {
        const q = outletSearch.trim().toLowerCase();
        const nameMatch = (sale.OutletName || '').toLowerCase().includes(q);
        const codeMatch = (sale.OutletCode || '').toLowerCase().includes(q);
        const srMatch = (sale.OutletSrNo !== undefined ? sale.OutletSrNo.toString() : '').includes(q);
        const invMatch = (sale.ID || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !srMatch && !invMatch) return false;
      }

      return true;
    });
  }, [sales, selectedDate, selectedBooker, selectedRoute, outletSearch]);

  // Check if any sale in the filtered set has promo cases
  const hasPromoInFiltered = useMemo(() => {
    return filteredSales.some(sale => {
      if (sale.HasPromo || (sale.PromoFreeCases && sale.PromoFreeCases > 0)) return true;
      return sale.Items?.some(i => i.IsPromo || (i.Price === 0 && (i.ProductName || '').toLowerCase().includes('promo')));
    });
  }, [filteredSales]);

  // Build sorted SKU definitions strictly ordered: first 500ml, then 1.5L, then 19L, then 5L, then Promo
  const sortedSkus: SkuDefinition[] = useMemo(() => {
    const list: SkuDefinition[] = [];

    // Map known standard SKUs or read from inventory
    const standardDefs = [
      { id: '1', sku: 'WAR-500ML', name: 'WARSA 500ml', shortLabel: '500ml', size: '500ml', bottlesPerCase: 24, rate: 0, rank: 10, isPromo: false },
      { id: '2', sku: 'WAR-1.5L', name: 'WARSA 1.5L', shortLabel: '1.5L', size: '1.5L', bottlesPerCase: 6, rate: 0, rank: 20, isPromo: false },
      { id: '4', sku: 'WAR-19L', name: 'WARSA 19L', shortLabel: '19L', size: '19 Litre Can', bottlesPerCase: 1, rate: 0, rank: 30, isPromo: false },
      { id: '3', sku: 'WAR-5L', name: 'WARSA 5L', shortLabel: '5L', size: '5 Litre', bottlesPerCase: 2, rate: 0, rank: 40, isPromo: false },
    ];

    // Seed standard SKUs, updating rates from inventory if available
    standardDefs.forEach(def => {
      const invItem = inventory.find(i => 
        i.ID === def.id || 
        i.SKU?.toLowerCase() === def.sku.toLowerCase() || 
        i.Name?.toLowerCase().includes(def.shortLabel.toLowerCase())
      );
      list.push({
        id: invItem?.ID || def.id,
        sku: invItem?.SKU || def.sku,
        name: invItem?.Name || def.name,
        shortLabel: def.shortLabel,
        size: invItem?.Size || def.size,
        bottlesPerCase: invItem?.BottlesPerCase || def.bottlesPerCase,
        rate: invItem?.Price ?? 0,
        rank: def.rank,
        isPromo: false
      });
    });

    // Add any other dynamic items from inventory not already in standardDefs
    inventory.forEach(inv => {
      const alreadyAdded = list.some(item => 
        item.id === inv.ID || 
        item.sku.toLowerCase() === (inv.SKU || '').toLowerCase() ||
        item.name.toLowerCase() === inv.Name.toLowerCase()
      );
      if (!alreadyAdded && !inv.Name.toLowerCase().includes('promo')) {
        list.push({
          id: inv.ID,
          sku: inv.SKU || `SKU-${inv.ID}`,
          name: inv.Name,
          shortLabel: inv.Size || inv.Name,
          size: inv.Size || 'Standard',
          bottlesPerCase: inv.BottlesPerCase || 1,
          rate: inv.Price || 0,
          rank: getSkuRank(inv.SKU || inv.Name, false),
          isPromo: false
        });
      }
    });

    // Add PROMO 500ml SKU if promo is active or orders have promos
    if (hasPromoInFiltered || true) {
      list.push({
        id: 'promo-500ml',
        sku: 'PROMO-500ML',
        name: 'WARSA 500ml [PROMO FREE]',
        shortLabel: 'Promo 500ml',
        size: '500ml Free PET',
        bottlesPerCase: 24,
        rate: 0,
        rank: 50,
        isPromo: true
      });
    }

    // Sort strictly by rank: 500ml (10) -> 1.5L (20) -> 19L (30) -> 5L (40) -> Promo (50)
    return list.sort((a, b) => a.rank - b.rank);
  }, [inventory, hasPromoInFiltered]);

  // Helper to extract cases for a specific SKU from an order
  const getSaleSkuQty = (sale: SaleRecord, skuDef: SkuDefinition): number => {
    let count = 0;
    const items = sale.Items || [];

    if (skuDef.isPromo) {
      // Look for promo items
      items.forEach(item => {
        const isItemPromo = item.IsPromo || (item.Price === 0 && (item.ProductName || (item as any).Product || '').toLowerCase().includes('promo'));
        if (isItemPromo) {
          count += Number(item.LoadedQty ?? item.BookedQty ?? item.Quantity ?? (item as any).Qty ?? 0);
        }
      });
      // Also check sale.PromoFreeCases
      if (count === 0 && sale.HasPromo && (sale.PromoFreeCases || 0) > 0) {
        count = sale.PromoFreeCases || 0;
      }
      return count;
    }

    // Regular SKU matching
    items.forEach(item => {
      const isItemPromo = item.IsPromo || (item.Price === 0 && (item.ProductName || (item as any).Product || '').toLowerCase().includes('promo'));
      if (isItemPromo) return;

      const pId = item.ProductID;
      const pName = (item.ProductName || (item as any).Product || '').toLowerCase();
      const sLabel = skuDef.shortLabel.toLowerCase();

      let matched = false;
      if (pId && skuDef.id && pId === skuDef.id) {
        matched = true;
      } else if (sLabel === '500ml' && (pName.includes('500') || pName.includes('half'))) {
        matched = true;
      } else if (sLabel === '1.5l' && (pName.includes('1.5') || pName.includes('1500') || pName.includes('1-5'))) {
        matched = true;
      } else if (sLabel === '5l' && (/\b5\s*l\b|\b5000\s*ml\b/.test(pName))) {
        matched = true;
      } else if (sLabel === '19l' && (pName.includes('19') || pName.includes('can') || pName.includes('gallon'))) {
        matched = true;
      } else if (pName === skuDef.name.toLowerCase()) {
        matched = true;
      }

      if (matched) {
        count += Number(item.LoadedQty ?? item.BookedQty ?? item.Quantity ?? (item as any).Qty ?? 0);
      }
    });

    return count;
  };

  // Section 1: Calculate Total Truck Loading Summary sorted SKU-wise
  const skuLoadingSummary = useMemo(() => {
    return sortedSkus.map(sku => {
      let totalCases = 0;
      filteredSales.forEach(sale => {
        totalCases += getSaleSkuQty(sale, sku);
      });

      const totalBottles = totalCases * sku.bottlesPerCase;
      const totalValue = sku.isPromo ? 0 : totalCases * sku.rate;

      return {
        ...sku,
        totalCases,
        totalBottles,
        totalValue
      };
    }).filter(sku => sku.totalCases > 0 || !sku.isPromo); // Keep regular SKUs visible, filter promo if 0
  }, [sortedSkus, filteredSales]);

  // Grand totals across all loaded SKUs
  const grandTotalCasesToLoad = useMemo(() => {
    return skuLoadingSummary.reduce((sum, item) => sum + item.totalCases, 0);
  }, [skuLoadingSummary]);

  const grandTotalBilledCases = useMemo(() => {
    return skuLoadingSummary.filter(s => !s.isPromo).reduce((sum, item) => sum + item.totalCases, 0);
  }, [skuLoadingSummary]);

  const grandTotalPromoCases = useMemo(() => {
    return skuLoadingSummary.filter(s => s.isPromo).reduce((sum, item) => sum + item.totalCases, 0);
  }, [skuLoadingSummary]);

  const grandTotalAmount = useMemo(() => {
    return filteredSales.reduce((sum, sale) => sum + (Number(sale.GrandTotal) || 0), 0);
  }, [filteredSales]);

  // Print function with clean black-and-white high contrast print styles
  const handlePrint = () => {
    const isIframe = window.self !== window.top;
    if (isIframe && printSheetRef.current) {
      try {
        const printWindow = window.open('', '_blank', 'width=1100,height=900');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Delivery Truck Load Sheet & Outlet-Wise Orders - ${selectedDate}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                  @page { size: A4 landscape; margin: 0.6cm; }
                  body { 
                    margin: 0; 
                    padding: 0; 
                    background: white; 
                    color: black;
                    -webkit-print-color-adjust: exact; 
                    print-color-adjust: exact; 
                    font-family: Arial, sans-serif; 
                  }
                  table { border-collapse: collapse; width: 100%; page-break-inside: auto; break-inside: auto; }
                  thead { display: table-header-group; }
                  tr { page-break-inside: avoid; break-inside: avoid; }
                  th, td { border: 1px solid #000; padding: 2px 4px; font-size: 8pt; line-height: 1.15; }
                  .bg-header { background-color: #f3f4f6 !important; }
                  .bg-promo { background-color: #ecfdf5 !important; }
                  .bg-total { background-color: #fee2e2 !important; }
                  h1, h2, h3, h4 { page-break-after: avoid; break-after: avoid-page; }
                </style>
              </head>
              <body onload="window.print(); window.close();">
                <div style="width: 100%; max-width: 290mm; margin: 0 auto;">
                  ${printSheetRef.current.innerHTML}
                </div>
              </body>
            </html>
          `);
          printWindow.document.close();
          return;
        }
      } catch (e) {
        console.warn('Iframe popup print fallback', e);
      }
    }
    const cleanup = () => document.body.classList.remove('warsa-print-load-sheet');
    document.body.classList.add('warsa-print-load-sheet');
    window.addEventListener('afterprint', cleanup, { once: true });
    try {
      window.print();
    } catch (error) {
      cleanup();
      throw error;
    }
  };

  // Excel Export with individual SKU columns
  const handleExportExcel = () => {
    const exportRows = filteredSales.map((sale, idx) => {
      const row: Record<string, any> = {
        'Drop #': idx + 1,
        'Invoice #': sale.ID,
        'Shop Sr #': sale.OutletSrNo || sale.OutletID || '-',
        'Outlet Code': sale.OutletCode || '-',
        'Outlet Name': sale.OutletName,
        'Owner': sale.OwnerName || '-',
        'Route': sale.Route || '-',
        'Address': sale.Address || '-',
        'Contact Phone': sale.ContactNumber || '-',
        'Booked By': sale.BookedBy || sale.OrderBooker || '-',
      };

      // Add each SKU column in designated order: 500ml -> 1.5L -> 19L -> 5L -> Promo
      sortedSkus.forEach(sku => {
        const qty = getSaleSkuQty(sale, sku);
        const colTitle = sku.isPromo ? 'Promo 500ml (Free cs)' : `${sku.shortLabel} Cases (${sku.sku})`;
        row[colTitle] = qty;
      });

      row['Total Cases'] = sale.TotalCases;
      row['Grand Total (PKR)'] = sale.GrandTotal;
      row['Payment Status'] = sale.PaymentMethod || 'Cash';
      row['Delivery Status'] = sale.DeliveryStatus || 'Booked';

      return row;
    });

    exportToExcel(exportRows, {
      filename: `Delivery_Truck_Load_Sheet_${selectedBooker || 'All'}_${selectedDate}`,
      sheetName: 'Outlet Wise SKU Orders'
    });
  };

  // CSV Export
  const handleExportCSV = () => {
    const exportRows = filteredSales.map((sale, idx) => {
      const row: Record<string, any> = {
        'Drop #': idx + 1,
        'Invoice #': sale.ID,
        'Outlet Code': sale.OutletCode || '-',
        'Outlet Name': sale.OutletName,
        'Route': sale.Route || '-',
        'Booked By': sale.BookedBy || sale.OrderBooker || '-',
      };

      sortedSkus.forEach(sku => {
        const qty = getSaleSkuQty(sale, sku);
        row[`${sku.shortLabel}_Cases`] = qty;
      });

      row['Total_Cases'] = sale.TotalCases;
      row['Total_Amount_PKR'] = sale.GrandTotal;
      return row;
    });

    exportToCSV(exportRows, `Load_Sheet_${selectedBooker || 'All'}_${selectedDate}`);
  };

  // PDF Export
  const handleExportPDF = async () => {
    if (!printSheetRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(printSheetRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Truck_Load_Sheet_${selectedDate}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Could not export PDF load sheet.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Delivery Truck Load Sheet & Outlet-Wise Orders"
      subtitle="SKU-Wise Vehicle Loading Manifest (First 500ml → 1.5L → 19L → 5L) & Drop Sequence Report"
      className="max-w-6xl"
    >
      <div className="space-y-4">
        {/* Top Filter & Control Panel */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Selector */}
            <div>
              <label className="text-[11px] font-bold text-gray-700 block mb-1">
                Dispatch Date:
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="h-9 w-36 text-xs bg-white font-semibold"
              />
            </div>

            {/* Order Booker Selector */}
            {!isOrderBookerOnly ? (
              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  Order Booker:
                </label>
                <select
                  value={selectedBooker}
                  onChange={e => setSelectedBooker(e.target.value)}
                  className="h-9 px-3 rounded-md border border-gray-300 text-xs bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-red-500"
                >
                  <option value="ALL">All Order Bookers</option>
                  {uniqueBookers.map(ob => (
                    <option key={ob} value={ob}>Booker: {ob}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  Order Booker:
                </label>
                <div className="h-9 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-900 rounded-md text-xs font-bold flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-blue-600" />
                  {selectedBooker || 'My Orders'}
                </div>
              </div>
            )}

            {/* Route Selector */}
            <div>
              <label className="text-[11px] font-bold text-gray-700 block mb-1">
                Delivery Route:
              </label>
              <select
                value={selectedRoute}
                onChange={e => setSelectedRoute(e.target.value)}
                className="h-9 px-3 rounded-md border border-gray-300 text-xs bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-red-500"
              >
                <option value="ALL">All Routes ({uniqueRoutes.length})</option>
                {uniqueRoutes.map(rt => (
                  <option key={rt} value={rt}>Route: {rt}</option>
                ))}
              </select>
            </div>

            {/* Outlet Search Filter */}
            <div>
              <label className="text-[11px] font-bold text-gray-700 block mb-1">
                Search Outlet / Sr #:
              </label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                <Input
                  placeholder="Filter shops or Sr #..."
                  value={outletSearch}
                  onChange={e => setOutletSearch(e.target.value)}
                  className="h-9 w-44 pl-8 text-xs bg-white"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center border border-gray-300 rounded-lg p-0.5 bg-white mr-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('ALL')}
                className={cn(
                  "px-2.5 py-1 text-xs font-bold rounded-md transition-colors",
                  viewMode === 'ALL' ? "bg-red-600 text-white shadow-xs" : "text-gray-600 hover:text-gray-900"
                )}
              >
                Full Sheet
              </button>
              <button
                type="button"
                onClick={() => setViewMode('LOAD_ONLY')}
                className={cn(
                  "px-2.5 py-1 text-xs font-bold rounded-md transition-colors",
                  viewMode === 'LOAD_ONLY' ? "bg-red-600 text-white shadow-xs" : "text-gray-600 hover:text-gray-900"
                )}
              >
                Truck Loading
              </button>
              <button
                type="button"
                onClick={() => setViewMode('OUTLET_ONLY')}
                className={cn(
                  "px-2.5 py-1 text-xs font-bold rounded-md transition-colors",
                  viewMode === 'OUTLET_ONLY' ? "bg-red-600 text-white shadow-xs" : "text-gray-600 hover:text-gray-900"
                )}
              >
                Outlet Orders
              </button>
            </div>

            <Button
              onClick={handlePrint}
              className="bg-red-600 hover:bg-red-700 text-white font-bold h-9 gap-1.5 text-xs shadow-sm cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Print Sheet
            </Button>
            <Button
              variant="outline"
              onClick={handleExportExcel}
              className="h-9 gap-1.5 text-xs font-semibold bg-white border-slate-300 text-emerald-800 hover:bg-emerald-50 cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCSV}
              className="h-9 gap-1.5 text-xs font-semibold bg-white border-slate-300 text-gray-800 hover:bg-slate-100 cursor-pointer"
            >
              <Download className="h-4 w-4 text-gray-600" /> CSV
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={isExporting}
              className="h-9 gap-1.5 text-xs font-semibold bg-white border-slate-300 text-blue-800 hover:bg-blue-50 cursor-pointer"
            >
              <Download className="h-4 w-4 text-blue-600" /> PDF
            </Button>
          </div>
        </div>

        {/* Live Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center justify-between">
            <div>
              <span className="text-gray-500 font-medium block">Total Trucks Cases:</span>
              <strong className="text-red-700 text-base font-black">{grandTotalCasesToLoad} Cases</strong>
            </div>
            <Truck className="h-5 w-5 text-red-600 opacity-80" />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between">
            <div>
              <span className="text-gray-500 font-medium block">Billed / Purchased:</span>
              <strong className="text-gray-900 text-base font-black">{grandTotalBilledCases} Cases</strong>
            </div>
            <Package className="h-5 w-5 text-slate-600 opacity-80" />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
            <div>
              <span className="text-emerald-700 font-medium block">Free Promo (500ml):</span>
              <strong className="text-emerald-800 text-base font-black">{grandTotalPromoCases} Free PET</strong>
            </div>
            <Gift className="h-5 w-5 text-emerald-600 opacity-80" />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between">
            <div>
              <span className="text-amber-800 font-medium block">Total Outlets / Drops:</span>
              <strong className="text-amber-900 text-base font-black">{filteredSales.length} Shops</strong>
            </div>
            <Store className="h-5 w-5 text-amber-600 opacity-80" />
          </div>
        </div>

        {/* Printable Load Sheet Preview Container */}
        <div className="border border-gray-300 rounded-xl bg-white p-4 sm:p-6 max-h-[72vh] overflow-y-auto shadow-sm">
          <div id="printable-load-report" ref={printSheetRef} className="space-y-6 text-black bg-white">
            
            {/* Header with Company Logo & Distribution Meta */}
            <div className="border-b-2 border-black pb-3 text-center relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-left">
                  <div className="text-xl font-black tracking-wider uppercase text-red-600">
                    KFM BEVERAGES (WARSA)
                  </div>
                  <div className="text-xs text-gray-800 font-bold uppercase tracking-wide">
                    Delivery Truck Load Sheet & Outlet-Wise Orders Manifest
                  </div>
                  <div className="text-[11px] text-gray-600">
                    40-1 Saddar Bazar Lahore Cantt | Phone: 0336-4574227 / 0300-8441457
                  </div>
                </div>

                <div className="text-right border-2 border-black p-2 bg-gray-50 rounded">
                  <div className="text-[10px] text-gray-700 font-bold uppercase tracking-wider">
                    Dispatch Date
                  </div>
                  <div className="text-sm font-black text-black">
                    {selectedDate ? format(new Date(selectedDate), 'dd MMMM yyyy (EEEE)') : '-'}
                  </div>
                  <div className="text-[10px] text-red-700 font-black mt-0.5">
                    Total Load: {grandTotalCasesToLoad} Cases
                  </div>
                </div>
              </div>

              {/* Meta details bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs border-t-2 border-black pt-2 text-left font-medium">
                <div>
                  <span className="text-gray-600 font-bold">Booker:</span>{' '}
                  <strong className="text-black">{selectedBooker === 'ALL' ? 'All Order Bookers' : selectedBooker}</strong>
                </div>
                <div>
                  <span className="text-gray-600 font-bold">Route:</span>{' '}
                  <strong className="text-black">{selectedRoute === 'ALL' ? 'All Routes' : selectedRoute}</strong>
                </div>
                <div>
                  <span className="text-gray-600 font-bold">Total Drops:</span>{' '}
                  <strong className="text-black">{filteredSales.length} Shops</strong>
                </div>
                <div>
                  <span className="text-gray-600 font-bold">Free Promo 500ml:</span>{' '}
                  <strong className="text-emerald-700 font-black">+{grandTotalPromoCases} Cases</strong>
                </div>
                <div>
                  <span className="text-gray-600 font-bold">Truck Loading Total:</span>{' '}
                  <strong className="text-red-700 font-black">{grandTotalCasesToLoad} Cases</strong>
                </div>
              </div>
            </div>

            {/* SECTION 1: DELIVERY TRUCK LOAD SHEET (SKU-WISE SUMMARY) */}
            {(viewMode === 'ALL' || viewMode === 'LOAD_ONLY') && (
              <div>
                <div className="flex items-center justify-between mb-2 border-b-2 border-black pb-1">
                  <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-red-600" />
                    1. Delivery Truck Load Sheet (SKU-Wise Vehicle Loading Summary)
                  </h3>
                  <span className="text-[11px] text-gray-700 font-bold">
                    SKU Sequence: First 500ml &rarr; 1.5L &rarr; 19L &rarr; 5L
                  </span>
                </div>

                <table className="w-full text-xs border-collapse border border-black">
                  <thead className="bg-gray-100 font-bold text-center">
                    <tr>
                      <th className="border border-black p-1.5 text-center w-8">#</th>
                      <th className="border border-black p-1.5 text-center w-24">SKU Code</th>
                      <th className="border border-black p-1.5 text-left">Product / SKU Description</th>
                      <th className="border border-black p-1.5 text-center w-20">Pack Size</th>
                      <th className="border border-black p-1.5 text-center w-24 bg-red-50 text-red-900 font-black">
                        Total Cases to Load
                      </th>
                      <th className="border border-black p-1.5 text-center w-24">Total Bottles</th>
                      <th className="border border-black p-1.5 text-right w-20">Rate (PKR)</th>
                      <th className="border border-black p-1.5 text-right w-28">Total Value</th>
                      <th className="border border-black p-1.5 text-center w-24">Warehouse Verified</th>
                      <th className="border border-black p-1.5 text-center w-24">Driver Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuLoadingSummary.length > 0 ? (
                      skuLoadingSummary.map((sku, idx) => (
                        <tr key={sku.id || sku.sku} className={sku.isPromo ? "bg-emerald-50/70 font-semibold" : undefined}>
                          <td className="border border-black p-1.5 text-center font-bold text-gray-600">{idx + 1}</td>
                          <td className="border border-black p-1.5 text-center font-mono font-black text-gray-900">
                            {sku.sku}
                          </td>
                          <td className="border border-black p-1.5 font-bold text-gray-900">
                            {sku.isPromo ? (
                              <div className="flex items-center gap-1.5">
                                <span className="bg-emerald-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded uppercase">
                                  SCHEME
                                </span>
                                <span className="text-emerald-950 font-black">{sku.name}</span>
                              </div>
                            ) : (
                              <span>{sku.name}</span>
                            )}
                          </td>
                          <td className="border border-black p-1.5 text-center text-gray-700">
                            {sku.bottlesPerCase > 1 ? `${sku.bottlesPerCase} btls/cs` : '1 Unit'}
                          </td>
                          <td className="border border-black p-1.5 text-center font-black text-base text-red-700 bg-red-50/60">
                            {sku.totalCases}
                          </td>
                          <td className="border border-black p-1.5 text-center font-bold text-gray-800">
                            {sku.totalBottles} btls
                          </td>
                          <td className="border border-black p-1.5 text-right text-gray-700">
                            {sku.isPromo ? <span className="text-emerald-700 font-bold">Rs. 0</span> : `Rs. ${sku.rate}`}
                          </td>
                          <td className="border border-black p-1.5 text-right font-black text-gray-900">
                            {sku.isPromo ? (
                              <span className="text-emerald-700 font-black">FREE (PKR 0)</span>
                            ) : (
                              `PKR ${sku.totalValue.toLocaleString()}`
                            )}
                          </td>
                          <td className="border border-black p-1.5 text-center text-gray-400 font-mono text-[11px]">
                            [ &nbsp; &nbsp; &nbsp; &nbsp; ]
                          </td>
                          <td className="border border-black p-1.5 text-center text-gray-400 font-mono text-[11px]">
                            [ &nbsp; &nbsp; &nbsp; &nbsp; ]
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={10} className="border border-black p-4 text-center text-gray-500 font-medium">
                          No orders booked for this date/filter selection.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-black border-t-2 border-black">
                      <td colSpan={4} className="border border-black p-2 text-right uppercase text-xs">
                        Grand Total Loading Requirements:
                      </td>
                      <td className="border border-black p-2 text-center text-red-700 text-lg font-black bg-red-100">
                        {grandTotalCasesToLoad} Cases
                      </td>
                      <td className="border border-black p-2 text-center text-xs text-gray-800">
                        {skuLoadingSummary.reduce((sum, s) => sum + s.totalBottles, 0)} btls
                      </td>
                      <td className="border border-black p-2 text-right text-xs">Total Value:</td>
                      <td className="border border-black p-2 text-right text-black font-black text-sm">
                        PKR {grandTotalAmount.toLocaleString()}
                      </td>
                      <td colSpan={2} className="border border-black p-2 text-center text-[10px] text-gray-700">
                        Loading Supervisor Stamp / Sign
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* SECTION 2: OUTLET-WISE DELIVERY SEQUENCE (SKU MATRIX COLUMNS) */}
            {(viewMode === 'ALL' || viewMode === 'OUTLET_ONLY') && (
              <div>
                <div className="flex items-center justify-between mb-2 border-b-2 border-black pb-1">
                  <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                    <Store className="h-4 w-4 text-red-600" />
                    2. Outlet-Wise Delivery Sequence (Drop By Drop &bull; SKU Breakdown)
                  </h3>
                  <span className="text-[11px] text-gray-700 font-bold">
                    {filteredSales.length} Total Outlet Drops
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse border border-black min-w-[900px]">
                    <thead className="bg-gray-100 font-bold text-center">
                      <tr>
                        <th className="border border-black p-1 text-center w-7">#</th>
                        <th className="border border-black p-1 text-center w-12">Sr #</th>
                        <th className="border border-black p-1 text-center w-14">Code</th>
                        <th className="border border-black p-1 text-left min-w-[140px]">Outlet / Customer Name</th>
                        <th className="border border-black p-1 text-left w-24">Route</th>

                        {/* DYNAMIC SKU MATRIX HEADERS (First 500ml, then 1.5L, then 19L, then 5L, then Promo) */}
                        {sortedSkus.map(sku => (
                          <th 
                            key={sku.id || sku.sku} 
                            className={cn(
                              "border border-black p-1 text-center font-black min-w-[55px]",
                              sku.isPromo ? "bg-emerald-100 text-emerald-950" : "bg-slate-100 text-gray-900"
                            )}
                          >
                            <div className="text-[11px] leading-tight">{sku.shortLabel}</div>
                            <div className="text-[9px] text-gray-500 font-normal">{sku.sku}</div>
                          </th>
                        ))}

                        <th className="border border-black p-1 text-center w-16 bg-red-100 text-red-900 font-black">
                          Total Cases
                        </th>
                        <th className="border border-black p-1 text-right w-20 font-black">
                          Bill (PKR)
                        </th>
                        <th className="border border-black p-1 text-center w-24">
                          Customer Sign / Receiving
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.length > 0 ? (
                        filteredSales.map((sale, idx) => {
                          return (
                            <tr key={sale.ID} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'}>
                              <td className="border border-black p-1 text-center font-bold text-gray-600">{idx + 1}</td>
                              <td className="border border-black p-1 text-center font-black text-gray-900">
                                {sale.OutletSrNo !== undefined ? sale.OutletSrNo : (sale.OutletID || '-')}
                              </td>
                              <td className="border border-black p-1 text-center font-black text-red-700">
                                {sale.OutletCode || '-'}
                              </td>
                              <td className="border border-black p-1 text-left">
                                <div className="font-bold text-black">{sale.OutletName}</div>
                                <div className="text-[10px] text-gray-600 flex items-center gap-2">
                                  {sale.ContactNumber && <span>{sale.ContactNumber}</span>}
                                  {sale.OwnerName && <span>&bull; {sale.OwnerName}</span>}
                                </div>
                              </td>
                              <td className="border border-black p-1 text-left text-gray-800 text-[11px]">
                                {sale.Route || '-'}
                              </td>

                              {/* SKU CASES VALUES FOR THIS OUTLET */}
                              {sortedSkus.map(sku => {
                                const qty = getSaleSkuQty(sale, sku);
                                return (
                                  <td 
                                    key={sku.id || sku.sku} 
                                    className={cn(
                                      "border border-black p-1 text-center font-bold text-sm",
                                      sku.isPromo && qty > 0 ? "bg-emerald-50 text-emerald-800 font-black" : (qty > 0 ? "text-gray-900" : "text-gray-300 font-normal")
                                    )}
                                  >
                                    {qty > 0 ? qty : '-'}
                                  </td>
                                );
                              })}

                              <td className="border border-black p-1 text-center font-black text-base text-red-700 bg-red-50/40">
                                {sale.TotalCases}
                              </td>
                              <td className="border border-black p-1 text-right font-black text-black">
                                {Number(sale.GrandTotal).toLocaleString()}
                              </td>
                              <td className="border border-black p-1 text-center text-[10px] text-gray-400 font-mono">
                                [ &nbsp; &nbsp; &nbsp; &nbsp; ]
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8 + sortedSkus.length} className="border border-black p-4 text-center text-gray-500 font-medium">
                            No outlet orders match this selection.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 font-black border-t-2 border-black">
                        <td colSpan={5} className="border border-black p-1.5 text-right uppercase text-xs">
                          SKU Column Totals:
                        </td>

                        {/* Column sums for each SKU */}
                        {sortedSkus.map(sku => {
                          const colSum = filteredSales.reduce((acc, sale) => acc + getSaleSkuQty(sale, sku), 0);
                          return (
                            <td 
                              key={sku.id || sku.sku} 
                              className={cn(
                                "border border-black p-1 text-center text-sm font-black",
                                sku.isPromo ? "bg-emerald-100 text-emerald-950" : "text-gray-950 bg-slate-100"
                              )}
                            >
                              {colSum}
                            </td>
                          );
                        })}

                        <td className="border border-black p-1.5 text-center text-base font-black text-red-700 bg-red-100">
                          {grandTotalBilledCases} cs
                        </td>
                        <td className="border border-black p-1.5 text-right font-black text-sm text-black">
                          PKR {grandTotalAmount.toLocaleString()}
                        </td>
                        <td className="border border-black p-1.5 text-center text-[10px] text-gray-600">
                          Route Completed
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* AUTHORIZATION & OFFICIAL SIGNATURES BLOCK */}
            <div className="pt-4 border-t-2 border-black grid grid-cols-4 gap-4 text-center text-xs font-bold text-gray-800">
              <div>
                <div className="border-b-2 border-black pb-8"></div>
                <div className="mt-1.5 uppercase text-[10px] text-gray-700 font-black">
                  Order Booker Signature
                </div>
              </div>
              <div>
                <div className="border-b-2 border-black pb-8"></div>
                <div className="mt-1.5 uppercase text-[10px] text-gray-700 font-black">
                  Warehouse Incharge
                </div>
              </div>
              <div>
                <div className="border-b-2 border-black pb-8"></div>
                <div className="mt-1.5 uppercase text-[10px] text-gray-700 font-black">
                  Salesman / Driver Receiving
                </div>
              </div>
              <div>
                <div className="border-b-2 border-black pb-8"></div>
                <div className="mt-1.5 uppercase text-[10px] text-gray-700 font-black">
                  Security Gate Pass Stamp
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
