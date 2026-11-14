import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { 
  fetchInventory, 
  fetchSales, 
  fetchDispatchLoads, 
  saveDispatchLoad, 
  deleteDispatchLoad,
  fetchOutlets,
  fetchOrderBookers,
  addStockInward,
  recordReturnInspectionAndRestock,
  canModifyData,
  getCurrentUser,
  isOrderBooker,
  isSuperAdmin,
  canManageDeliveriesAndLoading,
  getUserAssignedRoutes
} from '@/src/api';
import { 
  InventoryItem, 
  SaleRecord, 
  DispatchLoad, 
  Outlet, 
  OrderBooker,
  DispatchLoadItem 
} from '@/src/types';
import { 
  Truck, 
  Plus, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Package, 
  Search, 
  Calendar, 
  Printer, 
  ArrowRight,
  Layers,
  Sparkles,
  Store,
  ChevronRight,
  Trash2,
  ShieldCheck,
  PackageCheck,
  PackageX,
  Clock,
  ShieldAlert,
  Eye
} from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { DeliveryStatusModal } from '@/src/components/DeliveryStatusModal';
import { BookerLoadReportModal } from '@/src/components/BookerLoadReportModal';
import { cn } from '@/src/lib/utils';

export function Dispatch() {
  const currentUser = getCurrentUser();
  const canEdit = canModifyData();
  const canManageDispatch = canEdit && canManageDeliveriesAndLoading(currentUser);
  const isSuper = isSuperAdmin(currentUser);
  const isBooker = isOrderBooker(currentUser);
  const assignedRoutes = getUserAssignedRoutes(currentUser);
  const handlePrintGatePass = () => {
    const cleanup = () => document.body.classList.remove('warsa-print-gate-pass');
    document.body.classList.add('warsa-print-gate-pass');
    window.addEventListener('afterprint', cleanup, { once: true });
    try {
      window.print();
    } catch (error) {
      cleanup();
      throw error;
    }
  };

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loads, setLoads] = useState<DispatchLoad[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [orderBookers, setOrderBookers] = useState<OrderBooker[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & State
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  
  // Dialogs
  const [isCreatingLoad, setIsCreatingLoad] = useState(false);
  const [isLoadSheetOpen, setIsLoadSheetOpen] = useState(false);
  const [isInwardDialogOpen, setIsInwardDialogOpen] = useState(false);
  const [selectedSaleForDelivery, setSelectedSaleForDelivery] = useState<SaleRecord | null>(null);
  const [loadToDelete, setLoadToDelete] = useState<string | null>(null);
  const [inspectingLoad, setInspectingLoad] = useState<DispatchLoad | null>(null);
  const [gatePassLoad, setGatePassLoad] = useState<DispatchLoad | null>(null);
  const [inspectionItems, setInspectionItems] = useState<{
    productId: string;
    productName: string;
    returnedQty: number;
    goodRestockQty: number;
    damagedQty: number;
    reason: string;
    notes?: string;
  }[]>([]);

  // New Load Form State
  const [newLoadRoute, setNewLoadRoute] = useState('');
  const [newLoadDriver, setNewLoadDriver] = useState('');
  const [newLoadVehicle, setNewLoadVehicle] = useState('');
  const [newLoadItems, setNewLoadItems] = useState<{ productID: string; qty: number }[]>([]);

  // Floor Inward Form State
  const [inwardProductId, setInwardProductId] = useState('');
  const [inwardQty, setInwardQty] = useState(100);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invData, salesData, loadsData, outletsData, obsData] = await Promise.all([
        fetchInventory(),
        fetchSales(),
        fetchDispatchLoads(),
        fetchOutlets(),
        fetchOrderBookers()
      ]);
      setInventory(invData);
      setSales(salesData.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime()));
      setLoads(loadsData.sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime()));
      setOutlets(outletsData);
      setOrderBookers(obsData);
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

  // Initialize new load items when opening dialog
  const handleOpenCreateLoad = () => {
    const todaysSales = sales.filter(s => isSameDay(parseISO(s.Date), parseISO(selectedDate)));
    
    // Group orders by product to auto calculate needed load
    const neededByProduct: Record<string, number> = {};
    todaysSales.forEach(s => {
      s.Items.forEach(i => {
        neededByProduct[i.ProductID] = (neededByProduct[i.ProductID] || 0) + (i.BookedQty || i.Quantity);
      });
    });

    const initialLoadItems = inventory.map(item => ({
      productID: item.ID,
      qty: neededByProduct[item.ID] || 0
    }));

    setNewLoadItems(initialLoadItems);
    setNewLoadRoute(todaysSales[0]?.Route || '');
    setNewLoadDriver(orderBookers[0]?.Name || '');
    setIsCreatingLoad(true);
  };

  const handleSaveLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = newLoadItems.filter(i => i.qty > 0);
    if (validItems.length === 0) {
      alert("Please specify load quantity for at least one product.");
      return;
    }

    const relevantSales = sales.filter(s => 
      isSameDay(parseISO(s.Date), parseISO(selectedDate)) &&
      (!newLoadRoute || s.Route.toLowerCase().includes(newLoadRoute.toLowerCase()))
    );

    const dispatchItems: DispatchLoadItem[] = validItems.map(item => {
      const p = inventory.find(inv => inv.ID === item.productID);
      // calculate booked qty from sales
      let bookedForProduct = 0;
      relevantSales.forEach(s => {
        const line = s.Items.find(i => i.ProductID === item.productID);
        if (line) bookedForProduct += (line.BookedQty || line.Quantity);
      });

      return {
        ProductID: item.productID,
        ProductName: p?.Name || 'Unknown Product',
        BookedQty: bookedForProduct || item.qty,
        LoadedQty: item.qty,
        ShortQty: Math.max(0, (bookedForProduct || item.qty) - item.qty),
        ExtraQty: Math.max(0, item.qty - (bookedForProduct || item.qty)),
        DispatchedQty: item.qty,
        DeliveredQty: 0,
        ReturnedQty: 0
      };
    });

    const totalLoaded = dispatchItems.reduce((a, b) => a + b.LoadedQty, 0);

    const loadRecord: DispatchLoad = {
      ID: Date.now().toString(),
      LoadNumber: `LD-${format(new Date(), 'yyMMdd')}-${Math.floor(100 + Math.random() * 900)}`,
      Date: selectedDate,
      Route: newLoadRoute || 'All Routes',
      DriverOrOB: newLoadDriver || 'Delivery Team',
      DriverName: newLoadDriver,
      VehicleNumber: newLoadVehicle || 'VAN-01',
      Status: 'DISPATCHED',
      SaleIDs: relevantSales.map(s => s.ID),
      Items: dispatchItems,
      TotalBookedCases: dispatchItems.reduce((a, b) => a + b.BookedQty, 0),
      TotalLoadedCases: totalLoaded,
      TotalDispatchedCases: totalLoaded,
      TotalDeliveredCases: 0,
      TotalReturnedCases: 0,
      RestockedToFloor: false,
      CreatedAt: new Date().toISOString()
    };

    await saveDispatchLoad(loadRecord);
    setIsCreatingLoad(false);
    loadData();
  };

  const handleOpenInspectionModal = (load: DispatchLoad) => {
    setInspectingLoad(load);
    setInspectionItems(
      load.Items.map(item => ({
        productId: item.ProductID,
        productName: item.ProductName,
        returnedQty: item.ReturnedQty || 0,
        goodRestockQty: item.ReturnedQty || 0,
        damagedQty: 0,
        reason: 'Vehicle Return / Undelivered',
        notes: ''
      }))
    );
  };

  const handleConfirmInspection = async () => {
    if (!inspectingLoad) return;
    await recordReturnInspectionAndRestock(inspectingLoad.ID, inspectionItems);
    setInspectingLoad(null);
    loadData();
  };

  const handleDeleteLoad = async () => {
    if (loadToDelete) {
      await deleteDispatchLoad(loadToDelete);
      setLoadToDelete(null);
      loadData();
    }
  };

  const handleAddInwardStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inwardProductId || inwardQty <= 0) return;
    const prod = inventory.find(p => p.ID === inwardProductId);
    if (prod) {
      await addStockInward({
        Date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
        SupplierSource: 'Factory Production',
        ProductID: prod.ID,
        ProductName: prod.Name,
        Quantity: inwardQty,
        Unit: prod.UnitType || 'Cases',
        BatchNumber: `BAT-${format(new Date(), 'yyyyMMdd')}`,
        ReceivedBy: 'Warehouse Incharge'
      });
    }
    setIsInwardDialogOpen(false);
    setInwardQty(100);
    loadData();
  };

  // Re-calculate dynamic dispatched vs delivered vs returns per load
  const enrichedLoads = loads.map(load => {
    const loadSales = sales.filter(s => load.SaleIDs.includes(s.ID));
    
    const deliveredMap: Record<string, number> = {};
    const returnedMap: Record<string, number> = {};
    let totalDelivered = 0;
    let totalRejected = 0;
    let totalCashCollected = 0;
    let totalDeliveredAmount = 0;

    loadSales.forEach(s => {
      const isRejected = s.DeliveryStatus === 'REJECTED';
      totalCashCollected += (s.CashCollected ?? (isRejected ? 0 : (s.ActualGrandTotal || s.GrandTotal)));
      totalDeliveredAmount += (s.ActualGrandTotal ?? (isRejected ? 0 : s.GrandTotal));

      s.Items.forEach(i => {
        const booked = i.BookedQty || i.Quantity;
        const d = i.DeliveredQty !== undefined ? i.DeliveredQty : (isRejected ? 0 : booked);
        const r = i.RejectedQty !== undefined ? i.RejectedQty : (isRejected ? booked : 0);
        deliveredMap[i.ProductID] = (deliveredMap[i.ProductID] || 0) + d;
        returnedMap[i.ProductID] = (returnedMap[i.ProductID] || 0) + r;
        totalDelivered += d;
        totalRejected += r;
      });
    });

    const updatedItems = load.Items.map(item => {
      const d = deliveredMap[item.ProductID] || 0;
      const loaded = item.LoadedQty || item.DispatchedQty;
      const r = Math.max(0, loaded - d);
      return {
        ...item,
        DeliveredQty: d,
        ReturnedQty: r
      };
    });

    const totalLoaded = load.Items.reduce((a, b) => a + (b.LoadedQty || b.DispatchedQty), 0);
    const calculatedReturned = Math.max(0, totalLoaded - totalDelivered);

    return {
      ...load,
      Items: updatedItems,
      TotalLoadedCases: totalLoaded,
      TotalDeliveredCases: totalDelivered,
      TotalReturnedCases: calculatedReturned,
      TotalCashCollected: totalCashCollected,
      TotalDeliveredAmount: totalDeliveredAmount,
      SalesCount: loadSales.length,
      DeliveredSalesCount: loadSales.filter(s => s.DeliveryStatus === 'DELIVERED').length,
      PartialSalesCount: loadSales.filter(s => s.DeliveryStatus === 'PARTIAL').length,
      RejectedSalesCount: loadSales.filter(s => s.DeliveryStatus === 'REJECTED').length,
    };
  });

  const totalFloorStock = inventory.reduce((a, b) => a + b.Quantity, 0);
  const totalInTransit = inventory.reduce((a, b) => a + (b.InTransitQuantity || 0), 0);
  const totalOpeningStock = inventory.reduce((a, b) => a + (b.OpeningStock ?? b.Quantity), 0);

  const filteredSalesForDate = sales.filter(s => 
    isSameDay(parseISO(s.Date), parseISO(selectedDate)) &&
    (s.OutletName.toLowerCase().includes(search.toLowerCase()) || s.ID.includes(search))
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-red-100 text-red-800">
              Delivery Operations
            </span>
            <span className="text-xs text-gray-500">Warehouse to Truck to Shop</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-1 flex items-center gap-2">
            <Truck className="h-7 w-7 text-red-600" /> Truck Loading & Deliveries
          </h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">
            Load bottles into trucks, deliver to shops, and check returned bottles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setIsLoadSheetOpen(true)}
            className="gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold h-10 shadow-xs cursor-pointer text-xs sm:text-sm"
            title="Delivery Truck Load Sheet & Outlet-Wise Orders (SKU-Wise: 500ml, 1.5L, 5L, 19L)"
          >
            <Truck className="h-4 w-4 text-white shrink-0" />
            <span>Truck Load Sheet</span>
          </Button>

          {!canEdit ? (
            <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-bold px-3 py-2 flex items-center gap-1.5 shadow-sm text-xs">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
              <span>Read-Only</span>
            </Badge>
          ) : canManageDispatch ? (
            <>
              <Button 
                variant="outline"
                onClick={() => {
                  if (inventory.length > 0) setInwardProductId(inventory[0].ID);
                  setIsInwardDialogOpen(true);
                }} 
                className="gap-1.5 text-gray-700 bg-white font-semibold text-xs sm:text-sm h-10"
              >
                <Plus className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Stock Inward</span>
              </Button>
              <Button onClick={handleOpenCreateLoad} className="gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm h-10 shadow-xs">
                <Truck className="h-4 w-4 shrink-0" />
                <span>Create Load</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* ASM Read-Only Banner */}
      {!canEdit && (
        <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-xl flex items-center justify-between gap-3 text-amber-950 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Area Sales Manager (ASM) Read-Only Inspection:</strong> You can inspect vehicle load sheets, delivery drop outcomes, gate passes, and returned bottle tallies. Creating loads, updating drop delivery outcomes, and restocking warehouse floor are restricted.
            </span>
          </div>
          <Badge className="bg-amber-200 text-amber-950 font-bold hover:bg-amber-200 border-none shrink-0">
            Read-Only
          </Badge>
        </div>
      )}

      {/* Order Booker Info Banner */}
      {isBooker && (
        <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl flex items-center justify-between gap-3 text-blue-950 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <Truck className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <span>
              <strong>Order Booker View:</strong> Truck loading and physical dispatches are executed by the Salesman / Warehouse Delivery Incharge. You have full visibility into loaded stock and delivery status for your route (<strong>{assignedRoutes.join(', ') || 'Assigned Route'}</strong>).
            </span>
          </div>
          <Badge className="bg-blue-100 text-blue-800 font-bold border-none shrink-0">
            Delivery Tracking
          </Badge>
        </div>
      )}

      {/* Floor Stock & In-Transit Live Balance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-gray-500 block">1. Morning Stock (Opening)</span>
            <div className="text-xl md:text-2xl font-black text-gray-900 mt-1">{totalOpeningStock.toLocaleString()} cs</div>
            <span className="text-[11px] text-gray-400">At Start of Day</span>
          </CardContent>
        </Card>

        <Card className="border-amber-200 shadow-sm bg-amber-50/40">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-amber-800 block">2. Stock in Trucks</span>
            <div className="text-xl md:text-2xl font-black text-amber-800 mt-1">{totalInTransit.toLocaleString()} cs</div>
            <span className="text-[11px] text-amber-600 font-medium">Loaded & on delivery routes</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 shadow-sm bg-emerald-50/40">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-emerald-800 block">3. Warehouse Stock (Available)</span>
            <div className="text-xl md:text-2xl font-black text-emerald-800 mt-1">{totalFloorStock.toLocaleString()} cs</div>
            <span className="text-[11px] text-emerald-600 font-medium">Physically in warehouse now</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-gray-500 block">Operations Date</span>
            <Input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)} 
              className="h-8 font-bold text-gray-900 bg-white mt-1 text-xs"
            />
          </CardContent>
        </Card>
      </div>

      {/* Active Vehicle Dispatch Loads */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Truck className="h-5 w-5 text-red-600" /> Active Vehicle Dispatch Loads ({enrichedLoads.length})
          </h2>
          <span className="text-xs text-gray-500">
            Deducts from Floor Stock upon dispatch
          </span>
        </div>

        {enrichedLoads.length === 0 ? (
          <Card className="p-8 text-center bg-white border-dashed">
            <Truck className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-gray-700">No active dispatch loads for {selectedDate}</h3>
            <p className="text-xs text-gray-400 mt-1">Create a load sheet to dispatch vehicles to routes.</p>
            <Button onClick={handleOpenCreateLoad} size="sm" className="mt-3 bg-red-600 text-white font-bold">
              Create First Load
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {enrichedLoads.map(load => (
              <Card key={load.ID} className="bg-white border-gray-200 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-sm text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        {load.LoadNumber}
                      </span>
                      <span className="text-xs font-bold text-gray-700">{load.Route}</span>
                      <Badge className={cn(
                        "text-[10px] uppercase font-bold",
                        load.Status === 'CLOSED' ? "bg-red-700 text-white" :
                        load.Status === 'RETURNING' ? "bg-amber-100 text-amber-800" :
                        "bg-emerald-100 text-emerald-800"
                      )}>
                        {load.Status}
                      </Badge>
                      {load.RestockedToFloor && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                          <CheckCircle2 className="h-3 w-3" /> Returns Restocked
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Vehicle: <strong className="text-gray-800">{load.VehicleNumber}</strong> • Booker/Driver: <strong className="text-gray-800">{load.DriverName || load.DriverOrOB}</strong> • Date: {load.Date}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setGatePassLoad(load)}
                      className="text-xs gap-1 h-8 border-gray-300 hover:text-red-700 hover:border-red-300"
                    >
                      <Printer className="h-3.5 w-3.5 text-red-600" /> Print Gate Pass
                    </Button>
                    {canManageDispatch && load.Status !== 'CLOSED' && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenInspectionModal(load)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-bold h-8"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Check Returns & Restock
                      </Button>
                    )}
                    {isSuper && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLoadToDelete(load.ID)}
                        className="text-red-500 hover:text-red-700 h-8 w-8 p-0"
                        title="Delete Load"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 bg-white border-b border-gray-100 text-center">
                  <div className="p-2.5 rounded bg-gray-50">
                    <span className="text-[11px] font-semibold text-gray-500 block">Total Loaded</span>
                    <span className="text-base font-black text-gray-900">{load.TotalLoadedCases} cs</span>
                  </div>
                  <div className="p-2.5 rounded bg-emerald-50">
                    <span className="text-[11px] font-semibold text-emerald-700 block">Delivered to Shops</span>
                    <span className="text-base font-black text-emerald-800">{load.TotalDeliveredCases} cs</span>
                  </div>
                  <div className="p-2.5 rounded bg-red-50">
                    <span className="text-[11px] font-semibold text-red-700 block">Returned Bottles</span>
                    <span className="text-base font-black text-red-800">{load.TotalReturnedCases} cs</span>
                  </div>
                  <div className="p-2.5 rounded bg-emerald-50">
                    <span className="text-[11px] font-semibold text-emerald-800 block">Cash Collected</span>
                    <span className="text-base font-black text-emerald-900">PKR {load.TotalCashCollected.toLocaleString()}</span>
                  </div>
                  <div className="p-2.5 rounded bg-blue-50">
                    <span className="text-[11px] font-semibold text-blue-800 block">Shops on Route</span>
                    <span className="text-base font-black text-blue-900">{load.SalesCount} Shops</span>
                  </div>
                </div>

                {/* Itemized Table per Load */}
                <div className="p-0 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase font-semibold border-b border-gray-100">
                      <tr>
                        <th className="p-3">Product SKU</th>
                        <th className="p-3 text-right">Loaded Qty</th>
                        <th className="p-3 text-right text-emerald-700">Delivered Qty</th>
                        <th className="p-3 text-right text-red-600">Remaining on Truck</th>
                        <th className="p-3 text-center">Restock Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {load.Items.map(item => (
                        <tr key={item.ProductID}>
                          <td className="p-3 font-bold text-gray-900">{item.ProductName}</td>
                          <td className="p-3 text-right font-black text-gray-900">{item.LoadedQty || item.DispatchedQty} cs</td>
                          <td className="p-3 text-right font-bold text-emerald-700">{item.DeliveredQty} cs</td>
                          <td className="p-3 text-right font-bold text-red-600">{item.ReturnedQty} cs</td>
                          <td className="p-3 text-center">
                            {load.RestockedToFloor ? (
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                Restocked / Quarantined
                              </span>
                            ) : item.ReturnedQty > 0 ? (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                Pending Warehouse Inspection
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                Fully Delivered
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Outlet Delivery Execution & Drop Sheet */}
      <Card className="shadow-sm border-gray-200 bg-white">
        <CardHeader className="py-3.5 px-4 md:px-6 bg-gray-50/60 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Store className="h-5 w-5 text-red-600" /> Outlet Delivery Drops & Spot Intake Recording
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Record actual deliveries per shop. Track unaccepted or returned stock with reasons.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search outlet or invoice..."
              className="pl-9 h-9 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredSalesForDate.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs">
                No booked orders found for {format(parseISO(selectedDate), 'dd MMM yyyy')}.
              </div>
            ) : (
              filteredSalesForDate.map((sale) => {
                const status = sale.DeliveryStatus || 'DELIVERED';
                const isRejected = status === 'REJECTED';
                const deliveredCases = sale.DeliveredCases !== undefined ? sale.DeliveredCases : (isRejected ? 0 : sale.TotalCases);
                const rejectedCases = sale.RejectedCases !== undefined ? sale.RejectedCases : (isRejected ? sale.TotalCases : 0);
                const actualTotal = sale.ActualGrandTotal !== undefined ? sale.ActualGrandTotal : (isRejected ? 0 : sale.GrandTotal);

                return (
                  <div key={sale.ID} className="p-4 space-y-3 bg-white hover:bg-gray-50/50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-red-600 font-mono text-xs">#{sale.ID}</span>
                          <span className="text-xs text-gray-500 font-medium">{sale.Route}</span>
                        </div>
                        <h4 className="font-bold text-gray-900 text-sm mt-0.5">{sale.OutletName}</h4>
                        <p className="text-xs text-gray-400">{sale.Address}</p>
                      </div>
                      <div>
                        {status === 'DELIVERED' && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Delivered
                          </span>
                        )}
                        {status === 'PARTIAL' && (
                          <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-xs bg-amber-50 px-2.5 py-1 rounded-full">
                            <AlertTriangle className="h-3 w-3 text-amber-600" /> Partial
                          </span>
                        )}
                        {status === 'REJECTED' && (
                          <span className="inline-flex items-center gap-1 text-red-800 font-bold text-xs bg-red-100 px-2.5 py-1 rounded-full">
                            <XCircle className="h-3 w-3 text-red-600" /> Rejected
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-gray-50 p-2.5 rounded-lg text-center text-xs">
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-semibold block">Booked</span>
                        <span className="font-bold text-gray-800">{sale.TotalCases} cs</span>
                      </div>
                      <div>
                        <span className="text-emerald-700 text-[10px] uppercase font-semibold block">Accepted</span>
                        <span className="font-bold text-emerald-700">{deliveredCases} cs</span>
                      </div>
                      <div>
                        <span className="text-red-700 text-[10px] uppercase font-semibold block">Returned</span>
                        <span className="font-bold text-red-700">{rejectedCases} cs</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-[10px] text-gray-400 block font-medium">Delivered Total</span>
                        <span className="font-black text-gray-900 text-sm">PKR {actualTotal.toLocaleString()}</span>
                      </div>
                      {canManageDispatch ? (
                        <Button
                          size="sm"
                          onClick={() => setSelectedSaleForDelivery(sale)}
                          className="text-xs h-8 px-3 font-bold bg-red-600 hover:bg-red-700 text-white"
                        >
                          Update Drop
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedSaleForDelivery(sale)}
                          className="text-xs h-8 px-2.5 font-semibold text-blue-600 hover:text-blue-800"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> View Intake
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100 font-bold">
                <tr>
                  <th className="px-4 py-3">Inv #</th>
                  <th className="px-4 py-3">Outlet Name</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3 text-center">Booked</th>
                  <th className="px-4 py-3 text-center">Accepted</th>
                  <th className="px-4 py-3 text-center">Returned</th>
                  <th className="px-4 py-3">Outcome Status & Reason</th>
                  <th className="px-4 py-3 text-right">Actual Realized Billed</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white font-medium">
                {filteredSalesForDate.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-400 text-xs">
                      No booked orders found for {format(parseISO(selectedDate), 'dd MMM yyyy')}.
                    </td>
                  </tr>
                ) : (
                  filteredSalesForDate.map((sale) => {
                    const status = sale.DeliveryStatus || 'DELIVERED';
                    const isRejected = status === 'REJECTED';
                    const deliveredCases = sale.DeliveredCases !== undefined ? sale.DeliveredCases : (isRejected ? 0 : sale.TotalCases);
                    const rejectedCases = sale.RejectedCases !== undefined ? sale.RejectedCases : (isRejected ? sale.TotalCases : 0);
                    const actualTotal = sale.ActualGrandTotal !== undefined ? sale.ActualGrandTotal : (isRejected ? 0 : sale.GrandTotal);

                    return (
                      <tr key={sale.ID} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3.5 font-bold text-red-600 font-mono text-xs">#{sale.ID}</td>
                        <td className="px-4 py-3.5 font-semibold text-gray-900">
                          {sale.OutletName}
                          <span className="block text-[11px] font-normal text-gray-400 truncate max-w-xs">{sale.Address}</span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500">{sale.Route}</td>
                        <td className="px-4 py-3.5 text-center font-bold text-gray-700">{sale.TotalCases} cs</td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs">
                            {deliveredCases} cs
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {rejectedCases > 0 ? (
                            <span className="font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded text-xs">
                              {rejectedCases} cs
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {status === 'DELIVERED' && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs bg-emerald-50 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Accepted
                            </span>
                          )}
                          {status === 'PARTIAL' && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-amber-800 font-semibold text-xs bg-amber-50 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Partial Intake
                              </span>
                              {sale.RejectionReason && (
                                <span className="block text-[10px] text-gray-500 font-medium">
                                  {sale.RejectionReason}
                                </span>
                              )}
                            </div>
                          )}
                          {status === 'REJECTED' && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-red-800 font-semibold text-xs bg-red-100 px-2 py-0.5 rounded-full">
                                <XCircle className="h-3.5 w-3.5 text-red-600" /> Rejected / Returned
                              </span>
                              <span className="block text-[10px] text-red-600 font-bold">
                                {sale.RejectionReason || 'Shop Closed'}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-black text-gray-900">
                          PKR {actualTotal.toLocaleString()}
                          {sale.GrandTotal !== actualTotal && (
                            <span className="block text-[10px] line-through font-normal text-gray-400">
                              Booked: {sale.GrandTotal.toLocaleString()}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {canManageDispatch ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedSaleForDelivery(sale)}
                              className="text-xs h-8 px-2.5 font-bold border-gray-300 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                            >
                              Update Drop
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedSaleForDelivery(sale)}
                              className="text-xs h-8 px-2.5 font-semibold text-blue-600 hover:text-blue-800"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View Intake
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL: RETURN INSPECTION & RESTOCKING */}
      <ResponsiveDialog
        open={Boolean(inspectingLoad)}
        onOpenChange={(open) => !open && setInspectingLoad(null)}
        title="Check & Restock Returned Bottles"
        subtitle={inspectingLoad ? `Truck Load #${inspectingLoad.LoadNumber} (${inspectingLoad.Route}) • Total Returned: ${inspectingLoad.TotalReturnedCases} Cases` : undefined}
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>Warehouse Rule:</strong> Good bottles go back into warehouse stock. Broken or leaking bottles go to damaged stock.
          </div>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {inspectionItems.map((item, idx) => (
              <div key={item.productId} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900 text-sm">{item.productName}</span>
                  <span className="text-xs font-bold text-red-600">Total Returned: {item.returnedQty} cs</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-emerald-700 block mb-1">
                      Good Bottles (Put Back in Stock)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max={item.returnedQty}
                      value={item.goodRestockQty}
                      onChange={(e) => {
                        const good = Number(e.target.value);
                        const damaged = Math.max(0, item.returnedQty - good);
                        const next = [...inspectionItems];
                        next[idx].goodRestockQty = good;
                        next[idx].damagedQty = damaged;
                        setInspectionItems(next);
                      }}
                      className="text-xs font-bold text-emerald-800 bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-red-700 block mb-1">
                      Broken / Leaking (Damaged)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max={item.returnedQty}
                      value={item.damagedQty}
                      onChange={(e) => {
                        const damaged = Number(e.target.value);
                        const good = Math.max(0, item.returnedQty - damaged);
                        const next = [...inspectionItems];
                        next[idx].damagedQty = damaged;
                        next[idx].goodRestockQty = good;
                        setInspectionItems(next);
                      }}
                      className="text-xs font-bold text-red-800 bg-white"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setInspectingLoad(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmInspection} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
              Save & Close Truck Load
            </Button>
          </div>
        </div>
      </ResponsiveDialog>

      {/* MODAL: VIEW & PRINT GATE PASS */}
      <ResponsiveDialog
        open={Boolean(gatePassLoad)}
        onOpenChange={(open) => !open && setGatePassLoad(null)}
        title={gatePassLoad ? `Gate Pass & Loading Voucher #${gatePassLoad.LoadNumber}` : 'Gate Pass'}
        subtitle="Official warehouse dispatch pass for security check and vehicle loading"
      >
        {gatePassLoad && (
          <div className="space-y-4">
            <div id="printable-gate-pass" className="p-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 space-y-3 font-mono text-xs">
              <div className="text-center pb-2 border-b border-gray-200">
                <h3 className="text-base font-black text-gray-900 tracking-wider">WARSA BEVERAGES (PVT) LTD</h3>
                <p className="text-gray-500 text-[11px]">VEHICLE GATE DISPATCH PASS & LOAD VOUCHER</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-gray-700">
                <div><strong>Pass #:</strong> GP-{gatePassLoad.LoadNumber}</div>
                <div><strong>Date:</strong> {gatePassLoad.Date}</div>
                <div><strong>Vehicle:</strong> {gatePassLoad.VehicleNumber}</div>
                <div><strong>Route:</strong> {gatePassLoad.Route}</div>
                <div className="col-span-2"><strong>Driver / Booker:</strong> {gatePassLoad.DriverName || gatePassLoad.DriverOrOB}</div>
              </div>

              <div className="pt-2 border-t border-gray-200">
                <span className="font-bold text-gray-900 block mb-1">Loaded Products:</span>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-300 text-gray-500 font-bold">
                      <th className="py-1">Item Description</th>
                      <th className="py-1 text-right">Loaded Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {gatePassLoad.Items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-1">{item.ProductName}</td>
                        <td className="py-1 text-right font-bold">{item.LoadedQty || item.DispatchedQty} cs</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-black border-t border-gray-300">
                      <td className="pt-1.5">Total Loaded</td>
                      <td className="pt-1.5 text-right font-black text-red-600">{gatePassLoad.TotalLoadedCases} Cases</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="pt-4 grid grid-cols-2 gap-4 text-center border-t border-gray-200 text-[10px] text-gray-500">
                <div className="border-t border-gray-300 pt-1">
                  Warehouse Incharge Signature
                </div>
                <div className="border-t border-gray-300 pt-1">
                  Security Gate Out Stamp
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setGatePassLoad(null)}>
                Close
              </Button>
              <Button 
                onClick={handlePrintGatePass}
                className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
              >
                <Printer className="h-4 w-4" /> Print Gate Pass
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>

      {/* Create New Load Dispatch Modal */}
      <ResponsiveDialog
        open={isCreatingLoad}
        onOpenChange={setIsCreatingLoad}
        title="Create New Dispatch Load Sheet"
        subtitle="Select vehicle, driver, and stock quantities to load from warehouse floor"
      >
        <form onSubmit={handleSaveLoad} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600 uppercase">Route</label>
              <Input
                required
                placeholder="e.g. RAILWAY + G SHAHU"
                value={newLoadRoute}
                onChange={(e) => setNewLoadRoute(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600 uppercase">Driver / Order Booker</label>
              <select
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                value={newLoadDriver}
                onChange={(e) => setNewLoadDriver(e.target.value)}
              >
                <option value="">-- Select Booker / Driver --</option>
                {orderBookers.map(ob => (
                  <option key={ob.ID} value={ob.Name}>{ob.Name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600 uppercase">Vehicle No.</label>
              <Input
                placeholder="e.g. LEA-4920 / Van 1"
                value={newLoadVehicle}
                onChange={(e) => setNewLoadVehicle(e.target.value)}
              />
            </div>
          </div>

          {/* Product Qty to Load */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase text-gray-700 tracking-wider">
                Cases To Load From Warehouse Floor
              </label>
              <span className="text-xs text-gray-500">Live floor balance shown</span>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 text-gray-600 uppercase font-semibold border-b border-gray-200">
                  <tr>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3 text-center">Available on Floor</th>
                    <th className="py-2.5 px-3 text-right w-32">Load Quantity (cs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {newLoadItems.map((item, idx) => {
                    const p = inventory.find(inv => inv.ID === item.productID);
                    const avail = p?.Quantity || 0;
                    return (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-semibold text-gray-900">
                          {p?.Name}
                          <span className="block text-[10px] text-gray-400">{p?.SKU}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[11px] font-bold",
                            avail <= 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
                          )}>
                            {avail} cs
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Input
                            type="number"
                            min="0"
                            value={item.qty || ''}
                            onChange={(e) => {
                              const updated = [...newLoadItems];
                              updated[idx].qty = parseInt(e.target.value) || 0;
                              setNewLoadItems(updated);
                            }}
                            className="h-8 w-24 text-right text-xs font-bold text-gray-900 ml-auto"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
            <span className="text-gray-600 font-medium">Total Dispatch Cases:</span>
            <span className="text-base font-black text-gray-900">
              {newLoadItems.reduce((a, b) => a + (b.qty || 0), 0)} Cases
            </span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsCreatingLoad(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2">
              <Truck className="h-4 w-4" /> Confirm & Dispatch Load
            </Button>
          </div>
        </form>
      </ResponsiveDialog>

      {/* Add Inward Stock Modal */}
      <ResponsiveDialog
        open={isInwardDialogOpen}
        onOpenChange={setIsInwardDialogOpen}
        title="Add Floor Stock Inward (Production / Restock)"
        subtitle="Direct intake of fresh packaged stock to warehouse floor"
      >
        <form onSubmit={handleAddInwardStock} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase">Select Product</label>
            <select
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={inwardProductId}
              onChange={(e) => setInwardProductId(e.target.value)}
              required
            >
              {inventory.map(item => (
                <option key={item.ID} value={item.ID}>
                  {item.Name} (Current Floor Stock: {item.Quantity})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase">Quantity To Add (Cases)</label>
            <Input
              type="number"
              min="1"
              required
              value={inwardQty}
              onChange={(e) => setInwardQty(parseInt(e.target.value) || 0)}
              className="h-10 text-base font-bold"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsInwardDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2">
              <Plus className="h-4 w-4" /> Add to Live Floor Stock
            </Button>
          </div>
        </form>
      </ResponsiveDialog>

      {/* Delivery Drop Resolution Modal */}
      {selectedSaleForDelivery && (
        <DeliveryStatusModal
          sale={selectedSaleForDelivery}
          isOpen={!!selectedSaleForDelivery}
          onClose={() => setSelectedSaleForDelivery(null)}
          onSuccess={loadData}
        />
      )}

      {/* Confirm Delete Load Dialog */}
      <ConfirmDialog
        open={Boolean(loadToDelete)}
        onOpenChange={(open) => !open && setLoadToDelete(null)}
        onConfirm={handleDeleteLoad}
        title="Delete Dispatch Load"
        description="Are you sure you want to delete this dispatch load? Note that this will not automatically reverse stock if already reconciled."
      />

      {/* Delivery Truck Load Sheet & Outlet-Wise Orders Modal */}
      {isLoadSheetOpen && (
        <BookerLoadReportModal
          isOpen={isLoadSheetOpen}
          onClose={() => setIsLoadSheetOpen(false)}
          sales={sales}
          outlets={outlets}
          inventory={inventory}
        />
      )}
    </div>
  );
}
