import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { 
  fetchInventory, 
  saveInventoryItem, 
  deleteInventoryItem, 
  addStockInward, 
  fetchStockMovements, 
  fetchStockInwardRecords,
  getCurrentRole,
  canModifyData
} from '@/src/api';
import { InventoryItem, StockMovementRecord, StockInwardRecord } from '@/src/types';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Eye,
  AlertCircle, 
  Layers, 
  Truck, 
  Sparkles, 
  Package, 
  ArrowDownToLine, 
  History, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowRight, 
  Filter,
  Printer
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { GoogleSheetSyncStatus } from '@/src/components/GoogleSheetSyncStatus';
import { format } from 'date-fns';

export function Inventory() {
  const canEdit = canModifyData();
  const [activeTab, setActiveTab] = useState<'floor' | 'inward' | 'movements' | 'damaged'>('floor');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [inwardRecords, setInwardRecords] = useState<StockInwardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [historyDate, setHistoryDate] = useState('');
  const handlePrintStock = () => {
    const print = () => {
      const cleanup = () => document.body.classList.remove('warsa-print-stock-list');
      document.body.classList.add('warsa-print-stock-list');
      window.addEventListener('afterprint', cleanup, { once: true });
      try {
        window.print();
      } catch (error) {
        cleanup();
        throw error;
      }
    };

    if (activeTab === 'floor') {
      print();
    } else {
      setActiveTab('floor');
      window.setTimeout(print, 100);
    }
  };
  const [movementFilter, setMovementFilter] = useState('ALL');

  // Product edit modal
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<InventoryItem>>({});

  // Stock Inward modal
  const [isInwardModalOpen, setIsInwardModalOpen] = useState(false);
  const [inwardForm, setInwardForm] = useState({
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
    supplierSource: 'WARSA Pure Water Plant',
    productId: '',
    quantity: 100,
    unit: 'Cases / Cartons',
    batchNumber: `BAT-${format(new Date(), 'yyyyMMdd')}`,
    referenceNumber: '',
    remarks: '',
    receivedBy: 'Warehouse Incharge'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [invData, movData, inwData] = await Promise.all([
        fetchInventory(),
        fetchStockMovements(),
        fetchStockInwardRecords()
      ]);
      setInventory(invData);
      setMovements(movData);
      setInwardRecords(inwData);
      if (invData.length > 0 && !inwardForm.productId) {
        setInwardForm(prev => ({ ...prev, productId: invData[0].ID }));
      }
    } catch (err) {
      console.error('Error loading inventory data:', err);
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

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem.Name || !editingItem.SKU) return;
    
    const qty = Number(editingItem.Quantity) || 0;
    const itemToSave: InventoryItem = {
      ID: editingItem.ID || Date.now().toString(),
      Name: editingItem.Name,
      SKU: editingItem.SKU,
      Size: editingItem.Size || 'Standard',
      UnitType: editingItem.UnitType || 'Case / Carton',
      BottlesPerCase: Number(editingItem.BottlesPerCase) || 24,
      Quantity: qty,
      OpeningStock: editingItem.OpeningStock !== undefined ? Number(editingItem.OpeningStock) : qty,
      StockAdded: editingItem.StockAdded || 0,
      StockDispatched: editingItem.StockDispatched || 0,
      StockReturned: editingItem.StockReturned || 0,
      StockDamaged: editingItem.StockDamaged || 0,
      Price: Number(editingItem.Price) || 0,
      MinThreshold: Number(editingItem.MinThreshold) || 0,
      LastUpdated: new Date().toISOString()
    };

    await saveInventoryItem(itemToSave);
    setIsEditing(false);
    setEditingItem({});
    loadData();
  };

  const handleDeleteProduct = async () => {
    if (itemToDelete) {
      await deleteInventoryItem(itemToDelete);
      setItemToDelete(null);
      loadData();
    }
  };

  const handleStockInwardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inwardForm.productId || inwardForm.quantity <= 0) return;

    const selectedProduct = inventory.find(p => p.ID === inwardForm.productId);
    if (!selectedProduct) return;

    await addStockInward({
      Date: inwardForm.date,
      SupplierSource: inwardForm.supplierSource,
      ProductID: selectedProduct.ID,
      ProductName: selectedProduct.Name,
      Quantity: Number(inwardForm.quantity),
      Unit: inwardForm.unit,
      BatchNumber: inwardForm.batchNumber,
      ReferenceNumber: inwardForm.referenceNumber || `INW-${Date.now()}`,
      Remarks: inwardForm.remarks,
      ReceivedBy: inwardForm.receivedBy || getCurrentRole()
    });

    setIsInwardModalOpen(false);
    setInwardForm(prev => ({
      ...prev,
      quantity: 100,
      referenceNumber: '',
      remarks: ''
    }));
    loadData();
  };

  const totalFloorStock = inventory.reduce((a, b) => a + b.Quantity, 0);
  const totalInTransit = inventory.reduce((a, b) => a + (b.InTransitQuantity || 0), 0);
  const totalOpening = inventory.reduce((a, b) => a + (b.OpeningStock ?? b.Quantity), 0);
  const totalDamaged = inventory.reduce((a, b) => a + (b.StockDamaged || 0), 0);

  const filteredInventory = inventory.filter(item => 
    item.Name.toLowerCase().includes(search.toLowerCase()) || 
    item.SKU.toLowerCase().includes(search.toLowerCase())
  );

  const filteredInwardRecords = inwardRecords.filter(record =>
    !historyDate || String(record.Date || '').slice(0, 10) === historyDate
  );

  const filteredMovements = movements.filter(m => {
    if (historyDate && String(m.Date || '').slice(0, 10) !== historyDate) return false;
    if (movementFilter !== 'ALL' && m.Type !== movementFilter) return false;
    if (search && !m.ProductName.toLowerCase().includes(search.toLowerCase()) && !m.User.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-red-100 text-red-800">
              Warehouse Stock
            </span>
            <span className="text-xs text-gray-500">Stock in Warehouse</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 mt-1">
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Package className="h-7 w-7 text-red-600" /> Warehouse Stock &amp; Products
            </h1>
            <GoogleSheetSyncStatus variant="badge" className="shrink-0" />
          </div>
          <p className="text-xs md:text-sm text-gray-500 mt-1">
            Track bottle stock in warehouse, add new stock, and view stock history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline"
            onClick={handlePrintStock}
            className="gap-2 border-gray-300 text-gray-700 font-semibold"
          >
            <Printer className="h-4 w-4 text-red-600" /> Print Stock Value
          </Button>
          {!canEdit ? (
            <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-bold px-3 py-2 flex items-center gap-1.5 shadow-sm">
              <ShieldAlert className="h-4 w-4 text-amber-600" /> Read-Only (ASM Restricted)
            </Badge>
          ) : (
            <>
              <Button 
                onClick={() => setIsInwardModalOpen(true)} 
                className="gap-2 bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                <ArrowDownToLine className="h-4 w-4" /> Add Stock (Stock In)
              </Button>
              <Button 
                onClick={() => { setEditingItem({}); setIsEditing(true); }} 
                variant="outline"
                className="gap-2 border-red-200 text-red-700 hover:bg-red-50 font-semibold"
              >
                <Plus className="h-4 w-4 text-red-600" /> Add New Product
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ASM Read-Only Banner */}
      {!canEdit && (
        <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl flex items-center justify-between gap-3 text-red-950 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span>
              <strong>Area Sales Manager (ASM) Read-Only Inspection:</strong> You have full visibility into live stock balances, inward shipments, and vehicle movements. Stock adjustments, SKU creation, and record deletion are restricted.
            </span>
          </div>
          <Badge className="bg-red-100 text-red-800 font-bold hover:bg-red-100 border-none shrink-0">
            Read-Only Mode
          </Badge>
        </div>
      )}

      {/* Stock Formula Banner - Light Red & White Theme */}
      <div className="bg-red-50/80 text-slate-900 p-4 rounded-xl border border-red-200 text-xs md:text-sm flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2 font-mono flex-wrap">
          <span className="bg-red-600 px-2.5 py-1 rounded-lg text-white font-bold text-xs shadow-xs">STOCK MATH</span>
          <span className="text-slate-700">
            <strong className="text-slate-900 font-bold">Morning Stock</strong> + <strong className="text-red-700 font-bold">New Stock In</strong> + <strong className="text-slate-800 font-bold">Good Returns</strong> − <strong className="text-red-600 font-bold">Loaded in Trucks</strong> = <strong className="text-red-800 font-black">Current Stock</strong>
          </span>
        </div>
        <div className="text-xs text-red-700 font-semibold">
          Accurate counts with zero negative stock
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="border-red-100 bg-white shadow-2xs">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-gray-500 block">Morning Stock (Opening)</span>
            <div className="text-xl md:text-2xl font-black text-gray-900 mt-1">{totalOpening.toLocaleString()} ctn</div>
            <span className="text-[11px] text-gray-400">At Start of Day</span>
          </CardContent>
        </Card>

        <Card className="border-red-100 bg-white shadow-2xs">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-red-700 block">Warehouse Stock (Available)</span>
            <div className="text-xl md:text-2xl font-black text-red-700 mt-1">{totalFloorStock.toLocaleString()} ctn</div>
            <span className="text-[11px] text-red-600 font-medium">Physically in Warehouse</span>
          </CardContent>
        </Card>

        <Card className="border-red-100 bg-white shadow-2xs">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-slate-700 block">Stock in Trucks</span>
            <div className="text-xl md:text-2xl font-black text-slate-900 mt-1">{totalInTransit.toLocaleString()} ctn</div>
            <span className="text-[11px] text-slate-500 font-medium">Out on Delivery Routes</span>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/50 shadow-2xs">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-red-800 block">Damaged / Broken Bottles</span>
            <div className="text-xl md:text-2xl font-black text-red-700 mt-1">{totalDamaged.toLocaleString()} ctn</div>
            <span className="text-[11px] text-red-600 font-medium">Not for Sale</span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <p className="text-xs text-gray-500">
        Historical tabs can be filtered by date. Floor stock and the summary cards show current live balances.
      </p>
      <div className="flex border-b border-gray-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('floor')}
          className={cn(
            "px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2",
            activeTab === 'floor' 
              ? "border-red-600 text-red-700 bg-red-50/50" 
              : "border-transparent text-gray-500 hover:text-gray-900"
          )}
        >
          <Package className="h-4 w-4" /> Products & Stock ({inventory.length})
        </button>

        <button
          onClick={() => setActiveTab('inward')}
          className={cn(
            "px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2",
            activeTab === 'inward' 
              ? "border-red-600 text-red-700 bg-red-50/50" 
              : "border-transparent text-gray-500 hover:text-gray-900"
          )}
        >
          <ArrowDownToLine className="h-4 w-4" /> Stock In History ({inwardRecords.length})
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={cn(
            "px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2",
            activeTab === 'movements' 
              ? "border-red-600 text-red-700 bg-red-50/50" 
              : "border-transparent text-gray-500 hover:text-gray-900"
          )}
        >
          <History className="h-4 w-4" /> Stock In & Out History ({movements.length})
        </button>
      </div>

      {/* TAB 1: FLOOR STOCK TABLE */}
      {activeTab === 'floor' && (
        <Card id="printable-stock-list" className="bg-white border-gray-200">
          <CardHeader className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="hidden print:block text-lg font-bold text-black">Warehouse Daily Stock List</h2>
            <div className="relative flex-1 max-w-sm print:hidden">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search SKU or Product Name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <span className="text-xs text-gray-500 print:hidden">
              Showing {filteredInventory.length} SKU definitions
            </span>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-bold border-b border-gray-200">
                <tr>
                  <th className="p-3.5">Product / SKU</th>
                  <th className="p-3.5">Specification</th>
                  <th className="p-3.5 text-right">Standard Rate</th>
                  <th className="p-3.5 text-right">Opening Qty</th>
                  <th className="p-3.5 text-right">Live Floor Balance</th>
                  <th className="p-3.5 text-right">In-Transit</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {filteredInventory.map(item => {
                  const isLow = item.Quantity <= item.MinThreshold;
                  return (
                    <tr key={item.ID} className="hover:bg-gray-50/80 transition-colors">
                      <td className="p-3.5">
                        <span className="font-bold text-gray-900 block">{item.Name}</span>
                        <span className="text-xs font-mono text-gray-500">{item.SKU}</span>
                      </td>
                      <td className="p-3.5 text-xs text-gray-600">
                        <div>{item.Size || 'Standard Size'}</div>
                        <div className="text-gray-400">{item.UnitType || 'Carton'} ({item.BottlesPerCase || 24} btl/ctn)</div>
                      </td>
                      <td className="p-3.5 text-right font-semibold text-gray-900">
                        PKR {item.Price.toFixed(2)}
                      </td>
                      <td className="p-3.5 text-right text-gray-600">
                        {item.OpeningStock ?? item.Quantity}
                      </td>
                      <td className="p-3.5 text-right print:hidden">
                        <span className={cn(
                          "text-base font-black px-2 py-0.5 rounded",
                          isLow ? "bg-red-100 text-red-800" : "bg-emerald-50 text-emerald-800"
                        )}>
                          {item.Quantity}
                        </span>
                      </td>
                      <td className="p-3.5 text-right text-blue-700 font-semibold">
                        {item.InTransitQuantity ? `${item.InTransitQuantity} ctn` : '-'}
                      </td>
                      <td className="p-3.5 text-center">
                        {isLow ? (
                          <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                            Low Stock (≤{item.MinThreshold})
                          </Badge>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            Available
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        {canEdit ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingItem(item);
                                setIsEditing(true);
                              }}
                              className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900"
                              title="Edit SKU"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setItemToDelete(item.ID)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                              title="Delete SKU"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingItem(item);
                                setIsEditing(true);
                              }}
                              className="h-7 px-2 text-blue-600 hover:text-blue-800 text-xs font-semibold gap-1"
                              title="View SKU Specifications"
                            >
                              <Eye className="h-3.5 w-3.5" /> View Specs
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* TAB 2: STOCK INWARD HISTORY */}
      {activeTab === 'inward' && (
        <Card className="bg-white border-gray-200">
          <CardHeader className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold text-gray-900">Stock Inward Receipts (Warehouse Intake)</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="warehouse-history-date" className="text-xs font-semibold text-gray-500">Date</label>
              <Input
                id="warehouse-history-date"
                type="date"
                value={historyDate}
                onChange={e => setHistoryDate(e.target.value)}
                className="h-9 w-36 text-xs"
              />
              {historyDate && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setHistoryDate('')} className="h-9 px-2 text-xs">
                  All dates
                </Button>
              )}
              {canEdit && (
                <Button size="sm" onClick={() => setIsInwardModalOpen(true)} className="gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold">
                  <Plus className="h-4 w-4" /> New Inward Entry
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-bold border-b border-gray-200">
                <tr>
                  <th className="p-3.5">Date & Time</th>
                  <th className="p-3.5">Ref / Batch #</th>
                  <th className="p-3.5">Product</th>
                  <th className="p-3.5 text-right">Quantity</th>
                  <th className="p-3.5">Supplier / Source</th>
                  <th className="p-3.5">Received By</th>
                  <th className="p-3.5">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {filteredInwardRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      No stock inward entries found{historyDate ? ` for ${historyDate}` : ''}.
                    </td>
                  </tr>
                ) : (
                  filteredInwardRecords.map(rec => (
                    <tr key={rec.ID} className="hover:bg-gray-50">
                      <td className="p-3.5 text-xs text-gray-600">
                        {rec.Date}
                      </td>
                      <td className="p-3.5 font-mono text-xs font-bold text-gray-800">
                        {rec.ReferenceNumber || rec.BatchNumber || rec.ID}
                      </td>
                      <td className="p-3.5 font-bold text-gray-900">
                        {rec.ProductName}
                      </td>
                      <td className="p-3.5 text-right font-black text-emerald-700">
                        +{rec.Quantity} {rec.Unit || 'ctn'}
                      </td>
                      <td className="p-3.5 text-xs text-gray-600">
                        {rec.SupplierSource}
                      </td>
                      <td className="p-3.5 text-xs text-gray-800">
                        {rec.ReceivedBy}
                      </td>
                      <td className="p-3.5 text-xs text-gray-500">
                        {rec.Remarks || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: COMPLETE STOCK MOVEMENTS LOG */}
      {activeTab === 'movements' && (
        <Card className="bg-white border-gray-200">
          <CardHeader className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <label htmlFor="warehouse-movement-date" className="text-xs font-semibold text-gray-500">Date</label>
              <Input
                id="warehouse-movement-date"
                type="date"
                value={historyDate}
                onChange={e => setHistoryDate(e.target.value)}
                className="h-9 w-36 text-xs"
              />
              {historyDate && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setHistoryDate('')} className="h-9 px-2 text-xs">
                  All dates
                </Button>
              )}
              <select
                value={movementFilter}
                onChange={(e) => setMovementFilter(e.target.value)}
                className="text-xs font-semibold border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 bg-white"
              >
                <option value="ALL">All Movement Types</option>
                <option value="STOCK_IN">Stock Inward</option>
                <option value="LOAD_OUT">Vehicle Loading</option>
                <option value="DELIVERY">Outlet Delivery</option>
                <option value="RETURN">Customer Return</option>
                <option value="RESTOCK">Restock into Floor</option>
                <option value="DAMAGE">Damaged Goods</option>
                <option value="ADJUSTMENT">Manual Adjustment</option>
              </select>
            </div>
            <span className="text-xs text-gray-500">
              Showing {filteredMovements.length} logged stock movements
            </span>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-bold border-b border-gray-200">
                <tr>
                  <th className="p-3.5">Date & Time</th>
                  <th className="p-3.5">Product</th>
                  <th className="p-3.5">Transaction Type</th>
                  <th className="p-3.5 text-right">Quantity</th>
                  <th className="p-3.5">From Location</th>
                  <th className="p-3.5">To Destination</th>
                  <th className="p-3.5">User</th>
                  <th className="p-3.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-400">
                      No stock movement records found for this filter{historyDate ? ` on ${historyDate}` : ''}.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map(m => {
                    const isPlus = m.Type === 'STOCK_IN' || m.Type === 'RESTOCK';
                    const isMinus = m.Type === 'LOAD_OUT' || m.Type === 'DAMAGE' || m.Type === 'LOSS';
                    return (
                      <tr key={m.ID} className="hover:bg-gray-50">
                        <td className="p-3.5 text-xs text-gray-500">
                          {m.Date.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="p-3.5 font-bold text-gray-900">
                          {m.ProductName}
                        </td>
                        <td className="p-3.5">
                          <span className={cn(
                            "inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            m.Type === 'STOCK_IN' && "bg-emerald-100 text-emerald-800",
                            m.Type === 'LOAD_OUT' && "bg-blue-100 text-blue-800",
                            m.Type === 'DELIVERY' && "bg-emerald-100 text-emerald-800",
                            m.Type === 'RETURN' && "bg-amber-100 text-amber-800",
                            m.Type === 'RESTOCK' && "bg-purple-100 text-purple-800",
                            m.Type === 'DAMAGE' && "bg-red-100 text-red-800",
                            m.Type === 'ADJUSTMENT' && "bg-gray-100 text-gray-800"
                          )}>
                            {m.Type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={cn(
                          "p-3.5 text-right font-black",
                          isPlus ? "text-emerald-600" : isMinus ? "text-red-600" : "text-gray-900"
                        )}>
                          {isPlus ? `+${m.Quantity}` : isMinus ? `-${m.Quantity}` : m.Quantity} ctn
                        </td>
                        <td className="p-3.5 text-xs text-gray-600">{m.From}</td>
                        <td className="p-3.5 text-xs text-gray-800 font-semibold">{m.To}</td>
                        <td className="p-3.5 text-xs text-gray-500">{m.User}</td>
                        <td className="p-3.5 text-xs text-gray-400 max-w-[200px] truncate">{m.Notes || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* MODAL: ADD STOCK INWARD (FLOOR STOCK INTAKE) */}
      <ResponsiveDialog
        open={isInwardModalOpen}
        onOpenChange={setIsInwardModalOpen}
        title="Record Stock In (Floor Entry)"
        subtitle="Incoming production batch or supplier replenishment"
      >
        <form onSubmit={handleStockInwardSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Receipt Date</label>
              <Input
                type="date"
                value={inwardForm.date}
                onChange={(e) => setInwardForm({ ...inwardForm, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Batch #</label>
              <Input
                value={inwardForm.batchNumber}
                onChange={(e) => setInwardForm({ ...inwardForm, batchNumber: e.target.value })}
                placeholder="e.g. BAT-20260820"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Select Product SKU</label>
            <select
              value={inwardForm.productId}
              onChange={(e) => setInwardForm({ ...inwardForm, productId: e.target.value })}
              className="w-full text-sm border border-gray-300 rounded-lg p-2.5 font-semibold bg-white focus:ring-2 focus:ring-red-500"
              required
            >
              {inventory.map(p => (
                <option key={p.ID} value={p.ID}>
                  {p.Name} ({p.SKU}) — Current Floor: {p.Quantity} ctn
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Quantity Received (Cases)</label>
              <Input
                type="number"
                min="1"
                value={inwardForm.quantity}
                onChange={(e) => setInwardForm({ ...inwardForm, quantity: Number(e.target.value) })}
                required
                className="font-bold text-emerald-700"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Unit</label>
              <Input
                value={inwardForm.unit}
                onChange={(e) => setInwardForm({ ...inwardForm, unit: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Supplier / Production Source</label>
              <Input
                value={inwardForm.supplierSource}
                onChange={(e) => setInwardForm({ ...inwardForm, supplierSource: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Received By</label>
              <Input
                value={inwardForm.receivedBy}
                onChange={(e) => setInwardForm({ ...inwardForm, receivedBy: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Remarks / Note</label>
            <Input
              value={inwardForm.remarks}
              onChange={(e) => setInwardForm({ ...inwardForm, remarks: e.target.value })}
              placeholder="e.g. Morning production run, quality verified"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsInwardModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold">
              Confirm Floor Stock Addition
            </Button>
          </div>
        </form>
      </ResponsiveDialog>

      {/* MODAL: ADD / EDIT / VIEW PRODUCT SKU */}
      <ResponsiveDialog
        open={isEditing}
        onOpenChange={setIsEditing}
        title={!canEdit ? 'View SKU Specifications (Read-Only Inspection)' : (editingItem.ID ? 'Edit SKU Specifications' : 'Add New Product SKU')}
        subtitle={!canEdit ? 'Inspecting product packaging details and standard pricing' : 'Manage product packaging details and standard pricing'}
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          {!canEdit && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
              <span>Area Sales Manager (ASM) inspection mode: Modifications are disabled.</span>
            </div>
          )}

          {/* Product Name with explicit text name format - not just in hint */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <label className="text-xs font-bold text-gray-900">
                Product Name <span className="text-red-600">*</span>
              </label>
              <span className="text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                Format: [Brand Name] [Volume / Unit]
              </span>
            </div>
            
            <Input
              disabled={!canEdit}
              value={editingItem.Name || ''}
              onChange={(e) => setEditingItem({ ...editingItem, Name: e.target.value })}
              placeholder="Type product name here..."
              required
              className="bg-white border-gray-300 focus:border-red-500 focus:ring-red-500"
            />

            {/* Prominent format guide text box (NOT in placeholder hint) */}
            <div className="p-2.5 bg-red-50/70 border border-red-200 rounded-lg text-xs space-y-1.5 text-slate-800">
              <div className="flex items-center gap-1.5 text-red-900 font-bold">
                <span className="w-2 h-2 rounded-full bg-red-600 inline-block shrink-0"></span>
                <span>Standard Name Format: <span className="font-mono text-red-700">WARSA &lt;Volume&gt;</span></span>
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                Accepted naming examples: <strong className="text-red-700">WARSA 500ml</strong> &bull; <strong className="text-red-700">WARSA 1.5L</strong> &bull; <strong className="text-red-700">WARSA 5L</strong> &bull; <strong className="text-red-700">WARSA 19L</strong>
              </p>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-red-200/60">
                  <span className="text-[10px] font-bold text-slate-600">Click to autofill format:</span>
                  {[
                    { name: 'WARSA 500ml', sku: 'WAR-500ML', size: '500ml', bpc: 24 },
                    { name: 'WARSA 1.5L', sku: 'WAR-1.5L', size: '1.5L', bpc: 6 },
                    { name: 'WARSA 5L', sku: 'WAR-5L', size: '5L', bpc: 2 },
                    { name: 'WARSA 19L', sku: 'WAR-19L', size: '19L', bpc: 1 }
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setEditingItem({
                          ...editingItem,
                          Name: preset.name,
                          SKU: editingItem.SKU || preset.sku,
                          Size: editingItem.Size || preset.size,
                          BottlesPerCase: editingItem.BottlesPerCase || preset.bpc,
                          Price: editingItem.Price ?? 0
                        });
                      }}
                      className="text-[10px] font-bold bg-white text-red-700 hover:bg-red-600 hover:text-white px-2.5 py-1 rounded-md border border-red-300 transition-colors shadow-2xs cursor-pointer"
                    >
                      + {preset.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">
                  SKU Code <span className="text-red-600">*</span>
                </label>
                <span className="text-[10px] text-red-600 font-mono">Format: WAR-[SIZE]</span>
              </div>
              <Input
                disabled={!canEdit}
                value={editingItem.SKU || ''}
                onChange={(e) => setEditingItem({ ...editingItem, SKU: e.target.value })}
                placeholder="e.g. WAR-500ML"
                required
              />
              <span className="text-[10px] text-gray-500 block mt-0.5">Example: WAR-500ML, WAR-1.5L, WAR-19L</span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-700">Size / Volume</label>
                <span className="text-[10px] text-slate-500">500ml, 1.5L, 5L, 19L</span>
              </div>
              <Input
                disabled={!canEdit}
                value={editingItem.Size || ''}
                onChange={(e) => setEditingItem({ ...editingItem, Size: e.target.value })}
                placeholder="e.g. 500ml, 1.5L, 5L, 19L"
              />
              <span className="text-[10px] text-gray-500 block mt-0.5">Standard bottle packaging volume</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Bottles Per Case</label>
              <Input
                disabled={!canEdit}
                type="number"
                value={editingItem.BottlesPerCase || 24}
                onChange={(e) => setEditingItem({ ...editingItem, BottlesPerCase: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Unit Type</label>
              <Input
                disabled={!canEdit}
                value={editingItem.UnitType || 'Cases'}
                onChange={(e) => setEditingItem({ ...editingItem, UnitType: e.target.value })}
                placeholder="Cases, Bottles, Bottles / Rack"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Floor Stock (Qty)</label>
              <Input
                disabled={!canEdit}
                type="number"
                value={editingItem.Quantity || 0}
                onChange={(e) => setEditingItem({ ...editingItem, Quantity: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Standard Rate (PKR)</label>
              <Input
                disabled={!canEdit}
                type="number"
                value={editingItem.Price || 0}
                onChange={(e) => setEditingItem({ ...editingItem, Price: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Min Threshold</label>
              <Input
                disabled={!canEdit}
                type="number"
                value={editingItem.MinThreshold || 0}
                onChange={(e) => setEditingItem({ ...editingItem, MinThreshold: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {canEdit && (
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold">
                Save Product
              </Button>
            )}
          </div>
        </form>
      </ResponsiveDialog>

      {/* Confirm Product Delete */}
      <ConfirmDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        onConfirm={handleDeleteProduct}
        title="Delete Product SKU?"
        description="Are you sure you want to remove this SKU? This cannot be undone."
      />
    </div>
  );
}
