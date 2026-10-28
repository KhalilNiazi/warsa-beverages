import React, { useRef, useState } from 'react';
import { Outlet } from '@/src/types';
import { Button } from '@/src/components/ui/button';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { Printer, Download, Store, MapPin, Phone, User, CheckCircle2, FileText, Layers } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

interface OutletPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  outlets: Outlet[];
  currentRoute?: string;
}

export function OutletPrintModal({
  isOpen,
  onClose,
  outlets,
  currentRoute
}: OutletPrintModalProps) {
  const [selectedRoute, setSelectedRoute] = useState<string>(currentRoute || 'ALL');
  const [selectedOB, setSelectedOB] = useState<string>('ALL');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Available routes and Order Bookers for filters
  const routes = Array.from(new Set(outlets.map(o => o.Route).filter(Boolean))).sort();
  const orderBookers = Array.from(new Set(outlets.map(o => o.OB).filter(Boolean))).sort();

  // Filtered list
  const filteredOutlets = outlets.filter(o => {
    if (selectedRoute !== 'ALL' && o.Route !== selectedRoute) return false;
    if (selectedOB !== 'ALL' && o.OB !== selectedOB) return false;
    return true;
  }).sort((a, b) => {
    // Sort by SrNo first, then Name
    const srA = a.SrNo !== undefined ? a.SrNo : 9999;
    const srB = b.SrNo !== undefined ? b.SrNo : 9999;
    if (srA !== srB) return srA - srB;
    return a.Name.localeCompare(b.Name);
  });

  const totalBalance = filteredOutlets.reduce((sum, o) => sum + (o.OpeningBalance || 0), 0);

  const handlePrint = () => {
    const printContent = printAreaRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the customer directory.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Customer Directory - Warsa Pure Water</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              font-size: 10px;
              color: #111827;
              margin: 0;
              padding: 0;
              background: #fff;
            }
            .header-bar {
              background: #111827;
              color: white;
              padding: 12px 16px;
              border-radius: 6px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
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
            .badge-sr {
              background: #fee2e2;
              color: #991b1b;
              font-weight: 800;
              padding: 2px 4px;
              border-radius: 3px;
              display: inline-block;
            }
            .summary-box {
              display: flex;
              gap: 12px;
              margin-top: 12px;
              padding: 8px 12px;
              background: #f3f4f6;
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              font-size: 10px;
            }
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
    setExportMessage('Generating high-resolution image...');
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
      a.download = `Warsa_Customers_Directory_${format(new Date(), 'yyyyMMdd_HHmm')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setExportMessage(null);
    } catch (err) {
      console.error('Error exporting image:', err);
      alert('Failed to generate image.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!printAreaRef.current) return;
    setIsExporting(true);
    setExportMessage('Generating printable PDF...');
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
      pdf.save(`Warsa_Customers_Directory_${format(new Date(), 'yyyyMMdd')}.pdf`);
      setExportMessage(null);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      alert('Failed to generate PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Customer & Retail Outlets Directory - Print Preview"
      subtitle="Complete shop list with Sr No, Route, Contact, Order Booker, and Balances"
      className="max-w-5xl"
    >
      <div className="space-y-4">
        {/* Filter Bar & Controls */}
        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="font-bold text-gray-700">Route:</label>
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="h-8 px-2 rounded border border-gray-300 bg-white font-medium text-gray-800"
              >
                <option value="ALL">All Routes ({outlets.length})</option>
                {routes.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="font-bold text-gray-700">Order Booker:</label>
              <select
                value={selectedOB}
                onChange={(e) => setSelectedOB(e.target.value)}
                className="h-8 px-2 rounded border border-gray-300 bg-white font-medium text-gray-800"
              >
                <option value="ALL">All Bookers</option>
                {orderBookers.map(ob => (
                  <option key={ob} value={ob}>{ob}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="bg-red-600 hover:bg-red-700 text-white font-bold h-8 text-xs gap-1.5 shadow-sm"
            >
              <Printer className="h-3.5 w-3.5" /> Print Directory
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
                  40-1 Saddar Bazar, Dhaka Road, Lahore Cantt &bull; Phone: 0314-1421965
                </p>
                <div className="text-xs font-bold text-red-700 uppercase mt-1">
                  Customer & Retail Outlets Master Directory
                </div>
              </div>

              <div className="text-right text-xs">
                <div className="font-semibold text-gray-600">
                  Printed: <span className="text-gray-900 font-bold">{format(new Date(), 'dd-MMM-yyyy hh:mm a')}</span>
                </div>
                <div className="text-gray-600 mt-0.5">
                  Route Filter: <span className="font-bold text-red-700">{selectedRoute}</span>
                </div>
                <div className="text-gray-600 mt-0.5">
                  Total Outlets: <span className="font-black text-gray-900">{filteredOutlets.length}</span>
                </div>
              </div>
            </div>

            {/* Outlets Table */}
            <table className="w-full text-[11px] border-collapse border border-gray-300">
              <thead>
                <tr className="bg-red-600 text-white font-bold text-left">
                  <th className="p-1.5 border border-red-700 w-12 text-center">Sr #</th>
                  <th className="p-1.5 border border-red-700 w-20">Code</th>
                  <th className="p-1.5 border border-red-700">Shop / Customer Name</th>
                  <th className="p-1.5 border border-red-700 w-32">Route</th>
                  <th className="p-1.5 border border-red-700 w-32">Owner & Contact</th>
                  <th className="p-1.5 border border-red-700 w-28">Order Booker</th>
                  <th className="p-1.5 border border-red-700 w-24 text-right">Balance (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutlets.length > 0 ? (
                  filteredOutlets.map((o, idx) => (
                    <tr key={o.ID} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-1.5 border border-gray-200 text-center font-black text-red-600">
                        {o.SrNo !== undefined ? o.SrNo : idx + 1}
                      </td>
                      <td className="p-1.5 border border-gray-200 font-mono font-bold text-gray-700">
                        {o.Code || '-'}
                      </td>
                      <td className="p-1.5 border border-gray-200 font-bold text-gray-900">
                        <div>{o.Name}</div>
                        {o.Address && <div className="text-[9px] text-gray-500 font-normal">{o.Address}</div>}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-gray-700 font-medium">
                        {o.Route}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-gray-700">
                        <div className="font-semibold text-gray-900">{o.OwnerName || '-'}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{o.ContactNumber || '-'}</div>
                      </td>
                      <td className="p-1.5 border border-gray-200 text-gray-800 font-medium">
                        {o.OB || 'Unassigned'}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-right font-black text-gray-900">
                        Rs. {(o.OpeningBalance || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-gray-500 font-medium">
                      No outlets found matching the selected filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                  <td colSpan={3} className="p-2 text-left text-gray-800">
                    Total Customer Outlets: <span className="text-red-700 font-black">{filteredOutlets.length}</span>
                  </td>
                  <td colSpan={3} className="p-2 text-right text-gray-800">
                    Total Customer Receivables / Balances:
                  </td>
                  <td className="p-2 text-right text-red-700 font-black text-xs">
                    Rs. {totalBalance.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Footer / Signatures */}
            <div className="mt-8 pt-4 border-t border-gray-300 flex justify-between items-end text-[10px] text-gray-600">
              <div className="text-center w-36 border-t border-gray-400 pt-1 font-medium">
                Sales Supervisor
              </div>
              <div className="text-center text-gray-500 italic text-[10px]">
                Official Distribution Record &bull; KFM Beverages (WARSA)
              </div>
              <div className="text-center w-36 border-t border-gray-400 pt-1 font-medium">
                Distributor Signature
              </div>
            </div>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
