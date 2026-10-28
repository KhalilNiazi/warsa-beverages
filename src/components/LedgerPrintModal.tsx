import React, { useRef, useState } from 'react';
import { Outlet, SaleRecord, PaymentRecord } from '@/src/types';
import { Button } from '@/src/components/ui/button';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { Printer, Download, BookOpen, FileText, User, Calendar, CheckCircle2 } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

interface LedgerPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOutlet: Outlet | null;
  outlets: Outlet[];
  sales: SaleRecord[];
  payments: PaymentRecord[];
  onSelectOutlet?: (outletId: string) => void;
}

export function LedgerPrintModal({
  isOpen,
  onClose,
  selectedOutlet,
  outlets,
  sales,
  payments,
  onSelectOutlet
}: LedgerPrintModalProps) {
  const [activeMode, setActiveMode] = useState<'single' | 'summary'>(selectedOutlet ? 'single' : 'summary');
  const [outletId, setOutletId] = useState<string>(selectedOutlet?.ID || (outlets[0]?.ID || ''));
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

  const currentOutlet = outlets.find(o => o.ID === (selectedOutlet?.ID || outletId)) || outlets[0];

  // Compute transactions for current outlet
  const outletSales = currentOutlet ? sales.filter(s => s.OutletID === currentOutlet.ID || s.OutletName === currentOutlet.Name) : [];
  const outletPayments = currentOutlet ? payments.filter(p => p.OutletID === currentOutlet.ID) : [];

  const rawTransactions: Array<{
    id: string;
    date: string;
    type: 'INVOICE' | 'PAYMENT';
    ref: string;
    description: string;
    debit: number;  // increases customer debt
    credit: number; // decreases customer debt
  }> = [];

  outletSales.forEach(s => {
    rawTransactions.push({
      id: s.ID,
      date: s.Date,
      type: 'INVOICE',
      ref: `INV #${s.ID}`,
      description: `Sales Order: ${s.TotalCases} cases (${s.Items?.map(i => `${i.ProductName || 'Item'}: ${i.Quantity}cs`).join(', ') || ''})`,
      debit: Number(s.GrandTotal || 0),
      credit: 0
    });
  });

  outletPayments.forEach(p => {
    rawTransactions.push({
      id: p.ID,
      date: p.Date,
      type: 'PAYMENT',
      ref: `PAY #${p.ID}`,
      description: `Cash Collection: ${p.Notes || p.PaymentMethod || 'Payment Received'}`,
      debit: 0,
      credit: Number(p.Amount || 0)
    });
  });

  rawTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = currentOutlet ? (Number(currentOutlet.OpeningBalance) || 0) : 0;
  const ledgerEntries = rawTransactions.map(t => {
    runningBalance = runningBalance + t.debit - t.credit;
    return {
      ...t,
      balance: runningBalance
    };
  });

  const totalDebits = rawTransactions.reduce((sum, t) => sum + t.debit, 0);
  const totalCredits = rawTransactions.reduce((sum, t) => sum + t.credit, 0);
  const finalBalance = runningBalance;

  // Summary of all outlets
  const allOutletsSummary = outlets.map(o => {
    const oSales = sales.filter(s => s.OutletID === o.ID || s.OutletName === o.Name);
    const oPayments = payments.filter(p => p.OutletID === o.ID);
    const oTotalInvoiced = oSales.reduce((sum, s) => sum + (Number(s.GrandTotal) || 0), 0);
    const oTotalPaid = oPayments.reduce((sum, p) => sum + (Number(p.Amount) || 0), 0);
    const oOpening = Number(o.OpeningBalance) || 0;
    const oBalance = oOpening + oTotalInvoiced - oTotalPaid;
    return {
      ...o,
      totalInvoiced: oTotalInvoiced,
      totalPaid: oTotalPaid,
      closingBalance: oBalance
    };
  });

  const handlePrint = () => {
    const printContent = printAreaRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${activeMode === 'single' ? `Ledger_${currentOutlet?.Name}` : 'All_Customers_Ledger_Summary'}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            body {
              font-family: Arial, sans-serif;
              font-size: 10px;
              color: #111827;
              margin: 0;
              padding: 0;
              background: #fff;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
            }
            th {
              background: #dc2626;
              color: white;
              font-size: 9px;
              font-weight: bold;
              text-transform: uppercase;
              padding: 6px 4px;
              border: 1px solid #b91c1c;
              text-align: left;
            }
            td {
              padding: 5px 4px;
              border: 1px solid #e5e7eb;
              font-size: 9px;
            }
            tr:nth-child(even) {
              background: #f9fafb;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
  };

  const handleDownloadPNG = async () => {
    if (!printAreaRef.current) return;
    setIsExporting(true);
    setExportMessage('Generating statement picture...');
    try {
      const canvas = await html2canvas(printAreaRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imgData;
      a.download = `Ledger_${activeMode === 'single' ? (currentOutlet?.Name || 'Customer') : 'All_Customers'}_${format(new Date(), 'yyyyMMdd')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setExportMessage(null);
    } catch (err) {
      console.error('Error generating image:', err);
      alert('Could not download image.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!printAreaRef.current) return;
    setIsExporting(true);
    setExportMessage('Generating statement PDF...');
    try {
      const canvas = await html2canvas(printAreaRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Ledger_${activeMode === 'single' ? (currentOutlet?.Name || 'Customer') : 'All_Customers'}_${format(new Date(), 'yyyyMMdd')}.pdf`);
      setExportMessage(null);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Could not download PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Customer Ledger Statement - Print Preview"
      subtitle="Complete accounting ledger, debit/credit transactions, and balance statement"
      className="max-w-5xl"
    >
      <div className="space-y-4">
        {/* Top Controls */}
        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-gray-200 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveMode('single')}
                className={`px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                  activeMode === 'single'
                    ? 'bg-white text-red-600 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Customer Account Statement
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('summary')}
                className={`px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                  activeMode === 'summary'
                    ? 'bg-white text-red-600 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All Customers Ledger Summary
              </button>
            </div>

            {activeMode === 'single' && (
              <div className="flex items-center gap-1.5">
                <label className="font-bold text-gray-700">Customer:</label>
                <select
                  value={outletId}
                  onChange={(e) => {
                    setOutletId(e.target.value);
                    if (onSelectOutlet) onSelectOutlet(e.target.value);
                  }}
                  className="h-8 px-2 rounded border border-gray-300 bg-white font-semibold text-gray-800 text-xs"
                >
                  {outlets.map(o => (
                    <option key={o.ID} value={o.ID}>
                      Sr #{o.SrNo || o.ID} &bull; {o.Name} ({o.Route})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="bg-red-600 hover:bg-red-700 text-white font-bold h-8 text-xs gap-1.5 shadow-sm"
            >
              <Printer className="h-3.5 w-3.5" /> Print Statement
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isExporting}
              onClick={handleDownloadPNG}
              className="bg-white border-gray-300 text-gray-800 hover:bg-gray-100 font-bold h-8 text-xs gap-1.5 shadow-sm"
            >
              <Download className="h-3.5 w-3.5 text-blue-600" /> Save Image (PNG)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isExporting}
              onClick={handleDownloadPDF}
              className="bg-white border-gray-300 text-gray-800 hover:bg-gray-100 font-bold h-8 text-xs gap-1.5 shadow-sm"
            >
              <FileText className="h-3.5 w-3.5 text-red-600" /> Save PDF
            </Button>
          </div>
        </div>

        {exportMessage && (
          <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-xs font-semibold animate-pulse text-center">
            {exportMessage}
          </div>
        )}

        {/* Printable Document Preview */}
        <div className="border border-gray-200 rounded-xl bg-gray-100 p-4 max-h-[68vh] overflow-y-auto">
          <div
            ref={printAreaRef}
            className="bg-white p-6 rounded-lg shadow-sm border border-gray-300 text-gray-900 font-sans max-w-4xl mx-auto"
          >
            {/* Header */}
            <div className="border-b-2 border-red-600 pb-3 mb-4 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-red-600 text-white font-black px-2 py-0.5 rounded text-sm tracking-wider">
                    WARSA
                  </span>
                  <h2 className="text-xl font-black tracking-tight text-gray-900 uppercase">
                    KFM Beverages - Warsa Pure Drinking Water
                  </h2>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  40-1 Saddar Bazar, Dhaka Road, Lahore Cantt &bull; Contact: 0314-1421965
                </p>
                <div className="text-xs font-bold text-red-700 uppercase mt-1">
                  {activeMode === 'single' ? 'Customer Account Statement & Ledger' : 'All Customers Accounts Ledger Summary'}
                </div>
              </div>

              <div className="text-right text-xs">
                <div className="font-semibold text-gray-600">
                  Date: <span className="text-gray-900 font-bold">{format(new Date(), 'dd-MMM-yyyy')}</span>
                </div>
                <div className="text-gray-600 mt-0.5">
                  Time: <span className="font-bold text-gray-900">{format(new Date(), 'hh:mm a')}</span>
                </div>
              </div>
            </div>

            {activeMode === 'single' ? (
              <>
                {/* Customer Details Strip */}
                {currentOutlet && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500 uppercase font-semibold text-[10px] block">Customer Name:</span>
                      <span className="font-black text-gray-900 text-sm">{currentOutlet.Name}</span>
                      <span className="text-[10px] text-gray-500 block">Sr #{currentOutlet.SrNo || currentOutlet.ID} &bull; Code: {currentOutlet.Code || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 uppercase font-semibold text-[10px] block">Route:</span>
                      <span className="font-bold text-gray-800">{currentOutlet.Route}</span>
                      <span className="text-[10px] text-gray-500 block">OB: {currentOutlet.OB || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 uppercase font-semibold text-[10px] block">Contact / Owner:</span>
                      <span className="font-bold text-gray-800">{currentOutlet.OwnerName || 'N/A'}</span>
                      <span className="text-[10px] text-gray-500 block font-mono">{currentOutlet.ContactNumber || 'N/A'}</span>
                    </div>
                    <div className="text-right sm:text-right">
                      <span className="text-gray-500 uppercase font-semibold text-[10px] block">Current Net Balance:</span>
                      <span className="font-black text-red-600 text-base">
                        Rs. {finalBalance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Ledger Transactions Table */}
                <table className="w-full text-[11px] border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-red-600 text-white font-bold text-left">
                      <th className="p-1.5 border border-red-700 w-24">Date</th>
                      <th className="p-1.5 border border-red-700 w-24">Ref / Invoice #</th>
                      <th className="p-1.5 border border-red-700">Description / Details</th>
                      <th className="p-1.5 border border-red-700 text-right w-24">Debit (Sale Rs)</th>
                      <th className="p-1.5 border border-red-700 text-right w-24">Credit (Paid Rs)</th>
                      <th className="p-1.5 border border-red-700 text-right w-28">Balance (PKR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening Balance Row */}
                    <tr className="bg-amber-50/60 font-semibold text-gray-800">
                      <td className="p-1.5 border border-gray-200 text-center">-</td>
                      <td className="p-1.5 border border-gray-200 font-mono font-bold text-amber-900">OPENING</td>
                      <td className="p-1.5 border border-gray-200">Opening Balance Brought Forward</td>
                      <td className="p-1.5 border border-gray-200 text-right font-mono">
                        {Number(currentOutlet?.OpeningBalance || 0) > 0 ? `Rs. ${Number(currentOutlet?.OpeningBalance || 0).toLocaleString()}` : '-'}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-right font-mono">-</td>
                      <td className="p-1.5 border border-gray-200 text-right font-black text-gray-900">
                        Rs. {Number(currentOutlet?.OpeningBalance || 0).toLocaleString()}
                      </td>
                    </tr>

                    {ledgerEntries.length > 0 ? (
                      ledgerEntries.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="p-1.5 border border-gray-200 text-gray-700 font-mono">
                            {format(new Date(row.date), 'dd-MMM-yyyy')}
                          </td>
                          <td className="p-1.5 border border-gray-200 font-mono font-bold text-gray-900">
                            {row.ref}
                          </td>
                          <td className="p-1.5 border border-gray-200 text-gray-700">
                            {row.description}
                          </td>
                          <td className="p-1.5 border border-gray-200 text-right font-mono font-bold text-gray-900">
                            {row.debit > 0 ? `Rs. ${row.debit.toLocaleString()}` : '-'}
                          </td>
                          <td className="p-1.5 border border-gray-200 text-right font-mono font-bold text-emerald-700">
                            {row.credit > 0 ? `Rs. ${row.credit.toLocaleString()}` : '-'}
                          </td>
                          <td className="p-1.5 border border-gray-200 text-right font-mono font-black text-gray-900">
                            Rs. {row.balance.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-gray-500 font-medium">
                          No transactions recorded yet for this customer.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                      <td colSpan={3} className="p-2 text-right text-gray-800 uppercase">
                        Period Totals:
                      </td>
                      <td className="p-2 text-right text-gray-900 font-black">
                        Rs. {totalDebits.toLocaleString()}
                      </td>
                      <td className="p-2 text-right text-emerald-700 font-black">
                        Rs. {totalCredits.toLocaleString()}
                      </td>
                      <td className="p-2 text-right text-red-700 font-black text-xs">
                        Rs. {finalBalance.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </>
            ) : (
              /* ALL OUTLETS SUMMARY TABLE */
              <table className="w-full text-[11px] border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-red-600 text-white font-bold text-left">
                    <th className="p-1.5 border border-red-700 w-12 text-center">Sr #</th>
                    <th className="p-1.5 border border-red-700">Customer Outlet</th>
                    <th className="p-1.5 border border-red-700 w-28">Route</th>
                    <th className="p-1.5 border border-red-700 text-right w-24">Opening (Rs)</th>
                    <th className="p-1.5 border border-red-700 text-right w-24">Total Sales (Rs)</th>
                    <th className="p-1.5 border border-red-700 text-right w-24">Total Paid (Rs)</th>
                    <th className="p-1.5 border border-red-700 text-right w-28">Current Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {allOutletsSummary.map((o, idx) => (
                    <tr key={o.ID} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-1.5 border border-gray-200 text-center font-bold text-red-600">
                        {o.SrNo !== undefined ? o.SrNo : idx + 1}
                      </td>
                      <td className="p-1.5 border border-gray-200 font-bold text-gray-900">
                        <div>{o.Name}</div>
                        <div className="text-[10px] text-gray-500 font-normal">[{o.Code || '-'}] &bull; {o.ContactNumber || '-'}</div>
                      </td>
                      <td className="p-1.5 border border-gray-200 text-gray-700 font-medium">
                        {o.Route}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-right font-mono">
                        Rs. {(o.OpeningBalance || 0).toLocaleString()}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-right font-mono font-bold text-gray-900">
                        Rs. {o.totalInvoiced.toLocaleString()}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-right font-mono font-bold text-emerald-700">
                        Rs. {o.totalPaid.toLocaleString()}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-right font-mono font-black text-gray-900">
                        Rs. {o.closingBalance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                    <td colSpan={3} className="p-2 text-right uppercase">
                      Total Across All Customers:
                    </td>
                    <td className="p-2 text-right text-gray-800">
                      Rs. {allOutletsSummary.reduce((s, o) => s + (Number(o.OpeningBalance) || 0), 0).toLocaleString()}
                    </td>
                    <td className="p-2 text-right text-gray-900">
                      Rs. {allOutletsSummary.reduce((s, o) => s + o.totalInvoiced, 0).toLocaleString()}
                    </td>
                    <td className="p-2 text-right text-emerald-700">
                      Rs. {allOutletsSummary.reduce((s, o) => s + o.totalPaid, 0).toLocaleString()}
                    </td>
                    <td className="p-2 text-right text-red-700 font-black text-xs">
                      Rs. {allOutletsSummary.reduce((s, o) => s + o.closingBalance, 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Footer / Signatures */}
            <div className="mt-8 pt-4 border-t border-gray-300 flex justify-between items-end text-[10px] text-gray-600">
              <div className="text-center w-36 border-t border-gray-400 pt-1 font-medium">
                Customer Signature
              </div>
              <div className="text-center text-gray-500 italic text-[10px]">
                Computer Generated Account Statement &bull; KFM Beverages (WARSA)
              </div>
              <div className="text-center w-36 border-t border-gray-400 pt-1 font-medium">
                Accounts Incharge
              </div>
            </div>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
