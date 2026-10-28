import React, { useState } from 'react';
import { SaleRecord, DeliveryStatus, RejectionReason } from '@/src/types';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { updateSaleDeliveryStatus, canModifyData, getCurrentUser, canManageDeliveriesAndLoading } from '@/src/api';
import { CheckCircle2, XCircle, AlertTriangle, PackageX, Truck, ArrowLeft, DollarSign, Store, ShieldAlert, User } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface DeliveryStatusModalProps {
  sale: SaleRecord;
  isOpen?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const REJECTION_REASONS: RejectionReason[] = [
  'Shop Closed',
  'Owner Not Available',
  'Cash / Payment Issue',
  'Order Cancelled',
  'Customer Refused',
  'Stock Already Available',
  'Damaged Product',
  'Wrong Order',
  'Delivery Delay',
  'Other'
];

export function DeliveryStatusModal({ sale, isOpen = true, onClose, onSuccess }: DeliveryStatusModalProps) {
  const currentUser = getCurrentUser();
  const canEdit = canModifyData() && canManageDeliveriesAndLoading(currentUser);
  const [statusMode, setStatusMode] = useState<DeliveryStatus>(sale.DeliveryStatus || 'DELIVERED');
  const [overallReason, setOverallReason] = useState<string>(sale.RejectionReason || REJECTION_REASONS[0]);
  const [overallNotes, setOverallNotes] = useState<string>(sale.RejectionNotes || '');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank Transfer' | 'Cheque' | 'Other'>(sale.PaymentMethod || 'Cash');
  const [cashCollected, setCashCollected] = useState<number>(sale.CashCollected ?? (sale.ActualGrandTotal || sale.GrandTotal));
  const [isSaving, setIsSaving] = useState(false);

  // Per-item delivered & rejected counts
  const [itemDeliveries, setItemDeliveries] = useState(
    sale.Items.map(item => {
      const booked = item.BookedQty || item.Quantity;
      const initDelivered = item.DeliveredQty !== undefined 
        ? item.DeliveredQty 
        : (sale.DeliveryStatus === 'REJECTED' ? 0 : booked);
      const initRejected = item.RejectedQty !== undefined 
        ? item.RejectedQty 
        : (sale.DeliveryStatus === 'REJECTED' ? booked : 0);

      return {
        productID: item.ProductID,
        productName: item.ProductName,
        bookedQty: booked,
        price: item.Price,
        deliveredQty: initDelivered,
        rejectedQty: initRejected,
        rejectionReason: item.RejectionReason || (initRejected > 0 ? (sale.RejectionReason || REJECTION_REASONS[0]) : ''),
        rejectionNotes: item.RejectionNotes || ''
      };
    })
  );

  const handleQuickStatusChange = (mode: DeliveryStatus) => {
    setStatusMode(mode);
    if (mode === 'DELIVERED') {
      setItemDeliveries(prev => prev.map(i => ({
        ...i,
        deliveredQty: i.bookedQty,
        rejectedQty: 0,
        rejectionReason: ''
      })));
      const fullAmount = sale.Items.reduce((s, i) => s + (i.Quantity * i.Price), 0) - (sale.Discount || 0);
      setCashCollected(Math.max(0, fullAmount));
    } else if (mode === 'REJECTED') {
      setItemDeliveries(prev => prev.map(i => ({
        ...i,
        deliveredQty: 0,
        rejectedQty: i.bookedQty,
        rejectionReason: overallReason || REJECTION_REASONS[0]
      })));
      setCashCollected(0);
    }
  };

  const handleItemDeliveredChange = (index: number, delivered: number) => {
    setItemDeliveries(prev => {
      const next = [...prev];
      const target = next[index];
      const validDelivered = Math.max(0, Math.min(target.bookedQty, delivered));
      const validRejected = target.bookedQty - validDelivered;
      next[index] = {
        ...target,
        deliveredQty: validDelivered,
        rejectedQty: validRejected,
        rejectionReason: validRejected > 0 ? (target.rejectionReason || overallReason || REJECTION_REASONS[0]) : ''
      };
      
      const totalBooked = next.reduce((sum, i) => sum + i.bookedQty, 0);
      const totalDeliv = next.reduce((sum, i) => sum + i.deliveredQty, 0);
      if (totalDeliv === totalBooked) setStatusMode('DELIVERED');
      else if (totalDeliv === 0) setStatusMode('REJECTED');
      else setStatusMode('PARTIAL');

      const newActualTotal = Math.max(0, next.reduce((s, i) => s + (i.deliveredQty * i.price), 0) - (sale.Discount || 0));
      setCashCollected(newActualTotal);

      return next;
    });
  };

  const totalDelivered = itemDeliveries.reduce((sum, i) => sum + i.deliveredQty, 0);
  const totalRejected = itemDeliveries.reduce((sum, i) => sum + i.rejectedQty, 0);
  const actualDeliveredAmount = itemDeliveries.reduce((sum, i) => sum + (i.deliveredQty * i.price), 0);
  const actualGrandTotal = Math.max(0, actualDeliveredAmount - (sale.Discount || 0));
  const creditAmount = Math.max(0, actualGrandTotal - (cashCollected || 0));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSaleDeliveryStatus(
        sale.ID,
        statusMode,
        itemDeliveries.map(i => ({
          productID: i.productID,
          deliveredQty: i.deliveredQty,
          rejectedQty: i.rejectedQty,
          rejectionReason: i.rejectedQty > 0 ? (i.rejectionReason || overallReason) : undefined,
          rejectionNotes: i.rejectionNotes || overallNotes
        })),
        totalRejected > 0 ? overallReason : undefined,
        overallNotes,
        paymentMethod,
        cashCollected
      );
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
    }
    setIsSaving(false);
  };

  return (
    <ResponsiveDialog
      open={isOpen !== undefined ? isOpen : true}
      onOpenChange={(open) => !open && onClose()}
      title={canEdit ? sale.OutletName : `${sale.OutletName} (Read-Only Inspection)`}
      subtitle={`Invoice #${sale.ID} • ${sale.Route} • Contact: ${sale.ContactNumber}`}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && (
            <Button 
              type="button" 
              onClick={handleSave} 
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-700 text-white font-bold gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isSaving ? 'Updating...' : 'Confirm Delivery Outcome'}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {!canEdit && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              {currentUser?.role === 'ORDER_BOOKER' 
                ? 'Order Booker View: Delivery drop fulfillment and returns are recorded by the Salesman / Delivery Incharge.' 
                : 'Read-Only Inspection: Updating delivery drop and collecting payments are restricted.'}
            </span>
          </div>
        )}
        {/* Quick Mode Selector */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-2">
            Delivery Outcome Status
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickStatusChange('DELIVERED')}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-lg border text-xs sm:text-sm font-bold transition-all",
                  statusMode === 'DELIVERED'
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-300"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-emerald-50 hover:border-emerald-300"
                )}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Fully Delivered</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusMode('PARTIAL')}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-lg border text-xs sm:text-sm font-bold transition-all",
                  statusMode === 'PARTIAL'
                    ? "bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-300"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-amber-50 hover:border-amber-300"
                )}
              >
                <AlertTriangle className="h-4 w-4" />
                <span>Partially Accepted</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickStatusChange('REJECTED')}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-lg border text-xs sm:text-sm font-bold transition-all",
                  statusMode === 'REJECTED'
                    ? "bg-red-600 text-white border-red-600 shadow-md ring-2 ring-red-300"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-red-50 hover:border-red-300"
                )}
              >
                <XCircle className="h-4 w-4" />
                <span>Rejected / Returned</span>
              </button>
            </div>
          </div>

          {/* Itemized Delivery Breakdown */}
          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Item-Wise Intake (Delivered vs Returned)
              </span>
              <span className="text-xs text-gray-500 font-semibold">
                Total Ordered: {sale.TotalCases} Cases
              </span>
            </div>

            <div className="space-y-2">
              {itemDeliveries.map((item, idx) => (
                <div key={item.productID} className="bg-white p-3 rounded-lg border border-gray-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-gray-900 block">{item.productName}</span>
                      <span className="text-xs text-gray-500">
                        Booked: <strong className="text-gray-800">{item.bookedQty} cases</strong> @ PKR {item.price}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-emerald-700 block">
                        Accepted: {item.deliveredQty} ctn
                      </span>
                      {item.rejectedQty > 0 && (
                        <span className="text-xs font-bold text-red-600 block">
                          Returned: {item.rejectedQty} ctn
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100">
                    <div>
                      <label className="text-[11px] font-semibold text-emerald-700 block mb-0.5">
                        Accepted Cases
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max={item.bookedQty}
                        value={item.deliveredQty}
                        onChange={(e) => handleItemDeliveredChange(idx, Number(e.target.value))}
                        className="h-8 text-xs font-bold text-emerald-800 border-emerald-300 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-red-700 block mb-0.5">
                        Rejected Cases
                      </label>
                      <Input
                        type="number"
                        value={item.rejectedQty}
                        disabled
                        className="h-8 text-xs font-bold text-red-800 bg-red-50 border-red-200"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rejection Reason Form if Any Goods Returned */}
          {totalRejected > 0 && (
            <div className="border border-red-200 bg-red-50/50 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center gap-2 text-red-800">
                <PackageX className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Log Return Reason ({totalRejected} cases coming back)
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Primary Rejection Reason
                </label>
                <select
                  value={overallReason}
                  onChange={(e) => setOverallReason(e.target.value)}
                  className="w-full text-xs sm:text-sm font-semibold border border-red-300 rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-red-500 focus:outline-none"
                >
                  {REJECTION_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Driver / Booker Remarks (Optional)
                </label>
                <Input
                  value={overallNotes}
                  onChange={(e) => setOverallNotes(e.target.value)}
                  placeholder="e.g. Shop shutter closed, owner requested delivery tomorrow morning"
                  className="text-xs bg-white border-red-200"
                />
              </div>
            </div>
          )}

          {/* Spot Payment Collection Section */}
          {actualGrandTotal > 0 && (
            <div className="border border-emerald-200 bg-emerald-50/30 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-900">
                <DollarSign className="h-4 w-4 text-emerald-700" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Payment Collection on Delivery
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full text-xs font-semibold border border-gray-300 rounded p-2 bg-white"
                  >
                    <option value="Cash">Cash (Spot)</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Cash Collected (PKR)</label>
                  <Input
                    type="number"
                    min="0"
                    max={actualGrandTotal}
                    value={cashCollected}
                    onChange={(e) => setCashCollected(Number(e.target.value))}
                    className="text-xs font-bold text-emerald-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 text-gray-600">
                <span>Credit Balance Added to Shop Ledger:</span>
                <strong className={cn("font-bold", creditAmount > 0 ? "text-amber-700" : "text-emerald-700")}>
                  PKR {creditAmount.toFixed(2)}
                </strong>
              </div>
            </div>
          )}

          {/* Financial Summary Preview - Clean Light Red & White Theme */}
          <div className="bg-red-50/70 text-slate-900 border border-red-200 rounded-xl p-3.5 space-y-2 shadow-2xs">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Booked Total ({sale.TotalCases} Cases):</span>
              <span className="font-mono font-bold text-slate-800">PKR {sale.GrandTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>Accepted Quantity Delivered:</span>
              <span className="font-bold text-red-700">{totalDelivered} Cases</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>Returned Quantity:</span>
              <span className="font-bold text-red-600">{totalRejected} Cases</span>
            </div>
            <div className="border-t border-red-200/80 pt-2 flex justify-between items-center text-sm font-black text-slate-900">
              <span>Actual Realized Sale Amount:</span>
              <span className="text-red-700 font-mono text-base font-black">
                PKR {actualGrandTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
    </ResponsiveDialog>
  );
}
