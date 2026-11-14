import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/src/components/ui/button';
import { InventoryItem, SaleRecord, Outlet, PaymentRecord } from '@/src/types';
import { fetchOutlets, fetchSales, fetchPayments, fetchInventory } from '@/src/api';
import { format } from 'date-fns';
import { Printer } from 'lucide-react';
import { PrintOrderView } from '@/src/components/PrintOrderView';
import { buildStandardInvoicePrintItems } from '@/src/utils/invoicePrintHelper';

interface InvoiceDetailModalProps {
  invoice: SaleRecord;
  onClose: () => void;
}

export function InvoiceDetailModal({ invoice, onClose }: InvoiceDetailModalProps) {
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [outletsList, setOutletsList] = useState<Outlet[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  useEffect(() => {
    const loadLedgerData = async () => {
      try {
        const [outlets, sales, payments, inventoryItems] = await Promise.all([
          fetchOutlets(),
          fetchSales(),
          fetchPayments(),
          fetchInventory()
        ]);
        setOutletsList(outlets);
        setInventory(inventoryItems);

        const outlet = outlets.find(o => o.Name === invoice.OutletName);
        if (outlet) {
          let balance = outlet.OpeningBalance || 0;
          
          const outletSales = sales.filter(s => s.OutletName === outlet.Name);
          const outletPayments = payments.filter(p => p.OutletID === outlet.ID);
          
          outletSales.forEach(s => {
            balance += s.GrandTotal;
          });
          
          outletPayments.forEach(p => {
            if (p.Type === 'RETURN') { balance += p.Amount; } else { balance -= p.Amount; }
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
  }, [invoice]);

  const handlePrint = () => {
    document.body.classList.add('warsa-printing-invoice');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('warsa-printing-invoice');
      }, 1200);
    }, 80);
  };

  return createPortal(
    <div 
      style={{ zIndex: 999999 }}
      className="fixed inset-0 flex items-end md:items-center justify-center sm:p-4 bg-slate-950/75 backdrop-blur-sm print:bg-transparent print:p-0"
    >
      <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full md:w-auto md:min-w-[600px] max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8 md:zoom-in-95 duration-200 print:shadow-none print:max-h-none print:overflow-visible border border-slate-200">
        <PrintOrderView sale={invoice} outlets={outletsList} inventory={inventory} />
        
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 print:hidden">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">Invoice #{invoice.ID}</h2>
              {(invoice.OutletSrNo || outletsList.find(o => o.Name === invoice.OutletName)?.SrNo) && (
                <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded">
                  Sr #{invoice.OutletSrNo || outletsList.find(o => o.Name === invoice.OutletName)?.SrNo}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{invoice.OutletName} &bull; {format(new Date(invoice.Date), 'dd MMM yyyy, hh:mm a')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="print:hidden">
              <Printer className="w-4 h-4 mr-2" /> Print Both (1 Page)
            </Button>
            <Button variant="outline" size="sm" onClick={onClose} className="print:hidden">Close</Button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 space-y-6 print:hidden">
          <div className="flex flex-col sm:flex-row justify-between gap-4 p-4 bg-red-50 rounded-lg border border-red-100">
            <div>
              <p className="text-xs font-semibold text-red-800 uppercase">Remaining to Receive (Total)</p>
              {loading ? (
                <div className="h-7 w-24 bg-red-200/50 animate-pulse rounded mt-1" />
              ) : (
                <p className="text-xl font-bold text-red-600">Rs {currentBalance.toLocaleString()}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Total Invoice Value</p>
              <p className="text-xl font-bold text-gray-900">Rs {invoice.GrandTotal.toLocaleString()}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">Order Items ({invoice.TotalCases} Cases Total)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-right">Qty (Cases)</th>
                    <th className="px-4 py-2 text-right">Price</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {buildStandardInvoicePrintItems(invoice, inventory, outletsList.find(o => o.Name === invoice.OutletName)).map((item, idx) => {
                    const isQtyZero = item.qty === 0 || item.qty === '0';
                    return (
                      <tr key={idx} className={item.isPromo ? "bg-emerald-50/60" : undefined}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {item.isPromo ? (
                            <div className="flex items-center gap-1.5">
                              <span className="bg-emerald-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded tracking-wide uppercase">
                                PROMO SCHEME
                              </span>
                              <span className="text-emerald-950 font-bold">{item.desc}</span>
                            </div>
                          ) : (
                            item.desc
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${isQtyZero ? 'text-gray-400 font-normal' : 'text-gray-900'}`}>
                          {item.qty}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {item.isPromo ? <span className="text-emerald-700 font-bold">Rs. 0 (Free)</span> : typeof item.price === 'number' ? `Rs. ${item.price.toLocaleString()}` : item.price}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${isQtyZero ? 'text-gray-400 font-normal' : 'text-gray-900'}`}>
                          {item.isPromo ? (
                            <span className="text-emerald-700 uppercase text-xs bg-emerald-100 px-1.5 py-0.5 rounded font-bold">
                              {Number(item.qty) > 0 ? 'FREE' : 'Rs. 0'}
                            </span>
                          ) : (
                            typeof item.amount === 'number' ? `Rs. ${item.amount.toLocaleString()}` : item.amount
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {(invoice.HasPromo || (invoice.PromoFreeCases && invoice.PromoFreeCases > 0) || invoice.Items?.some(i => i.IsPromo)) && (
            <div className="flex justify-between items-center p-3 bg-emerald-50 border border-emerald-200 rounded text-sm">
              <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                <span className="bg-emerald-600 text-white font-black text-[10px] px-1.5 py-0.5 rounded">SCHEME</span>
                Promotional Scheme
              </span>
              <span className="font-black text-emerald-700 text-xs">
                {invoice.PromoDescription || `${invoice.PromoFreeCases || 1} Free 500ml PET Promotional Scheme`}
              </span>
            </div>
          )}

          {invoice.Discount > 0 && (
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded text-sm">
              <span className="font-medium text-gray-600">Discount Applied</span>
              <span className="font-bold text-red-600">- Rs {invoice.Discount.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
