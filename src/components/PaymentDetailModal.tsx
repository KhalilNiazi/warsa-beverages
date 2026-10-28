import React, { useEffect, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { PaymentRecord, Outlet } from '@/src/types';
import { fetchOutlets, fetchSales, fetchPayments, deletePayment, canModifyData } from '@/src/api';
import { format } from 'date-fns';
import { Printer, CheckCircle2, ArrowDownLeft, ArrowUpRight, Trash2 } from 'lucide-react';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';

interface PaymentDetailModalProps {
  payment: PaymentRecord;
  onClose: () => void;
  onPaymentDeleted?: () => void;
}

export function PaymentDetailModal({ payment, onClose, onPaymentDeleted }: PaymentDetailModalProps) {
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const canEdit = canModifyData();

  useEffect(() => {
    const loadLedgerData = async () => {
      try {
        const [outlets, sales, payments] = await Promise.all([
          fetchOutlets(),
          fetchSales(),
          fetchPayments()
        ]);
        const foundOutlet = outlets.find(o => o.ID === payment.OutletID);
        setOutlet(foundOutlet || null);

        if (foundOutlet) {
          let balance = foundOutlet.OpeningBalance || 0;
          
          const outletSales = sales.filter(s => s.OutletName === foundOutlet.Name);
          const outletPayments = payments.filter(p => p.OutletID === foundOutlet.ID);
          
          outletSales.forEach(s => {
            balance += s.GrandTotal;
          });
          
          outletPayments.forEach(p => {
            if (p.Type === 'RETURN') {
              balance += p.Amount;
            } else {
              balance -= p.Amount;
            }
          });
          
          setCurrentBalance(balance);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    loadLedgerData();
  }, [payment]);

  const isReturn = payment.Type === 'RETURN';

  return (
    <ResponsiveDialog
      open={true}
      onClose={onClose}
      title={isReturn ? 'Cash Return Voucher' : 'Cash Receipt Voucher'}
      subtitle={`Voucher #${payment.ID} • ${format(new Date(payment.Date), 'dd MMM yyyy, hh:mm a')}`}
      size="sm"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <div>
            {canEdit && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowDeleteConfirm(true)} 
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Voucher
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="w-4 h-4 text-red-600" /> Print Receipt
            </Button>
            <Button variant="default" size="sm" onClick={onClose} className="bg-red-600 hover:bg-red-700">
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className={`flex flex-col items-center justify-center p-5 rounded-xl border ${isReturn ? 'bg-blue-50/60 border-blue-200 text-blue-900' : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'}`}>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1">
            {isReturn ? (
              <>
                <ArrowUpRight className="w-4 h-4 text-blue-600" />
                <span>Amount Returned to Customer</span>
              </>
            ) : (
              <>
                <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                <span>Amount Collected</span>
              </>
            )}
          </div>
          <p className={`text-3xl font-black ${isReturn ? 'text-blue-700' : 'text-emerald-700'}`}>
            PKR {payment.Amount.toLocaleString()}
          </p>
        </div>

        <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-100 space-y-2.5 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
            <span className="text-gray-500 font-medium">Customer / Outlet</span>
            <span className="font-bold text-gray-900">{outlet?.Name || 'Unknown'}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
            <span className="text-gray-500 font-medium">Receipt Ref</span>
            <span className="font-mono font-bold text-red-600">{payment.ID}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
            <span className="text-gray-500 font-medium">Collected / Handled By</span>
            <span className="font-semibold text-gray-800">{payment.CollectedBy || 'Cashier / Driver'}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
            <span className="text-gray-500 font-medium">Payment Mode</span>
            <span className="font-semibold text-gray-800">{payment.PaymentMethod || 'Cash'}</span>
          </div>
          <div className="flex flex-col py-1 border-b border-gray-200/60">
            <span className="text-gray-500 font-medium mb-0.5">Notes / Description</span>
            <span className="font-medium text-gray-900">{payment.Notes || 'None'}</span>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-gray-500 font-bold uppercase">Outlet Remaining Balance</span>
            <span className="font-black text-sm text-red-600">
              {loading ? '...' : `PKR ${currentBalance.toLocaleString()}`}
            </span>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Payment Voucher?"
        description={`Are you sure you want to delete payment voucher #${payment.ID} of PKR ${payment.Amount.toLocaleString()}? This action cannot be undone.`}
        confirmText="Yes, Delete Voucher"
        isLoading={isDeleting}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            await deletePayment(payment.ID);
            if (onPaymentDeleted) onPaymentDeleted();
            onClose();
          } catch (e) {
            console.error('Failed to delete payment', e);
          } finally {
            setIsDeleting(false);
          }
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </ResponsiveDialog>
  );
}
