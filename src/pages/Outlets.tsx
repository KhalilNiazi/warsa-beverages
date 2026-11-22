import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { 
  fetchOutlets, 
  fetchInventory, 
  saveOutlet, 
  deleteOutlet, 
  fetchOrderBookers, 
  fetchDeliveryMen,
  canModifyData,
  getCurrentUser,
  isOrderBooker,
  isSuperAdmin,
  filterOutletsForUser,
  getUserAssignedRoutes
} from '@/src/api';
import { Outlet, InventoryItem, OrderBooker, DeliveryMan } from '@/src/types';
import { Store, Plus, Search, Edit, Trash2, Eye, ShieldAlert, User, MapPin, FileSpreadsheet } from 'lucide-react';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { BulkDataModal } from '@/src/components/BulkDataModal';
import { OutletPrintModal } from '@/src/components/OutletPrintModal';
import { Printer } from 'lucide-react';

export function Outlets() {
  const currentUser = getCurrentUser();
  const canEdit = canModifyData();
  const isBooker = isOrderBooker(currentUser);
  const isSuper = isSuperAdmin(currentUser);
  const assignedRoutes = getUserAssignedRoutes(currentUser);

  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orderBookers, setOrderBookers] = useState<OrderBooker[]>([]);
  const [deliveryMen, setDeliveryMen] = useState<DeliveryMan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [outletToDelete, setOutletToDelete] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editingOutlet, setEditingOutlet] = useState<Partial<Outlet>>({
    CustomRates: {}
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [obsData, outletsData, invData, deliveryMenData] = await Promise.all([
        fetchOrderBookers(),
        fetchOutlets(),
        fetchInventory(),
        fetchDeliveryMen()
      ]);
      setOutlets(outletsData);
      setInventory(invData);
      setOrderBookers(obsData);
      setDeliveryMen(deliveryMenData);
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

  const handleOpenAdd = () => {
    const defaultBooker = orderBookers.find(booker => booker.Name === currentUser?.name) ||
      orderBookers.find(booker =>
        assignedRoutes.length > 0 &&
        booker.AssignedRoutes?.some(route => assignedRoutes.includes(route))
      ) ||
      orderBookers[0];
    setEditingOutlet({
      CustomRates: {},
      Route: isBooker && assignedRoutes.length > 0 ? assignedRoutes[0] : (outlets[0]?.Route || 'Route 1 - Gulberg & Cantt'),
      OB: isBooker ? (defaultBooker?.Name || currentUser?.name) : (defaultBooker?.Name || ''),
      OrderBookerID: defaultBooker?.ID
    });
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (!editingOutlet.Name || !editingOutlet.Code) {
      setSaveError('Shop code and shop name are required.');
      return;
    }
    const selectedBooker = orderBookers.find(booker => booker.ID === editingOutlet.OrderBookerID) ||
      orderBookers.find(booker => booker.Name.trim().toLowerCase() === (editingOutlet.OB || '').trim().toLowerCase());
    
    const outletToSave = {
      ...editingOutlet,
      ID: editingOutlet.ID || Date.now().toString(),
      Code: editingOutlet.Code || '',
      Name: editingOutlet.Name || '',
      Route: editingOutlet.Route || (isBooker && assignedRoutes.length > 0 ? assignedRoutes[0] : ''),
      Address: editingOutlet.Address || '',
      ContactNumber: editingOutlet.ContactNumber || '',
      NTN: editingOutlet.NTN || '',
      OwnerName: editingOutlet.OwnerName || '',
      DeliveryManName: editingOutlet.DeliveryManName || '',
      OB: selectedBooker?.Name || editingOutlet.OB || (isBooker ? currentUser?.name : ''),
      OrderBookerID: selectedBooker?.ID || editingOutlet.OrderBookerID,
      OpeningBalance: Number(editingOutlet.OpeningBalance) || 0,
      Status: editingOutlet.Status || 'Active',
      CustomRates: editingOutlet.CustomRates || {}
    } as Outlet;

    try {
      await saveOutlet(outletToSave);
      setOutlets(previous => {
        const existingIndex = previous.findIndex(outlet => outlet.ID === outletToSave.ID);
        if (existingIndex < 0) return [...previous, outletToSave];
        return previous.map((outlet, index) => index === existingIndex ? outletToSave : outlet);
      });
      setIsEditing(false);
      setEditingOutlet({ CustomRates: {} });
    } catch (error) {
      console.error('[Outlets] Save failed:', error);
      setSaveError(error instanceof Error ? error.message : 'The outlet could not be saved.');
    }
  };

  const handleDelete = async () => {
    if (outletToDelete) {
      await deleteOutlet(outletToDelete);
      setOutletToDelete(null);
      loadData();
    }
  };

  const handleRateChange = (productId: string, price: string) => {
    setEditingOutlet(prev => ({
      ...prev,
      CustomRates: {
        ...prev.CustomRates,
        [productId]: Number(price)
      }
    }));
  };

  // Scope to user's assigned route if Order Booker
  const scopedOutlets = filterOutletsForUser(outlets, currentUser);

  const filteredOutlets = scopedOutlets.filter(o => 
    (o.SrNo && o.SrNo.toString() === search.trim()) ||
    (o.SrNo && o.SrNo.toString().includes(search.trim())) ||
    (o.Name || '').toLowerCase().includes(search.toLowerCase()) || 
    (o.Code || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.Route || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Shops & Customers</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">
            {isBooker ? `Customer directory for your assigned route: ${assignedRoutes.join(', ') || 'Assigned Route'}` : 'Manage customer retail shops, routes, and special prices.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => setIsPrintModalOpen(true)}
            className="gap-1.5 bg-white border-slate-300 text-red-700 hover:bg-red-50 font-bold h-10 shadow-sm text-xs sm:text-sm"
          >
            <Printer className="h-4 w-4 text-red-600 shrink-0" />
            <span>Print Directory</span>
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
            <Badge variant="outline" className="bg-red-50 text-red-900 border-red-200 font-bold px-3 py-2 flex items-center gap-1.5 shadow-2xs text-xs">
              <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
              <span>Read-Only</span>
            </Badge>
          ) : (
            <Button onClick={handleOpenAdd} className="gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold h-10 shadow-xs text-xs sm:text-sm">
              <Plus className="h-4 w-4 shrink-0" />
              <span>Add Shop</span>
            </Button>
          )}
        </div>
      </div>

      {/* ASM Read-Only Banner */}
      {!canEdit && (
        <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl flex items-center justify-between gap-3 text-red-950 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span>
              <strong>Area Sales Manager (ASM) Read-Only Inspection:</strong> You can view all customer shops, contact numbers, balances, routes, and custom price lists. Adding, editing, and deleting shops are restricted.
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
              <strong>Order Booker Route View:</strong> Showing only customer shops on your assigned route (<strong>{assignedRoutes.join(', ') || 'Assigned Route'}</strong>). Total: <strong>{scopedOutlets.length}</strong> customers.
            </span>
          </div>
          <Badge className="bg-red-100 text-red-800 font-bold border-none shrink-0">
            My Route Customers
          </Badge>
        </div>
      )}

      <ResponsiveDialog
        open={isEditing}
        onOpenChange={(open) => { if (!open) { setIsEditing(false); setEditingOutlet({ CustomRates: {} }); } }}
        title={!canEdit ? 'View Shop Details (Read-Only Inspection)' : (editingOutlet.ID ? 'Edit Shop Details' : 'Add New Shop')}
        subtitle={!canEdit ? 'Inspecting shop details, delivery route, and special prices' : 'Enter shop details, delivery route, and special prices'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-5">
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {saveError}
            </div>
          )}
          {!canEdit && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
              <span>Area Sales Manager (ASM) inspection mode: Modifications are disabled.</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Shop Code</label>
              <Input disabled={!canEdit} required placeholder="e.g. 339" value={editingOutlet.Code || ''} onChange={e => setEditingOutlet({...editingOutlet, Code: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Shop Name</label>
              <Input disabled={!canEdit} required placeholder="e.g. AA ENTERPRISES" value={editingOutlet.Name || ''} onChange={e => setEditingOutlet({...editingOutlet, Name: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Route</label>
              <Input disabled={!canEdit} placeholder="e.g. RAILWAY + G SHAHU" value={editingOutlet.Route || ''} onChange={e => setEditingOutlet({...editingOutlet, Route: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Address</label>
              <Input disabled={!canEdit} placeholder="e.g. RAILWAY STATION" value={editingOutlet.Address || ''} onChange={e => setEditingOutlet({...editingOutlet, Address: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Phone Number</label>
              <Input disabled={!canEdit} placeholder="e.g. 0336-4574227" value={editingOutlet.ContactNumber || ''} onChange={e => setEditingOutlet({...editingOutlet, ContactNumber: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Customer NTN / CNIC</label>
              <Input disabled={!canEdit} placeholder="Enter NTN or CNIC number" value={editingOutlet.NTN || ''} onChange={e => setEditingOutlet({...editingOutlet, NTN: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Order Booker</label>
              <select 
                disabled={!canEdit}
                className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:bg-gray-100 disabled:text-gray-500"
                value={editingOutlet.OrderBookerID || orderBookers.find(booker =>
                  booker.Name.trim().toLowerCase() === (editingOutlet.OB || '').trim().toLowerCase()
                )?.ID || ''}
                onChange={e => {
                  const selectedBooker = orderBookers.find(booker => booker.ID === e.target.value);
                  setEditingOutlet({
                    ...editingOutlet,
                    OrderBookerID: selectedBooker?.ID,
                    OB: selectedBooker?.Name || ''
                  });
                }}
              >
                <option value="">Select Order Booker</option>
                {orderBookers.map(ob => (
                  <option key={ob.ID} value={ob.ID}>{ob.Name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Default Delivery Man</label>
              <select
                disabled={!canEdit}
                className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:bg-gray-100 disabled:text-gray-500"
                value={editingOutlet.DeliveryManName || ''}
                onChange={e => setEditingOutlet({ ...editingOutlet, DeliveryManName: e.target.value })}
              >
                <option value="">Select Delivery Man</option>
                {editingOutlet.DeliveryManName && !deliveryMen.some(person => person.Name === editingOutlet.DeliveryManName) && (
                  <option value={editingOutlet.DeliveryManName}>{editingOutlet.DeliveryManName}</option>
                )}
                {deliveryMen.map(person => <option key={person.ID} value={person.Name}>{person.Name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Previous Khata / Balance (PKR)</label>
              <Input disabled={!canEdit} type="number" placeholder="0" value={editingOutlet.OpeningBalance || ''} onChange={e => setEditingOutlet({...editingOutlet, OpeningBalance: Number(e.target.value)})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Shop Owner Name</label>
              <Input disabled={!canEdit} placeholder="e.g. SHARJEEL SB" value={editingOutlet.OwnerName || ''} onChange={e => setEditingOutlet({...editingOutlet, OwnerName: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase">Shop Type</label>
              <Input disabled={!canEdit} placeholder="e.g. General store / Hotel" value={editingOutlet.Status || ''} onChange={e => setEditingOutlet({...editingOutlet, Status: e.target.value})} />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <h3 className="font-bold text-gray-900 mb-1 text-sm">Special Discount Prices (PKR per Case)</h3>
            <p className="text-xs text-gray-500 mb-3">Leave blank to use the standard price.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {inventory.map(item => (
                <div key={item.ID} className="flex flex-col space-y-1 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="text-xs font-bold text-gray-800">{item.Name}</label>
                  <div className="text-[11px] text-gray-500">Standard: PKR {item.Price}</div>
                  <Input 
                    disabled={!canEdit}
                    type="number" 
                    min="0"
                    placeholder="Custom rate..."
                    className="h-8 text-xs font-semibold bg-white"
                    value={editingOutlet.CustomRates?.[item.ID] || ''}
                    onChange={e => handleRateChange(item.ID, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {canEdit && (
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold">
                {editingOutlet.ID ? 'Update Outlet' : 'Save Outlet'}
              </Button>
            )}
          </div>
        </form>
      </ResponsiveDialog>

      <Card>
        <CardHeader className="pb-3 border-b border-gray-100 px-4 md:px-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <CardTitle className="text-lg">Outlet Directory</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search by Sr No, name, code, route..."
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading outlets...</div>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {filteredOutlets.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No outlets found.</div>
              ) : (
                filteredOutlets.map((outlet) => (
                  <div 
                    key={outlet.ID} 
                    className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => { setEditingOutlet(outlet); setIsEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  >
                    <div className="flex gap-3 items-center">
                      <div className="bg-red-50 p-2 rounded-full flex-shrink-0">
                        <Store className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded">
                            Sr #{outlet.SrNo || outlet.ID}
                          </span>
                          <p className="font-semibold text-gray-900">{outlet.Code} - {outlet.Name}</p>
                        </div>
                        <p className="text-sm text-gray-500">{outlet.Route} {outlet.Address ? `• ${outlet.Address}` : ''}</p>
                        <div className="flex gap-2 mt-1">
                          {Object.keys(outlet.CustomRates || {}).length > 0 && (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-700/10">
                              {Object.keys(outlet.CustomRates || {}).length} Custom Rates
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{outlet.Status}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 self-end sm:self-auto">
                      {canEdit ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingOutlet(outlet); setIsEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                            <Edit className="h-4 w-4 mr-2" /> Edit
                          </Button>
                          {isSuper && (
                            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); setOutletToDelete(outlet.ID); }} title="Delete Shop">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800 font-semibold" onClick={(e) => { e.stopPropagation(); setEditingOutlet(outlet); setIsEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                          <Eye className="h-4 w-4 mr-1.5" /> View Details
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        isOpen={!!outletToDelete}
        title="Delete Outlet"
        description="Are you sure you want to delete this outlet? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setOutletToDelete(null)}
      />
      <BulkDataModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        defaultTab="outlets"
        onSuccess={loadData}
      />
      <OutletPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        outlets={scopedOutlets}
      />
    </div>
  );
}
