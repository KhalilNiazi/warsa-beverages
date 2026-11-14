import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { fetchOrderBookers, saveOrderBooker, deleteOrderBooker, fetchDeliveryMen, saveDeliveryMan, deleteDeliveryMan, canModifyData } from '@/src/api';
import { DeliveryMan, OrderBooker } from '@/src/types';
import { User, Plus, Edit, Trash2 } from 'lucide-react';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';

export function OrderBookers() {
  const canEdit = canModifyData();
  const [obs, setObs] = useState<OrderBooker[]>([]);
  const [deliveryMen, setDeliveryMen] = useState<DeliveryMan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingOB, setEditingOB] = useState<Partial<OrderBooker>>({});
  const [obToDelete, setObToDelete] = useState<string | null>(null);
  const [isEditingDeliveryMan, setIsEditingDeliveryMan] = useState(false);
  const [editingDeliveryMan, setEditingDeliveryMan] = useState<Partial<DeliveryMan>>({});
  const [deliveryManToDelete, setDeliveryManToDelete] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [orderBookersData, deliveryMenData] = await Promise.all([fetchOrderBookers(), fetchDeliveryMen()]);
      setObs(orderBookersData);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOB.Name) return;

    await saveOrderBooker(editingOB as OrderBooker);
    setIsEditing(false);
    setEditingOB({});
    loadData();
  };

  const handleDelete = async () => {
    if (obToDelete) {
      await deleteOrderBooker(obToDelete);
      setObToDelete(null);
      loadData();
    }
  };

  const handleSaveDeliveryMan = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = editingDeliveryMan.Name?.trim();
    if (!name) return;
    try {
      await saveDeliveryMan({ ...editingDeliveryMan, ID: editingDeliveryMan.ID || Date.now().toString(), Name: name });
      setIsEditingDeliveryMan(false);
      setEditingDeliveryMan({});
      await loadData();
    } catch (error) {
      console.error('[OrderBookers] Could not save delivery man:', error);
      alert(error instanceof Error ? error.message : 'Could not save delivery man.');
    }
  };

  const handleDeleteDeliveryMan = async () => {
    if (!deliveryManToDelete) return;
    try {
      await deleteDeliveryMan(deliveryManToDelete);
      setDeliveryManToDelete(null);
      await loadData();
    } catch (error) {
      console.error('[OrderBookers] Could not delete delivery man:', error);
      alert(error instanceof Error ? error.message : 'Could not delete delivery man.');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Order Bookers</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">{canEdit ? 'Manage your team of order bookers.' : 'Viewing order bookers (read-only).'}</p>
        </div>
        {canEdit && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => { setEditingOB({}); setIsEditing(true); }} className="gap-2 w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold shadow-xs">
              <Plus className="h-4 w-4" /> Add Order Booker
            </Button>
            <Button onClick={() => { setEditingDeliveryMan({}); setIsEditingDeliveryMan(true); }} variant="outline" className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Add Delivery Man
            </Button>
          </div>
        )}
      </div>

      <ResponsiveDialog 
        isOpen={isEditing} 
        onClose={() => setIsEditing(false)} 
        title={editingOB.ID ? 'Edit Order Booker' : 'Add New Order Booker'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase">Name</label>
              <Input required placeholder="Order Booker Name" value={editingOB.Name || ''} onChange={e => setEditingOB({...editingOB, Name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase">Phone Number</label>
              <Input placeholder="Phone Number" value={editingOB.Phone || ''} onChange={e => setEditingOB({...editingOB, Phone: e.target.value})} />
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-6">
            <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-xs">Save</Button>
          </div>
        </form>
      </ResponsiveDialog>

      <ResponsiveDialog
        isOpen={isEditingDeliveryMan}
        onClose={() => setIsEditingDeliveryMan(false)}
        title={editingDeliveryMan.ID ? 'Edit Delivery Man' : 'Add Delivery Man'}
      >
        <form onSubmit={handleSaveDeliveryMan} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase">Name</label>
            <Input required maxLength={100} placeholder="Delivery man name" value={editingDeliveryMan.Name || ''} onChange={e => setEditingDeliveryMan({ ...editingDeliveryMan, Name: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsEditingDeliveryMan(false)}>Cancel</Button>
            <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold">Save</Button>
          </div>
        </form>
      </ResponsiveDialog>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading order bookers...</div>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {obs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No order bookers found.</div>
              ) : (
                obs.map((ob) => (
                  <div key={ob.ID} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                    <div className="flex gap-3 items-center">
                      <div className="bg-red-50 p-2 rounded-full flex-shrink-0">
                        <User className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{ob.Name}</p>
                        {ob.Phone && <p className="text-sm text-gray-500">{ob.Phone}</p>}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingOB(ob); setIsEditing(true); }}>
                          <Edit className="h-4 w-4 mr-2" /> Edit
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => setObToDelete(ob.ID)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Delivery Men</CardTitle>
          <p className="text-sm text-gray-500">Manage delivery-person names used by outlets, orders, and invoices. No contact number is required.</p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading delivery men...</div>
          ) : deliveryMen.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No delivery men found.</div>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {deliveryMen.map(person => (
                <div key={person.ID} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex gap-3 items-center">
                    <div className="bg-blue-50 p-2 rounded-full"><User className="h-5 w-5 text-blue-600" /></div>
                    <p className="font-semibold text-gray-900">{person.Name}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingDeliveryMan(person); setIsEditingDeliveryMan(true); }}>
                        <Edit className="h-4 w-4 mr-2" /> Edit
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => setDeliveryManToDelete(person.ID)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        isOpen={!!obToDelete}
        title="Delete Order Booker"
        description="Are you sure you want to delete this order booker? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setObToDelete(null)}
      />
      <ConfirmDialog
        isOpen={!!deliveryManToDelete}
        title="Delete Delivery Man"
        description="This removes the name from future selections. Existing order and invoice names are unchanged."
        onConfirm={handleDeleteDeliveryMan}
        onCancel={() => setDeliveryManToDelete(null)}
      />
    </div>
  );
}
