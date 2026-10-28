import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { 
  fetchOutlets, 
  fetchSales, 
  fetchPayments, 
  addPaymentRecord, 
  canModifyData,
  getCurrentUser,
  isOrderBooker,
  filterOutletsForUser,
  getUserAssignedRoutes
} from '@/src/api';
import { Outlet, SaleRecord, PaymentRecord } from '@/src/types';
import { BookOpen, Search, Plus, DollarSign, Wallet, Printer, ShieldAlert, User } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { format } from 'date-fns';
import { InvoiceDetailModal } from '@/src/components/InvoiceDetailModal';
import { PaymentDetailModal } from '@/src/components/PaymentDetailModal';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { LedgerPrintModal } from '@/src/components/LedgerPrintModal';

type LedgerEntry = {
  id: string;
  date: string;
  type: 'SALE' | 'PAYMENT';
  description: string;
  credit: number; // Sale (increases what they owe)
  debit: number; // Payment (decreases what they owe)
  balance: number;
};

export function Ledger() {
  const currentUser = getCurrentUser();
  const canEdit = canModifyData();
  const isBooker = isOrderBooker(currentUser);
  const assignedRoutes = getUserAssignedRoutes(currentUser);

  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [searchOutlet, setSearchOutlet] = useState('');
  
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<'RECEIPT' | 'RETURN'>('RECEIPT');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isLedgerPrintOpen, setIsLedgerPrintOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedOutlets, fetchedSales, fetchedPayments] = await Promise.all([
        fetchOutlets(),
        fetchSales(),
        fetchPayments()
      ]);
      setOutlets(fetchedOutlets);
      setSales(fetchedSales);
      setPayments(fetchedPayments);
    } catch (error) {
      console.error(error);
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

  const handleAddPayment = async () => {
    if (!selectedOutletId || !paymentAmount) return;
    
    try {
      const newPayment: PaymentRecord = {
        ID: `PAY-${Date.now()}`,
        Date: new Date().toISOString(),
        OutletID: selectedOutletId,
        Amount: Number(paymentAmount),
        PaymentMethod: 'Cash',
        CollectedBy: 'Order Booker / Cashier',
        Notes: paymentNotes
      };
      
      await addPaymentRecord(newPayment);
      
      setPaymentAmount('');
      setPaymentNotes('');
      setIsAddingPayment(false);
      loadData();
    } catch (error) {
      console.error("Error adding payment", error);
      alert("Failed to add payment.");
    }
  };

  const selectedOutlet = outlets.find(o => o.ID === selectedOutletId);

  // Generate Ledger Entries
  let ledgerEntries: LedgerEntry[] = [];
  let currentBalance = selectedOutlet?.OpeningBalance || 0;
  
  if (selectedOutlet) {
    const outletSales = sales.filter(s => s.OutletName === selectedOutlet.Name); // Using Name to match sales since SaleRecord doesn't save OutletID strictly, wait, SaleRecord saves OutletName. Let's make sure.
    const outletPayments = payments.filter(p => p.OutletID === selectedOutlet.ID);
    
    const combined: Array<{ date: string, type: 'SALE' | 'PAYMENT', data: any }> = [
      ...outletSales.map(s => ({ date: s.Date, type: 'SALE' as const, data: s })),
      ...outletPayments.map(p => ({ date: p.Date, type: 'PAYMENT' as const, data: p }))
    ];
    
    // Sort by Date ascending
    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    combined.forEach(entry => {
      if (entry.type === 'SALE') {
        const sale = entry.data as SaleRecord;
        currentBalance += sale.GrandTotal;
        ledgerEntries.push({
          id: sale.ID,
          date: sale.Date,
          type: 'SALE',
          description: `Invoice #${sale.ID}`,
          credit: sale.GrandTotal, // Amount added to their debt
          debit: 0,
          balance: currentBalance
        });
      } else {
        const payment = entry.data as PaymentRecord;
        if (payment.Type === 'RETURN') {
          currentBalance += payment.Amount;
        } else {
          currentBalance -= payment.Amount;
        }
        ledgerEntries.push({
          id: payment.ID,
          date: payment.Date,
          type: 'PAYMENT',
          description: payment.Notes || (payment.Type === 'RETURN' ? 'Cash Return' : 'Cash Receipt'),
          credit: payment.Type === 'RETURN' ? payment.Amount : 0,
          debit: payment.Type === 'RETURN' ? 0 : payment.Amount, // Amount reducing their debt
          balance: currentBalance
        });
      }
    });
    
    // Reverse to show newest first
    ledgerEntries.reverse();
  }

  // Calculate Lifetime cases for this outlet
  let lifetimeCases: Record<string, number> = {};
  if (selectedOutlet) {
    const outletSales = sales.filter(s => s.OutletName === selectedOutlet.Name);
    outletSales.forEach(sale => {
      sale.Items.forEach(item => {
        lifetimeCases[item.ProductName] = (lifetimeCases[item.ProductName] || 0) + item.Quantity;
      });
    });
  }

  const scopedOutlets = filterOutletsForUser(outlets, currentUser);

  const filteredOutlets = scopedOutlets.filter(o => 
    o.Name.toLowerCase().includes(searchOutlet.toLowerCase()) ||
    (o.Route && o.Route.toLowerCase().includes(searchOutlet.toLowerCase()))
  );

  const selectedInvoice = sales.find(s => s.ID === selectedInvoiceId);
  const selectedPayment = payments.find(p => p.ID === selectedPaymentId);

  return (
    <div className={`p-4 md:p-8 max-w-7xl mx-auto space-y-6 ${selectedOutletId ? 'pt-2 md:pt-8' : ''}`}>
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${selectedOutletId ? 'hidden md:flex' : 'flex'}`}>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Customer Ledger</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">
            {isBooker ? `Customer accounts & balances for route: ${assignedRoutes.join(', ') || 'Assigned Route'}` : 'Track sales, payments, and outstanding balances.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsLedgerPrintOpen(true)}
            className="border-slate-300 bg-white text-red-700 hover:bg-red-50 text-xs font-bold gap-1.5 shadow-sm h-9"
          >
            <Printer className="h-4 w-4 text-red-600" />
            Print Ledger Statement / Report
          </Button>
          {!canEdit && (
            <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-bold px-3 py-2 flex items-center gap-1.5 shadow-sm self-start sm:self-auto">
              <ShieldAlert className="h-4 w-4 text-amber-600" /> Read-Only (ASM Restricted)
            </Badge>
          )}
        </div>
      </div>

      {/* ASM Read-Only Banner */}
      {!canEdit && (
        <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl flex items-center justify-between gap-3 text-red-950 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span>
              <strong>Area Sales Manager (ASM) Read-Only Inspection:</strong> You can inspect customer balances, lifetime volumes, transaction ledgers, and invoice details. Recording cash collections and balance adjustments are restricted.
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
              <strong>Order Booker Route View:</strong> Showing Customer Ledgers for your assigned route (<strong>{assignedRoutes.join(', ') || 'Assigned Route'}</strong>). Total customers: <strong>{scopedOutlets.length}</strong>.
            </span>
          </div>
          <Badge className="bg-red-100 text-red-800 font-bold border-none shrink-0">
            My Route Ledgers
          </Badge>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar: Outlet Selection */}
        <div className={`md:col-span-1 ${selectedOutletId ? 'hidden md:block' : 'block'}`}>
          <Card className="min-h-[350px] max-h-[75vh] md:h-[calc(100vh-180px)] md:max-h-[820px] flex flex-col shadow-xs">
            <CardHeader className="pb-3 border-b border-gray-100">
              <CardTitle className="text-lg">Select Customer</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Search customers..."
                  className="pl-9 h-9"
                  value={searchOutlet}
                  onChange={(e) => setSearchOutlet(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto flex-1 no-scrollbar">
              {loading ? (
                <div className="p-4 text-center text-gray-500">Loading...</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredOutlets.map(outlet => (
                    <button
                      key={outlet.ID}
                      onClick={() => setSelectedOutletId(outlet.ID)}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${selectedOutletId === outlet.ID ? 'bg-red-50 border-l-4 border-red-600' : ''}`}
                    >
                      <div className="font-semibold text-gray-900 text-sm">{outlet.Name}</div>
                      <div className="text-xs text-gray-500 mt-1">{outlet.Route}</div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content: Ledger View */}
        <div className={`md:col-span-2 flex-col gap-6 ${!selectedOutletId ? 'hidden md:flex' : 'flex'}`}>
          {!selectedOutlet ? (
            <Card className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
              <BookOpen className="h-12 w-12 text-gray-300 mb-4" />
              <p>Select a customer from the list to view their ledger.</p>
            </Card>
          ) : (
            <>
              {/* Mobile Back Button & Customer Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div className="flex flex-col gap-1">
                  <div className="md:hidden">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedOutletId('')} className="px-0 text-red-600 hover:bg-transparent hover:text-red-700 -ml-2 h-7 text-xs">
                      &larr; Back to Customers
                    </Button>
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                    {selectedOutlet.Name}
                  </h2>
                  <p className="text-xs text-gray-500 font-medium">{selectedOutlet.Route} • Phone: {selectedOutlet.ContactNumber || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsLedgerPrintOpen(true)} 
                    className="border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold gap-1.5"
                  >
                    <Printer className="h-4 w-4 text-red-600" />
                    Print Statement
                  </Button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="bg-white">
                  <CardContent className="p-4 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Current Balance</span>
                    <span className={`text-2xl font-bold mt-1 ${currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      Rs {currentBalance.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400 mt-1">
                      {currentBalance > 0 ? 'To be collected' : (currentBalance < 0 ? 'Advance' : 'Settled')}
                    </span>
                  </CardContent>
                </Card>
                {canEdit ? (
                  <Card className="bg-red-600 text-white">
                    <CardContent className="p-4 flex flex-col justify-center h-full">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold">Record Payment</span>
                        <Wallet className="h-5 w-5 opacity-80" />
                      </div>
                      <div className="flex gap-2 w-full">
                        <Button 
                          variant="secondary" 
                          className="flex-1 bg-white text-red-600 hover:bg-gray-100 px-2"
                          onClick={() => { setIsAddingPayment(true); setPaymentType('RECEIPT'); }}
                        >
                          Receive Cash
                        </Button>
                        <Button 
                          variant="secondary" 
                          className="flex-1 bg-white text-blue-600 hover:bg-gray-100 px-2"
                          onClick={() => { setIsAddingPayment(true); setPaymentType('RETURN'); }}
                        >
                          Cash Return
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-slate-50 border border-slate-200 text-slate-800">
                    <CardContent className="p-4 flex flex-col justify-center h-full">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-slate-600 uppercase">Payment Posting</span>
                        <ShieldAlert className="h-4 w-4 text-amber-600" />
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        Read-Only Inspection: Manual payment receiving and balance adjustments are restricted for Area Sales Managers.
                      </span>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Lifetime Cases Summary */}
              {Object.keys(lifetimeCases).length > 0 && (
                <Card className="bg-white border-gray-100">
                  <CardHeader className="pb-2 pt-4 px-4 border-b border-gray-100">
                    <CardTitle className="text-sm font-semibold text-gray-700">All-Time Items Purchased</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(lifetimeCases).map(([productName, quantity]) => (
                        <div key={productName} className="bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 flex flex-col min-w-[100px]">
                          <span className="text-xs text-gray-500 truncate" title={productName}>{productName}</span>
                          <span className="text-sm font-bold text-gray-900">{quantity} Cases</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Add Payment Form */}
              <ResponsiveDialog 
                isOpen={isAddingPayment} 
                onClose={() => setIsAddingPayment(false)}
                title={`${paymentType === 'RETURN' ? 'Cash Return to' : 'New Payment from'} ${selectedOutlet.Name}`}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-600 uppercase">Amount (Rs)</label>
                      <Input 
                        type="number" 
                        placeholder="e.g. 5000" 
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-600 uppercase">Notes / Ref</label>
                      <Input 
                        placeholder="e.g. Cash handed over" 
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-6">
                    <Button type="button" variant="outline" onClick={() => setIsAddingPayment(false)}>Cancel</Button>
                    <Button onClick={handleAddPayment} className="bg-red-600 hover:bg-red-700">
                      Save Payment
                    </Button>
                  </div>
                </div>
              </ResponsiveDialog>

              {/* Transaction Table */}
              <Card className="flex-1 overflow-hidden flex flex-col">
                <CardHeader className="pb-3 border-b border-gray-100">
                  <CardTitle className="text-md">Transaction History</CardTitle>
                </CardHeader>
                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto print:block flex-1">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Description</th>
                        <th className="px-4 py-3 font-medium text-right text-red-600">Credit (Sales)</th>
                        <th className="px-4 py-3 font-medium text-right text-green-600">Debit (Receipt)</th>
                        <th className="px-4 py-3 font-medium text-right bg-gray-50">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ledgerEntries.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                            No transactions found for this customer.
                          </td>
                        </tr>
                      ) : (
                        ledgerEntries.map((entry) => (
                          <tr 
                            key={entry.id} 
                            onClick={() => {
                              if (entry.type === 'SALE') {
                                setSelectedInvoiceId(entry.id);
                              } else if (entry.type === 'PAYMENT') {
                                setSelectedPaymentId(entry.id);
                              }
                            }}
                            className={`hover:bg-gray-50/50 transition-colors cursor-pointer`}
                          >
                            <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                              {format(new Date(entry.date), 'dd MMM yyyy, HH:mm')}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-medium ${entry.type === 'SALE' ? 'text-blue-600 hover:underline' : 'text-green-700 hover:underline'}`}>
                                {entry.description}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {entry.credit > 0 ? `Rs ${entry.credit.toLocaleString()}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-green-600">
                              {entry.debit > 0 ? `Rs ${entry.debit.toLocaleString()}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold bg-gray-50/30">
                              Rs {entry.balance.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Cards */}
                <div className="md:hidden divide-y divide-gray-100 print:hidden">
                  {ledgerEntries.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-500 text-xs">
                      No transactions found for this customer.
                    </div>
                  ) : (
                    ledgerEntries.map((entry) => (
                      <div
                        key={entry.id}
                        onClick={() => {
                          if (entry.type === 'SALE') {
                            setSelectedInvoiceId(entry.id);
                          } else if (entry.type === 'PAYMENT') {
                            setSelectedPaymentId(entry.id);
                          }
                        }}
                        className="p-3.5 flex flex-col gap-2 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-xs font-bold ${entry.type === 'SALE' ? 'text-red-600' : 'text-emerald-700'}`}>
                              {entry.description}
                            </span>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {format(new Date(entry.date), 'dd MMM yyyy, hh:mm a')}
                            </p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${entry.type === 'SALE' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {entry.type === 'SALE' ? `+Rs ${entry.credit.toLocaleString()}` : `-Rs ${entry.debit.toLocaleString()}`}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-50">
                          <span className="text-gray-400">Running Balance</span>
                          <span className="font-bold text-gray-900">Rs {entry.balance.toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Invoice Detail Modal */}
              {selectedInvoice && (
                <InvoiceDetailModal invoice={selectedInvoice} onClose={() => setSelectedInvoiceId(null)} />
              )}
            </>
          )}
        </div>
        
        {selectedPayment && (
          <PaymentDetailModal 
            payment={selectedPayment} 
            onClose={() => setSelectedPaymentId(null)} 
            onPaymentDeleted={loadData}
          />
        )}
      </div>

      <LedgerPrintModal
        isOpen={isLedgerPrintOpen}
        onClose={() => setIsLedgerPrintOpen(false)}
        selectedOutlet={selectedOutlet || null}
        outlets={scopedOutlets}
        sales={sales}
        payments={payments}
        onSelectOutlet={(id) => setSelectedOutletId(id)}
      />
    </div>
  );
}
