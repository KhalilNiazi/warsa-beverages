import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { 
  fetchInventory, 
  saveInventoryItem,
  fetchSales, 
  addSaleRecord, 
  fetchOutlets, 
  fetchDeliveryMen,
  updateSale, 
  deleteSale, 
  canModifyData,
  getCurrentUser,
  isOrderBooker,
  isSalesman,
  isSuperAdmin,
  canBookOrders,
  canManageDeliveriesAndLoading,
  filterOutletsForUser,
  filterSalesForUser,
  getUserAssignedRoutes,
  getSettings
} from '@/src/api';
import { InventoryItem, SaleRecord, Outlet, InvoiceItem, DeliveryStatus, DeliveryMan } from '@/src/types';
import { ShoppingCart, Search, Receipt, Plus, Trash2, Edit2, FileText, ChevronDown, Printer, Truck, CheckCircle2, AlertTriangle, XCircle, AlertCircle, Store, Hash, ShieldAlert, Eye, User, FileSpreadsheet, Gift, Tag, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/src/lib/utils';
import { InvoiceDetailModal } from '@/src/components/InvoiceDetailModal';
import { DeliveryStatusModal } from '@/src/components/DeliveryStatusModal';
import { PrintOrderView } from '@/src/components/PrintOrderView';
import { DigitalInvoiceModal } from '@/src/components/DigitalInvoiceModal';
import { InvoicePrintModal } from '@/src/components/InvoicePrintModal';
import { BookerLoadReportModal } from '@/src/components/BookerLoadReportModal';
import { BulkDataModal } from '@/src/components/BulkDataModal';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { GoogleSheetSyncStatus } from '@/src/components/GoogleSheetSyncStatus';

export function Sales() {
  const currentUser = getCurrentUser();
  const canEdit = canModifyData();
  const canBook = canBookOrders(currentUser);
  const canDrop = canManageDeliveriesAndLoading(currentUser);
  const isSuper = isSuperAdmin(currentUser);
  const isBooker = isOrderBooker(currentUser);
  const isMan = isSalesman(currentUser);
  const assignedRoutes = getUserAssignedRoutes(currentUser);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [deliveryMen, setDeliveryMen] = useState<DeliveryMan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [addProductForIdx, setAddProductForIdx] = useState<number | null>(null);
  const [newProduct, setNewProduct] = useState({ Name: '', SKU: '', Size: '', Price: '', BottlesPerCase: '24', Stock: '' });
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [search, setSearch] = useState('');
  
  const [printSale, setPrintSale] = useState<SaleRecord | null>(null);
  const [invoiceToPrint, setInvoiceToPrint] = useState<SaleRecord | null>(null);
  const [printedInvoiceToShow, setPrintedInvoiceToShow] = useState<SaleRecord | null>(null);
  const [invoiceLabel] = useState<string>(() => {
    try { return getSettings().invoiceButtonLabel || 'Digital Invoice'; }
    catch { return 'Digital Invoice'; }
  });
  const [isLoadReportOpen, setIsLoadReportOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [salesmanBookerFilter, setSalesmanBookerFilter] = useState('ALL');

  const [selectedInvoice, setSelectedInvoice] = useState<SaleRecord | null>(null);
  const [saleForDeliveryStatus, setSaleForDeliveryStatus] = useState<SaleRecord | null>(null);

  // Order form state
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [outletName, setOutletName] = useState('');
  const [route, setRoute] = useState('');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [deliveryManName, setDeliveryManName] = useState('');
  const [status, setStatus] = useState('');
  
  // Search shop by Sr No
  const [shopSrNoSearch, setShopSrNoSearch] = useState('');
  const [srSearchFeedback, setSrSearchFeedback] = useState<string | null>(null);
  
  const [orderItems, setOrderItems] = useState<{product: string, qty: number}[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [isPromoEnabled, setIsPromoEnabled] = useState<boolean>(false);
  const [promoCasesCount, setPromoCasesCount] = useState<number>(1);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invData, salesData, outletsData, deliveryMenData] = await Promise.all([
        fetchInventory(),
        fetchSales(),
        fetchOutlets(),
        fetchDeliveryMen()
      ]);
      setInventory(invData);
      setOutlets(outletsData);
      setDeliveryMen(deliveryMenData);
      setSales(salesData.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime()));
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

  useEffect(() => {
    if (printSale) {
      const timer = setTimeout(() => {
        try { window.print(); } catch(e) {}
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [printSale]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setTimeout(() => setPrintSale(null), 1000);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const selectOutlet = (outlet: Outlet | null) => {
    if (outlet) {
      setSelectedOutletId(outlet.ID);
      setOutletName(outlet.Name);
      setRoute(outlet.Route);
      setAddress(outlet.Address);
      setContactNumber(outlet.ContactNumber);
      setOwnerName(outlet.OwnerName);
      setDeliveryManName(outlet.DeliveryManName || '');
      setStatus(outlet.Status);
      setSrSearchFeedback(null);
    } else {
      setSelectedOutletId('');
      setOutletName('');
      setRoute('');
      setAddress('');
      setContactNumber('');
      setOwnerName('');
      setDeliveryManName('');
      setStatus('');
      setShopSrNoSearch('');
      setSrSearchFeedback(null);
    }
  };

  const handleFindShopBySrNo = () => {
    const raw = shopSrNoSearch.trim();
    if (!raw) {
      setSrSearchFeedback("Please enter a shop Sr No (like 1, 2, 3), shop code, or name.");
      return;
    }

    const query = raw.toLowerCase();
    const cleanNumber = query.replace(/^sr\s*#?|^#/, '').trim();
    const isNum = /^\d+$/.test(cleanNumber);

    // 1. Check exact Sr No or ID match
    let match = outlets.find(o => {
      const sr = o.SrNo !== undefined ? o.SrNo.toString() : '';
      return (sr && sr === cleanNumber) || (isNum && o.ID === cleanNumber);
    });

    // 2. Exact code match (e.g. WAR001 or 001)
    if (!match) {
      match = outlets.find(o => (o.Code || '').toLowerCase() === query);
    }

    // 3. Partial Code, Name or Route match
    if (!match) {
      match = outlets.find(o => 
        (o.Code || '').toLowerCase().includes(query) ||
        (o.Name || '').toLowerCase().includes(query) ||
        (o.Route || '').toLowerCase().includes(query)
      );
    }

    if (match) {
      selectOutlet(match);
      setShopSrNoSearch('');
      setSrSearchFeedback(null);
    } else {
      setSrSearchFeedback(`No shop found for "${raw}". Please check the Sr No and try again.`);
    }
  };

  const handleOutletSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const outlet = outlets.find(o => o.ID === id) || null;
    selectOutlet(outlet);
  };

  const handleAddItem = () => {
    setOrderItems([...orderItems, { product: '', qty: 1 }]);
  };

  const ADD_NEW_PRODUCT = '__ADD_NEW_PRODUCT__';

  const openAddProduct = (idx: number) => {
    setAddProductForIdx(idx);
    setNewProduct({ Name: '', SKU: '', Size: '', Price: '', BottlesPerCase: '24', Stock: '' });
    setIsAddProductOpen(true);
  };

  const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const name = newProduct.Name.trim();
    if (!name) return;
    setIsSavingProduct(true);
    try {
      const stock = Number(newProduct.Stock) || 0;
      const id = Date.now().toString();
      const sku = newProduct.SKU.trim() || name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
      await saveInventoryItem({
        ID: id,
        Name: name,
        SKU: sku,
        Size: newProduct.Size.trim() || 'Standard',
        UnitType: 'Case / Carton',
        BottlesPerCase: Number(newProduct.BottlesPerCase) || 24,
        Quantity: stock,
        OpeningStock: stock,
        StockAdded: 0,
        StockDispatched: 0,
        StockReturned: 0,
        StockDamaged: 0,
        Price: Number(newProduct.Price) || 0,
        MinThreshold: 0,
        LastUpdated: new Date().toISOString()
      });
      const fresh = await fetchInventory(true);
      setInventory(fresh);
      if (addProductForIdx !== null) {
        setOrderItems(prev => prev.map((it, i) => (i === addProductForIdx ? { ...it, product: id } : it)));
      }
      setIsAddProductOpen(false);
      setAddProductForIdx(null);
    } catch (err: any) {
      alert(err?.message || 'Could not save product.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleUpdateItem = (index: number, field: string, value: any) => {
    if (field === 'product' && value === ADD_NEW_PRODUCT) {
      openAddProduct(index);
      return;
    }
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value };
    setOrderItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    const updated = orderItems.filter((_, i) => i !== index);
    setOrderItems(updated);
  };

  // Compute Totals & Promotional Scheme (15 Cases = 1 Free 500ml PET)
  const selectedOutlet = outlets.find(o => o.ID === selectedOutletId);
  const regularItems: InvoiceItem[] = orderItems.map(item => {
    const p = inventory.find(i => i.ID === item.product);
    
    let price = p?.Price || 0;
    if (selectedOutlet && selectedOutlet.CustomRates && selectedOutlet.CustomRates[item.product] !== undefined) {
      price = selectedOutlet.CustomRates[item.product];
    }
    
    const name = p?.Name || '';
    const qty = Number(item.qty);
    return {
      ProductID: item.product,
      ProductName: name,
      Quantity: qty,
      BookedQty: qty,
      Price: price,
      Amount: price * qty,
      DeliveredQty: qty,
      RejectedQty: 0
    };
  }).filter(item => item.ProductID);

  const totalPurchasedCases = regularItems.reduce((acc, item) => acc + item.Quantity, 0);
  const totalAmount = regularItems.reduce((acc, item) => acc + item.Amount, 0);
  const grandTotal = Math.max(0, totalAmount - (Number(discount) || 0));

  // Find 500ml product from inventory
  const product500ml = inventory.find(i => 
    i.Name?.toLowerCase().includes('500') || 
    i.Size?.toLowerCase().includes('500') || 
    i.SKU?.toLowerCase().includes('500')
  ) || { ID: 'promo-500ml', Name: 'WARSA 500ml' };

  // Manual Promotional Scheme: User explicitly adds promo ("it depend on us what we give them")
  // Default scheme: "1 Free 500ml PET Promotional Scheme"
  const isPromoApplied = isPromoEnabled && promoCasesCount > 0;
  const freePromoCases = isPromoApplied ? promoCasesCount : 0;
  const promoSchemeTitle = freePromoCases === 1 
    ? '1 Free 500ml PET Promotional Scheme' 
    : `${freePromoCases} Free 500ml PET Promotional Scheme`;

  const promoItem: InvoiceItem | null = isPromoApplied ? {
    ProductID: product500ml.ID || 'promo-500ml',
    ProductName: `${product500ml.Name || 'WARSA 500ml'} [PROMO FREE]`,
    Quantity: freePromoCases,
    BookedQty: freePromoCases,
    DeliveredQty: freePromoCases,
    RejectedQty: 0,
    Price: 0,
    Amount: 0,
    IsPromo: true,
    PromoScheme: promoSchemeTitle
  } : null;

  const resolvedItems: InvoiceItem[] = promoItem ? [...regularItems, promoItem] : regularItems;
  const totalCases = totalPurchasedCases; // Billed purchased cases
  const totalLoadedCases = totalPurchasedCases + (promoItem ? freePromoCases : 0);

  const handleEdit = (sale: SaleRecord) => {
    setEditingSaleId(sale.ID);
    const outlet = outlets.find(o => o.ID === sale.OutletID || o.Name === sale.OutletName || o.Address === sale.Address);
    selectOutlet(outlet || null);
    setDeliveryManName(sale.DriverName || outlet?.DeliveryManName || '');
    if (!outlet) {
      setOutletName(sale.OutletName);
      setRoute(sale.Route);
      setAddress(sale.Address);
      setContactNumber(sale.ContactNumber || '');
      setOwnerName(sale.OwnerName || '');
      setStatus(sale.Status || '');
    }
    setDiscount(sale.Discount);
    
    if (sale.HasPromo) {
      setIsPromoEnabled(true);
      setPromoCasesCount(sale.PromoFreeCases || 1);
    } else {
      setIsPromoEnabled(false);
      setPromoCasesCount(1);
    }
    
    const newOrderItems = (sale.Items || [])
      .filter(item => !item.IsPromo && !(item.Price === 0 && (item.ProductName || '').toLowerCase().includes('promo')))
      .map(item => ({
        product: item.ProductID || '',
        qty: item.BookedQty || item.Quantity
      }));
    setOrderItems(newOrderItems);
    setIsRecording(true);
  };

  const handleDelete = async () => {
    if (saleToDelete) {
      await deleteSale(saleToDelete);
      setSaleToDelete(null);
      loadData();
    }
  };

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regularItems.length === 0) {
      alert("Please add at least one valid product.");
      return;
    }

    const sale: SaleRecord = {
      ID: editingSaleId || Math.floor(Math.random() * 100000).toString(),
      Date: editingSaleId ? (sales.find(s => s.ID === editingSaleId)?.Date || new Date().toISOString()) : new Date().toISOString(),
      OutletID: selectedOutlet?.ID,
      OutletSrNo: selectedOutlet?.SrNo,
      OutletCode: selectedOutlet?.Code,
      OutletName: outletName,
      Route: route,
      Address: address,
      ContactNumber: contactNumber,
      OwnerName: ownerName,
      DriverName: deliveryManName.trim(),
      Status: status,
      BookedBy: editingSaleId ? (sales.find(s => s.ID === editingSaleId)?.BookedBy || currentUser?.name || 'Order Booker') : (currentUser?.name || 'Order Booker'),
      DeliveryStatus: 'DELIVERED',
      Items: resolvedItems,
      TotalCases: totalPurchasedCases,
      DeliveredCases: totalPurchasedCases,
      RejectedCases: 0,
      TotalAmount: totalAmount,
      ActualAmount: totalAmount,
      Discount: Number(discount) || 0,
      GrandTotal: grandTotal,
      ActualGrandTotal: grandTotal,
      PaymentMethod: 'Cash',
      CashCollected: grandTotal,
      HasPromo: isPromoApplied && freePromoCases > 0,
      PromoDescription: isPromoApplied && freePromoCases > 0 ? promoSchemeTitle : undefined,
      PromoFreeCases: isPromoApplied ? freePromoCases : 0,
      PromoProductID: isPromoApplied && promoItem ? promoItem.ProductID : undefined,
      PromoProductName: isPromoApplied ? (product500ml.Name || 'WARSA 500ml') : undefined,
      LoadedCases: totalLoadedCases
    };

    setIsRecording(false);
    if (editingSaleId) {
      await updateSale(sale);
    } else {
      await addSaleRecord(sale);
      setInvoiceToPrint(sale);
    }
    setEditingSaleId(null);
    setDeliveryManName('');
    selectOutlet(null);
    setOrderItems([]);
    setDiscount(0);
    setIsPromoEnabled(false);
    setPromoCasesCount(1);
    loadData();
  };

  const availableOutlets = filterOutletsForUser(outlets, currentUser);

  const matchingOutlets = shopSrNoSearch.trim() ? availableOutlets.filter(o => {
    const raw = shopSrNoSearch.trim().toLowerCase();
    const cleanNumber = raw.replace(/^sr\s*#?|^#/, '').trim();
    const srStr = (o.SrNo !== undefined ? o.SrNo : o.ID).toString();
    const codeStr = (o.Code || '').toLowerCase();
    const nameStr = (o.Name || '').toLowerCase();
    const routeStr = (o.Route || '').toLowerCase();

    if (srStr === cleanNumber) return true;
    if (/^\d+$/.test(cleanNumber) && srStr.includes(cleanNumber)) return true;
    return codeStr.includes(raw) || nameStr.includes(raw) || routeStr.includes(raw);
  }) : [];

  // Unique bookers for filtering
  const orderBookersList = useMemo(() => {
    const s = new Set<string>();
    sales.forEach(sale => {
      if (sale.BookedBy) s.add(sale.BookedBy);
      if (sale.OrderBooker) s.add(sale.OrderBooker);
    });
    outlets.forEach(o => {
      if (o.OB) s.add(o.OB);
    });
    return Array.from(s).filter(Boolean).sort();
  }, [sales, outlets]);

  const scopedSales = filterSalesForUser(sales, currentUser);

  const filteredSales = scopedSales.filter(sale => {
    if (salesmanBookerFilter !== 'ALL') {
      const bBy = sale.BookedBy || sale.OrderBooker || '';
      if (bBy.toLowerCase() !== salesmanBookerFilter.toLowerCase()) return false;
    }

    const q = search.trim().toLowerCase();
    if (!q) return true;
    const cleanNum = q.replace(/^sr\s*#?|^#/, '').trim();
    const isNum = /^\d+$/.test(cleanNum);

    if (isNum) {
      if (sale.OutletSrNo !== undefined && sale.OutletSrNo.toString() === cleanNum) return true;
      const o = outlets.find(out => out.ID === sale.OutletID || out.Name.toLowerCase() === sale.OutletName.toLowerCase());
      if (o && (o.SrNo?.toString() === cleanNum || o.ID === cleanNum)) return true;
    }

    return (
      (sale.OutletName || '').toLowerCase().includes(q) || 
      (sale.ID || '').toLowerCase().includes(q) ||
      (sale.Route || '').toLowerCase().includes(q) ||
      (sale.OutletCode || '').toLowerCase().includes(q)
    );
  });

  const [showIframeWarning, setShowIframeWarning] = useState(false);

  const triggerPrint = (sale: SaleRecord) => {
    setInvoiceToPrint(sale);
  };

  const handleInvoiceDeliveryManChange = async (sale: SaleRecord, name: string) => {
    const updatedSale = { ...sale, DriverName: name.trim() };
    try {
      await updateSale(updatedSale);
      setSales(previous => previous.map(item => item.ID === updatedSale.ID ? updatedSale : item));
      setInvoiceToPrint(current => current?.ID === updatedSale.ID ? updatedSale : current);
      setPrintedInvoiceToShow(current => current?.ID === updatedSale.ID ? updatedSale : current);
    } catch (error) {
      console.error('[Sales] Could not update invoice delivery man:', error);
      alert(error instanceof Error ? error.message : 'Could not save the delivery man name.');
      throw error;
    }
  };

  return (
    <>
      <PrintOrderView sale={printSale} outlets={outlets} inventory={inventory} />
      
      {showIframeWarning && (
        <div className="bg-amber-100 text-amber-800 p-4 rounded-md mb-4 max-w-7xl mx-auto flex justify-between items-center print:hidden text-sm">
          <p><strong>Note:</strong> If the print dialog didn't open, please click the <strong>"Open in New Tab"</strong> icon at the top right of the screen to print.</p>
          <Button variant="ghost" size="sm" onClick={() => setShowIframeWarning(false)}>Dismiss</Button>
        </div>
      )}

      <div className={cn("p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6", printSale ? "print:hidden" : "")}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <Receipt className="h-7 w-7 text-red-600" /> Orders Booked &amp; Delivered
              </h1>
              <GoogleSheetSyncStatus variant="badge" className="shrink-0" />
            </div>
            <p className="text-sm md:text-base text-gray-500 mt-1">
              {isBooker ? `Orders booked for your assigned route: ${assignedRoutes.join(', ') || 'Assigned Route'}` : (isMan ? 'All orders booked by Order Bookers for truck loading and shop drops.' : 'Book orders and track outlet delivery acceptance and returns.')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={() => setIsLoadReportOpen(true)}
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold h-10 shadow-xs cursor-pointer text-xs sm:text-sm"
              title="Delivery Truck Load Sheet & Outlet-Wise Orders (SKU-Wise: 500ml, 1.5L, 5L, 19L)"
            >
              <Truck className="h-4 w-4 text-white shrink-0" />
              <span>Truck Load Sheet</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsBulkModalOpen(true)}
              className="gap-1.5 bg-white border-red-200 text-red-700 hover:bg-red-50 font-bold h-10 shadow-2xs text-xs sm:text-sm"
            >
              <FileSpreadsheet className="h-4 w-4 text-red-600 shrink-0" />
              <span>Excel Export/Import</span>
            </Button>
            {!canEdit ? (
              <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-bold px-3 py-2 flex items-center gap-1.5 shadow-sm text-xs">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Read-Only</span>
              </Badge>
            ) : canBook ? (
              <Button onClick={() => { setIsRecording(true); if(orderItems.length===0) handleAddItem(); }} className="gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold h-10 shadow-sm text-xs sm:text-sm">
                <Plus className="h-4 w-4 shrink-0" />
                <span>Book Order</span>
              </Button>
            ) : null}
          </div>
        </div>

        {/* Salesman View Banner */}
        {isMan && (
          <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-red-950 text-xs shadow-2xs">
            <div className="flex items-center gap-2.5">
              <Truck className="h-4 w-4 text-red-600 flex-shrink-0" />
              <span>
                <strong>Salesman Order Dispatch &amp; Loading View:</strong> Showing all orders booked by Order Bookers across all routes ({scopedSales.length} total orders). Review order quantities, print invoices, and open the truck loading sheet.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-red-100 text-red-800 font-bold border-none">
                All Order Booker Orders
              </Badge>
            </div>
          </div>
        )}

        {/* ASM Read-Only Banner */}
        {!canEdit && (
          <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl flex items-center justify-between gap-3 text-red-950 text-xs shadow-2xs">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
              <span>
                <strong>Area Sales Manager (ASM) Read-Only Inspection:</strong> You can inspect customer orders, prices, invoices, and delivery outcomes. Booking new orders, editing orders, deleting orders, and modifying drops are restricted.
              </span>
            </div>
            <Badge className="bg-red-100 text-red-950 font-bold hover:bg-red-100 border-none shrink-0">
              Read-Only
            </Badge>
          </div>
        )}

        {/* Order Booker Route Banner */}
        {isBooker && (
          <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl flex items-center justify-between gap-3 text-red-950 text-xs shadow-2xs">
            <div className="flex items-center gap-2.5">
              <User className="h-4 w-4 text-red-600 flex-shrink-0" />
              <span>
                <strong>Order Booker Route View:</strong> Showing booked orders for your assigned route (<strong>{assignedRoutes.join(', ') || 'Assigned Route'}</strong>). Total: <strong>{scopedSales.length}</strong> orders.
              </span>
            </div>
            <Badge className="bg-red-100 text-red-800 font-bold border-none shrink-0">
              My Route Booked Orders
            </Badge>
          </div>
        )}

        <ResponsiveDialog 
          isOpen={isRecording} 
          onClose={() => { setIsRecording(false); setEditingSaleId(null); setDeliveryManName(''); setIsPromoEnabled(false); setPromoCasesCount(1); }}
          title={editingSaleId ? "Edit Order" : "Book New Order"}
        >
          <form onSubmit={handleRecordSale} className="space-y-6 pb-12 md:pb-0">
            {/* SEARCH SHOP BY SR NO OR NAME */}
            <div className="p-3.5 md:p-4 rounded-xl border border-red-200 bg-red-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-900 uppercase flex items-center gap-1.5">
                  <Hash className="h-4 w-4 text-red-600" />
                  Search Shop by Sr No (Serial Number)
                </label>
                <span className="text-[11px] text-gray-500 font-medium">
                  Fast Shop Search
                </span>
              </div>

              {/* Search by Sr No Input & Find Button */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute left-3 top-2.5 flex items-center gap-1 text-gray-400">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <Input
                    type="text"
                    placeholder="Type Sr No (e.g. 1, 2, 3...) or Shop Code / Name"
                    className="pl-9 pr-14 h-10 bg-white border-red-200 focus-visible:ring-red-500 text-sm font-medium"
                    value={shopSrNoSearch}
                    onChange={(e) => {
                      setShopSrNoSearch(e.target.value);
                      setSrSearchFeedback(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleFindShopBySrNo();
                      }
                    }}
                  />
                  {shopSrNoSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setShopSrNoSearch('');
                        setSrSearchFeedback(null);
                      }}
                      className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600 font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={handleFindShopBySrNo}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold h-10 px-4 text-xs gap-1.5 shrink-0"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Find Shop</span>
                </Button>
              </div>

              {/* Quick 1-tap Sr # shortcuts */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-[11px] font-semibold text-gray-500 mr-1">Quick Sr #:</span>
                {availableOutlets.slice(0, 8).map((o) => (
                  <button
                    key={o.ID}
                    type="button"
                    onClick={() => selectOutlet(o)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-bold transition-all border",
                      selectedOutletId === o.ID
                        ? "bg-red-600 text-white border-red-600 shadow-xs"
                        : "bg-white text-gray-700 border-gray-200 hover:border-red-400 hover:text-red-700 hover:bg-red-50"
                    )}
                  >
                    Sr #{o.SrNo || o.ID}
                  </button>
                ))}
              </div>

              {/* Search feedback when no match */}
              {srSearchFeedback && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>{srSearchFeedback}</span>
                </div>
              )}

              {/* Suggestions while typing */}
              {shopSrNoSearch.trim() && matchingOutlets.length > 0 && !selectedOutlet && (
                <div className="bg-white rounded-lg border border-red-200 shadow-sm overflow-hidden max-h-44 overflow-y-auto divide-y divide-gray-100">
                  <div className="p-1.5 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase px-3">
                    Found {matchingOutlets.length} Shop{matchingOutlets.length > 1 ? 's' : ''} &bull; Click to Select
                  </div>
                  {matchingOutlets.map((o) => (
                    <div
                      key={o.ID}
                      onClick={() => {
                        selectOutlet(o);
                        setShopSrNoSearch('');
                        setSrSearchFeedback(null);
                      }}
                      className="p-2.5 px-3 hover:bg-red-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="bg-red-600 text-white font-black px-1.5 py-0.5 rounded text-[10px]">
                          Sr #{o.SrNo || o.ID}
                        </span>
                        <span className="font-semibold text-gray-900">{o.Name}</span>
                        <span className="text-gray-400 text-[11px]">[{o.Code}]</span>
                      </div>
                      <span className="text-gray-500 text-[11px] font-medium">{o.Route}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Active Selected Shop Card */}
              {selectedOutlet ? (
                <div className="p-3 bg-white rounded-xl border-2 border-red-300 shadow-xs flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-red-600 text-white font-black px-2 py-0.5 rounded text-xs">
                        Sr #{selectedOutlet.SrNo || selectedOutlet.ID}
                      </span>
                      <span className="text-xs font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        [{selectedOutlet.Code}]
                      </span>
                      <h4 className="text-sm font-bold text-gray-900">
                        {selectedOutlet.Name}
                      </h4>
                    </div>
                    <p className="text-xs text-gray-600">
                      <strong>Route:</strong> {selectedOutlet.Route} &bull; <strong>Owner:</strong> {selectedOutlet.OwnerName || 'N/A'} &bull; <strong>Phone:</strong> {selectedOutlet.ContactNumber || 'N/A'}
                    </p>
                    {selectedOutlet.Address && (
                      <p className="text-[11px] text-gray-500">
                        {selectedOutlet.Address}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectOutlet(null)}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2.5 shrink-0 font-bold"
                  >
                    Change Shop
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase">
                    Or Select from All Shops List:
                  </label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    value={selectedOutletId}
                    onChange={handleOutletSelect}
                  >
                    <option value="">-- Choose Shop (or Custom / Unregistered) --</option>
                    {availableOutlets.map(o => (
                      <option key={o.ID} value={o.ID}>
                        Sr #{o.SrNo || o.ID} &bull; [{o.Code || '-'}] {o.Name} ({o.Route})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase">Outlet Name</label>
                <Input required placeholder="e.g. AA ENTERPRISES" value={outletName} onChange={e => setOutletName(e.target.value)} disabled={!!selectedOutletId} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase">Status / Type</label>
                <Input placeholder="e.g. General trader" value={status} onChange={e => setStatus(e.target.value)} disabled={!!selectedOutletId} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase">Route</label>
                <Input placeholder="e.g. RAILWAY + G SHAHU" value={route} onChange={e => setRoute(e.target.value)} disabled={!!selectedOutletId} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase">Address</label>
                <Input placeholder="e.g. RAILWAY STATION" value={address} onChange={e => setAddress(e.target.value)} disabled={!!selectedOutletId} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase">Contact Number</label>
                <Input placeholder="e.g. 0336-4574227" value={contactNumber} onChange={e => setContactNumber(e.target.value)} disabled={!!selectedOutletId} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase">Owner Name</label>
                <Input placeholder="e.g. SHARJEEL SB" value={ownerName} onChange={e => setOwnerName(e.target.value)} disabled={!!selectedOutletId} />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xs font-bold uppercase text-gray-700">Order Booker &amp; Delivery Man</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase">Order Booker</label>
                  <Input value={currentUser?.name || 'Order Booker'} readOnly />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase">Delivery Man Name</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    value={deliveryManName}
                    onChange={e => setDeliveryManName(e.target.value)}
                  >
                    <option value="">Select Delivery Man</option>
                    {deliveryManName && !deliveryMen.some(person => person.Name === deliveryManName) && (
                      <option value={deliveryManName}>{deliveryManName}</option>
                    )}
                    {deliveryMen.map(person => <option key={person.ID} value={person.Name}>{person.Name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-900">Items (Cases)</h3>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="gap-1">
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              </div>
              
              <div className="space-y-3">
                {orderItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="w-full sm:flex-1 space-y-2">
                      <label className="text-xs font-medium text-gray-500">Product</label>
                      <select 
                        className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        value={item.product}
                        onChange={e => handleUpdateItem(idx, 'product', e.target.value)}
                        required
                      >
                        <option value="" disabled>{inventory.length === 0 ? 'No products yet...' : 'Select product...'}</option>
                        {inventory.map(invItem => {
                          let optPrice = invItem.Price;
                          if (selectedOutlet && selectedOutlet.CustomRates && selectedOutlet.CustomRates[invItem.ID] !== undefined) {
                            optPrice = selectedOutlet.CustomRates[invItem.ID];
                          }
                          return (
                            <option key={invItem.ID} value={invItem.ID}>
                              {invItem.Name} (PKR {optPrice.toFixed(2)}) - Floor: {invItem.Quantity} cs
                            </option>
                          );
                        })}
                        {canEdit && <option value={ADD_NEW_PRODUCT}>+ Add new product...</option>}
                      </select>
                      {inventory.length === 0 && (
                        <p className="text-xs text-amber-700">
                          No products found. {canEdit ? 'Choose "+ Add new product..." to create one with its stock.' : 'Ask an admin to add products.'}
                        </p>
                      )}
                    </div>
                    <div className="w-full sm:w-32 space-y-2">
                      <label className="text-xs font-medium text-gray-500">Quantity (Cases)</label>
                      <Input 
                        type="number" 
                        min="1"
                        required
                        value={item.qty}
                        onChange={e => handleUpdateItem(idx, 'qty', Number(e.target.value))}
                      />
                    </div>
                    <div className="w-full sm:w-auto">
                      <Button type="button" variant="ghost" size="icon" className="text-red-500" onClick={() => handleRemoveItem(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {orderItems.length === 0 && (
                  <div className="text-center p-4 text-sm text-gray-500 bg-gray-50 rounded-lg">No items added.</div>
                )}
              </div>
            </div>

            {/* PROMOTIONAL SCHEME (Manual "Add Promo" Option) */}
            <div className="mt-4 p-3.5 rounded-xl border border-red-200 bg-red-50/70 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg text-red-700 shrink-0">
                    <Gift className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900 uppercase flex items-center gap-2">
                      <span>Promotional Scheme</span>
                      <span className="bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-xs">
                        1 Free 500ml PET
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Grant free promotional 500ml PET cases to this outlet (Rate: PKR 0.00).
                    </p>
                  </div>
                </div>

                {/* Add Promo Toggle Button */}
                <div className="flex items-center gap-2 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => setIsPromoEnabled(prev => !prev)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-xs border cursor-pointer",
                      isPromoEnabled
                        ? "bg-red-600 text-white border-red-700 hover:bg-red-700"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <Gift className={cn("h-3.5 w-3.5", isPromoEnabled ? "text-white" : "text-red-600")} />
                    <span>{isPromoEnabled ? "PROMO: APPLIED" : "+ ADD PROMO"}</span>
                  </button>
                </div>
              </div>

              {/* Status and Custom Quantity ("it depend on us what we give them") */}
              {isPromoEnabled ? (
                <div className="p-3 bg-white rounded-lg border border-red-200 space-y-2.5 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-red-600 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-red-950 block">
                          {promoSchemeTitle}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          Item: <strong>{product500ml.Name || 'WARSA 500ml'}</strong> &bull; Free of Cost (Rate: PKR 0.00)
                        </span>
                      </div>
                    </div>

                    {/* Quantity Stepper */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-gray-700 whitespace-nowrap">
                        Free Cases:
                      </label>
                      <div className="flex items-center border border-red-300 rounded-md overflow-hidden bg-red-50/50">
                        <button
                          type="button"
                          onClick={() => setPromoCasesCount(prev => Math.max(1, prev - 1))}
                          className="px-2.5 py-1 text-xs font-black text-red-800 hover:bg-red-200 transition-colors"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={promoCasesCount}
                          onChange={e => setPromoCasesCount(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-12 text-center text-xs font-black text-red-900 bg-white border-x border-red-300 py-1 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setPromoCasesCount(prev => prev + 1)}
                          className="px-2.5 py-1 text-xs font-black text-red-800 hover:bg-red-200 transition-colors"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[11px] font-bold text-red-700">cs</span>
                    </div>
                  </div>

                  <div className="text-[11px] bg-red-50 px-2.5 py-1.5 rounded border border-red-200 text-red-900 flex items-center justify-between">
                    <span>Invoice Line: <strong>{promoSchemeTitle}</strong></span>
                    <span className="font-bold text-red-700">Amount: PKR 0.00</span>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-white/70 rounded-lg border border-red-100 text-xs text-gray-500 flex items-center justify-between">
                  <span>No promo scheme attached. Click <strong>"+ ADD PROMO"</strong> to grant free promotional cases to this customer.</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPromoEnabled(true)}
                    className="text-xs text-red-700 hover:text-red-800 hover:bg-red-50 font-bold h-7 gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Promo
                  </Button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <div className="w-full sm:w-80 space-y-2.5">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Purchased Cases:</span>
                  <span className="font-bold text-gray-900">{totalPurchasedCases} cs</span>
                </div>

                {isPromoApplied && (
                  <div className="flex justify-between items-center text-xs text-red-800 bg-red-100/70 border border-red-300 px-2.5 py-1.5 rounded-lg font-bold">
                    <span className="flex items-center gap-1.5">
                      <Gift className="h-3.5 w-3.5 text-red-700" />
                      PROMO 500 ML (FREE):
                    </span>
                    <span className="text-red-700">+{freePromoCases} cs (Rs. 0.00)</span>
                  </div>
                )}

                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal Amount:</span>
                  <span className="font-semibold text-gray-900">PKR {totalAmount.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>Discount (PKR):</span>
                  <Input 
                    type="number" 
                    min="0"
                    className="w-28 h-8 text-right"
                    value={discount || ''}
                    onChange={e => setDiscount(Number(e.target.value))}
                  />
                </div>

                <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-slate-200">
                  <span>Grand Total:</span>
                  <span className="text-red-600 font-black">PKR {grandTotal.toFixed(2)}</span>
                </div>

                <div className="text-[11px] text-gray-500 text-right pt-0.5 font-medium">
                  {isPromoApplied ? (
                    <span className="text-emerald-700 font-bold">
                      Truck Dispatched Cases: {totalLoadedCases} cs (including {freePromoCases} free promo 500ml)
                    </span>
                  ) : (
                    <span>Total Dispatched Cases: {totalCases} cs</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-6">
              <Button type="button" variant="outline" onClick={() => { setIsRecording(false); setEditingSaleId(null); setDeliveryManName(''); setIsPromoEnabled(false); setPromoCasesCount(1); }}>Cancel</Button>
              <Button type="submit" disabled={regularItems.length === 0} className="bg-red-600 hover:bg-red-700 text-white">
                {editingSaleId ? "Update Order" : "Save & Book Order"}
              </Button>
            </div>
          </form>
        </ResponsiveDialog>

        <ResponsiveDialog
          isOpen={isAddProductOpen}
          onClose={() => { setIsAddProductOpen(false); setAddProductForIdx(null); }}
          title="Add Product & Stock"
        >
          <form onSubmit={handleSaveNewProduct} className="space-y-4 pb-12 md:pb-0">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Product Name <span className="text-red-600">*</span></label>
              <Input required value={newProduct.Name} placeholder="e.g. 500ML" onChange={e => setNewProduct({ ...newProduct, Name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">SKU Code</label>
                <Input value={newProduct.SKU} placeholder="Auto from name" onChange={e => setNewProduct({ ...newProduct, SKU: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Size / Volume</label>
                <Input value={newProduct.Size} placeholder="e.g. 500ml" onChange={e => setNewProduct({ ...newProduct, Size: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Price per Case (PKR)</label>
                <Input type="number" min="0" step="any" required value={newProduct.Price} onChange={e => setNewProduct({ ...newProduct, Price: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700">Bottles per Case</label>
                <Input type="number" min="1" value={newProduct.BottlesPerCase} onChange={e => setNewProduct({ ...newProduct, BottlesPerCase: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Opening Stock (Cases)</label>
              <Input type="number" min="0" value={newProduct.Stock} placeholder="0" onChange={e => setNewProduct({ ...newProduct, Stock: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setIsAddProductOpen(false); setAddProductForIdx(null); }}>Cancel</Button>
              <Button type="submit" disabled={isSavingProduct} className="bg-red-600 hover:bg-red-700 text-white font-bold">
                {isSavingProduct ? 'Saving...' : 'Save Product'}
              </Button>
            </div>
          </form>
        </ResponsiveDialog>

        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-3 border-b border-gray-100 px-4 md:px-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <CardTitle className="text-lg">Recent Orders & Drop Status</CardTitle>
                <p className="text-xs text-gray-500">Track delivery acceptance and update drop outcomes</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {!isBooker && orderBookersList.length > 0 && (
                  <select
                    value={salesmanBookerFilter}
                    onChange={(e) => setSalesmanBookerFilter(e.target.value)}
                    className="h-9 px-2.5 rounded-md border border-gray-300 text-xs bg-white font-semibold text-gray-700 focus:ring-1 focus:ring-red-500 shadow-sm"
                  >
                    <option value="ALL">All Order Bookers ({sales.length})</option>
                    {orderBookersList.map((ob) => (
                      <option key={ob} value={ob}>Booker: {ob}</option>
                    ))}
                  </select>
                )}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search shop, Sr No, invoice..."
                    className="pl-9 h-9 text-xs"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading orders...</div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3.5 font-semibold">Inv #</th>
                        <th className="px-5 py-3.5 font-semibold">Date</th>
                        <th className="px-5 py-3.5 font-semibold">Shop / Outlet</th>
                        <th className="px-5 py-3.5 font-semibold text-center">Cases (Booked / Accepted)</th>
                        <th className="px-5 py-3.5 font-semibold">Delivery Status</th>
                        <th className="px-5 py-3.5 font-semibold text-right">Actual Grand Total</th>
                        <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {filteredSales.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-gray-400 text-xs">
                            No orders found.
                          </td>
                        </tr>
                      ) : (
                        filteredSales.map((sale) => {
                          const status = sale.DeliveryStatus || 'DELIVERED';
                          const isRejected = status === 'REJECTED';
                          const deliveredCases = sale.DeliveredCases !== undefined ? sale.DeliveredCases : (isRejected ? 0 : sale.TotalCases);
                          const rejectedCases = sale.RejectedCases !== undefined ? sale.RejectedCases : (isRejected ? sale.TotalCases : 0);
                          const actualTotal = sale.ActualGrandTotal !== undefined ? sale.ActualGrandTotal : (isRejected ? 0 : sale.GrandTotal);

                          const saleOutlet = outlets.find(o => o.ID === sale.OutletID || o.Name.toLowerCase() === sale.OutletName.toLowerCase());
                          const outletSr = sale.OutletSrNo || saleOutlet?.SrNo || (saleOutlet ? saleOutlet.ID : null);

                          return (
                            <tr key={sale.ID} onClick={() => setSelectedInvoice(sale)} className="hover:bg-gray-50/50 transition-colors cursor-pointer">
                              <td className="px-5 py-3.5 font-bold text-red-600">#{sale.ID}</td>
                              <td className="px-5 py-3.5 text-xs text-gray-500">{format(new Date(sale.Date), 'dd MMM yyyy, h:mm a')}</td>
                              <td className="px-5 py-3.5 font-semibold text-gray-900">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {outletSr && (
                                    <span className="inline-flex items-center text-[10px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                      Sr #{outletSr}
                                    </span>
                                  )}
                                  <span>{sale.OutletName}</span>
                                  {sale.HasPromo && (
                                    <span className="inline-flex items-center text-[9px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                      +{sale.PromoFreeCases || 1} Free 500ml
                                    </span>
                                  )}
                                </div>
                                <span className="block text-[11px] font-normal text-gray-400">{sale.Route}</span>
                              </td>
                              <td className="px-5 py-3.5 text-center font-bold">
                                <span className="text-red-700">{deliveredCases} cs</span>
                                {sale.TotalCases !== deliveredCases && (
                                  <span className="text-xs font-normal text-gray-400"> / {sale.TotalCases} booked</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                {status === 'DELIVERED' && (
                                  <Badge className="bg-red-50 text-red-800 border border-red-200 text-[10px] hover:bg-red-50">
                                    <CheckCircle2 className="h-3 w-3 mr-1 text-red-600" /> Fully Accepted
                                  </Badge>
                                )}
                                {status === 'PARTIAL' && (
                                  <Badge className="bg-red-50 text-red-800 border border-red-200 text-[10px] hover:bg-red-50">
                                    <AlertTriangle className="h-3 w-3 mr-1 text-red-600" /> Partial ({rejectedCases} ret)
                                  </Badge>
                                )}
                                {status === 'REJECTED' && (
                                  <Badge variant="destructive" className="text-[10px]">
                                    <XCircle className="h-3 w-3 mr-1" /> Not Accepted ({sale.RejectionReason || 'Closed'})
                                  </Badge>
                                )}
                              </td>
                              <td className="px-5 py-3.5 font-black text-gray-900 text-right">
                                PKR {actualTotal.toLocaleString()}
                                {sale.GrandTotal !== actualTotal && (
                                  <span className="block text-[10px] line-through font-normal text-gray-400">
                                    Booked: PKR {sale.GrandTotal.toLocaleString()}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-end items-center gap-1">
                                  {canDrop ? (
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="h-7 text-[11px] px-2 border-slate-300 hover:bg-red-50 hover:text-red-700" 
                                      onClick={() => setSaleForDeliveryStatus(sale)}
                                    >
                                      <Truck className="h-3.5 w-3.5 mr-1" /> Drop
                                    </Button>
                                  ) : (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 text-[11px] px-2 text-blue-600 hover:text-blue-800 font-semibold" 
                                      onClick={() => setSaleForDeliveryStatus(sale)}
                                    >
                                      <Eye className="h-3.5 w-3.5 mr-1" /> View Intake
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={() => triggerPrint(sale)} title={invoiceLabel}>
                                    <Printer className="h-4 w-4 text-red-600 mr-1" /> {invoiceLabel}
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={() => setPrintedInvoiceToShow(sale)} title="Printed Invoice">
                                    <FileText className="h-3.5 w-3.5 text-slate-700 mr-1" /> Printed Invoice
                                  </Button>
                                  {canEdit && (isSuper || isBooker) && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(sale)} title="Edit Order">
                                      <Edit2 className="h-4 w-4 text-gray-600" />
                                    </Button>
                                  )}
                                  {isSuper && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => setSaleToDelete(sale.ID)} title="Delete Order">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 text-[11px] px-2 text-gray-700 hover:text-gray-900" 
                                    onClick={() => setSelectedInvoice(sale)}
                                  >
                                    <FileText className="h-3.5 w-3.5 mr-1" /> View Invoice
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden flex flex-col divide-y divide-gray-100">
                  {filteredSales.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-xs">No orders found.</div>
                  ) : (
                    filteredSales.map((sale) => {
                      const status = sale.DeliveryStatus || 'DELIVERED';
                      const isRejected = status === 'REJECTED';
                      const actualTotal = sale.ActualGrandTotal !== undefined ? sale.ActualGrandTotal : (isRejected ? 0 : sale.GrandTotal);

                      const saleOutlet = outlets.find(o => o.ID === sale.OutletID || o.Name.toLowerCase() === sale.OutletName.toLowerCase());
                      const outletSr = sale.OutletSrNo || saleOutlet?.SrNo || (saleOutlet ? saleOutlet.ID : null);

                      return (
                        <div key={sale.ID} onClick={() => setSelectedInvoice(sale)} className="p-4 flex flex-col gap-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {outletSr && (
                                  <span className="inline-flex items-center text-[10px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                    Sr #{outletSr}
                                  </span>
                                )}
                                <p className="font-bold text-gray-900">{sale.OutletName}</p>
                                {sale.HasPromo && (
                                  <span className="inline-flex items-center text-[9px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                    +{sale.PromoFreeCases || 1} Free 500ml
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">Inv #{sale.ID} • {format(new Date(sale.Date), 'dd MMM, h:mm a')}</p>
                            </div>
                            <Badge className={cn(
                              "text-[10px]",
                              status === 'DELIVERED' ? "bg-red-50 text-red-800 border border-red-200" : status === 'PARTIAL' ? "bg-red-50 text-red-800 border border-red-200" : "bg-red-100 text-red-800 border border-red-300"
                            )}>
                              {status === 'DELIVERED' ? 'Accepted' : status === 'PARTIAL' ? 'Partial' : 'Rejected'}
                            </Badge>
                          </div>

                          <div className="flex justify-between items-end pt-1 border-t border-gray-50">
                            <div>
                              <p className="text-xs text-gray-500">Cases: <strong className="text-gray-900">{sale.DeliveredCases ?? sale.TotalCases}</strong> / {sale.TotalCases}</p>
                              <p className="text-sm font-black text-gray-900">PKR {actualTotal.toLocaleString()}</p>
                            </div>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              {canDrop ? (
                                <Button variant="outline" size="sm" className="h-7 text-xs px-2 border-slate-300" onClick={() => setSaleForDeliveryStatus(sale)}>
                                  <Truck className="h-3 w-3 mr-1" /> Drop
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-blue-600 font-semibold" onClick={() => setSaleForDeliveryStatus(sale)}>
                                  <Eye className="h-3 w-3 mr-1" /> View Intake
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={() => triggerPrint(sale)} title={invoiceLabel}>
                                <Printer className="h-3.5 w-3.5 text-red-600 mr-1" /> {invoiceLabel}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={() => setPrintedInvoiceToShow(sale)} title="Printed Invoice">
                                <FileText className="h-3.5 w-3.5 text-slate-700 mr-1" /> Printed Invoice
                              </Button>
                              {canEdit && (isSuper || isBooker) && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-gray-600" onClick={() => handleEdit(sale)} title="Edit Order">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {isSuper && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-red-500 hover:text-red-700" onClick={() => setSaleToDelete(sale.ID)} title="Delete Order">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedInvoice && (
        <InvoiceDetailModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      )}

      {saleForDeliveryStatus && (
        <DeliveryStatusModal
          sale={saleForDeliveryStatus}
          isOpen={!!saleForDeliveryStatus}
          onClose={() => setSaleForDeliveryStatus(null)}
          onSuccess={loadData}
        />
      )}

      <ConfirmDialog
        isOpen={!!saleToDelete}
        title="Delete Order"
        description="Are you sure you want to delete this order? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setSaleToDelete(null)}
      />

      <DigitalInvoiceModal
        isOpen={!!invoiceToPrint}
        sale={invoiceToPrint}
        outlets={outlets}
        inventory={inventory}
        onClose={() => setInvoiceToPrint(null)}
        deliveryMen={deliveryMen}
        onDeliveryManChange={handleInvoiceDeliveryManChange}
      />

      <InvoicePrintModal
        isOpen={!!printedInvoiceToShow}
        sale={printedInvoiceToShow}
        outlets={outlets}
        inventory={inventory}
        onClose={() => setPrintedInvoiceToShow(null)}
        deliveryMen={deliveryMen}
        onDeliveryManChange={handleInvoiceDeliveryManChange}
      />

      <BookerLoadReportModal
        isOpen={isLoadReportOpen}
        onClose={() => setIsLoadReportOpen(false)}
        sales={sales}
        outlets={outlets}
        inventory={inventory}
        defaultBooker={isBooker ? currentUser?.name : (salesmanBookerFilter !== 'ALL' ? salesmanBookerFilter : 'ALL')}
        isOrderBookerOnly={isBooker}
      />

      <BulkDataModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        defaultTab="sales"
        onSuccess={loadData}
      />
    </>
  );
}