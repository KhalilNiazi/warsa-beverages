import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SaleRecord, Outlet } from '@/src/types';
import { format } from 'date-fns';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { Button } from '@/src/components/ui/button';
import { buildStandardInvoicePrintItems } from '@/src/utils/invoicePrintHelper';
import { getSettings } from '@/src/api';
import { Printer, Download } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

interface DigitalInvoiceModalProps {
  sale: SaleRecord | null;
  outlets: Outlet[];
  isOpen: boolean;
  onClose: () => void;
}

const A4_W = 794; // px at 96dpi (210mm)
const A4_H = 1123; // px at 96dpi (297mm)

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : String(v ?? '');
};

function numberToWords(num: number): string {
  const n = Math.floor(Math.abs(num));
  if (!n) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
    'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : ''));
  const three = (x: number) =>
    (x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(three(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (thousand) parts.push(two(thousand) + ' Thousand');
  if (rest) parts.push(three(rest));
  return parts.join(' ');
}

const SHEET_CSS = `
.dinv-sheet{width:${A4_W}px;height:${A4_H}px;background:#fff;color:#000;box-sizing:border-box;padding:40px 44px;
  font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35;position:relative;display:flex;flex-direction:column}
.dinv-sheet *{box-sizing:border-box;color:#000;background:transparent}
.dinv-head{text-align:center;border-bottom:2px solid #000;padding-bottom:10px}
.dinv-co{font-size:24px;font-weight:700;letter-spacing:1px}
.dinv-sub{font-size:11px;margin-top:2px}
.dinv-title{display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px}
.dinv-title h1{font-size:16px;margin:0;letter-spacing:1px}
.dinv-copy{border:1px solid #000;padding:2px 10px;font-weight:700;font-size:11px}
.dinv-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #000}
.dinv-grid>div{padding:6px 8px;border-bottom:1px solid #000}
.dinv-grid>div:nth-child(odd){border-right:1px solid #000}
.dinv-grid>div:nth-last-child(-n+2){border-bottom:none}
.dinv-k{font-weight:700;display:inline-block;min-width:110px}
.dinv-table{width:100%;border-collapse:collapse;margin-top:14px}
.dinv-table th,.dinv-table td{border:1px solid #000;padding:7px 8px}
.dinv-table th{font-weight:700;text-align:center;border-bottom:2px solid #000}
.dinv-table td.c{text-align:center}.dinv-table td.r{text-align:right}
.dinv-bottom{display:flex;gap:16px;margin-top:14px;align-items:flex-start}
.dinv-words{flex:1;border:1px solid #000;padding:8px;min-height:92px}
.dinv-tot{width:290px;border-collapse:collapse}
.dinv-tot td{border:1px solid #000;padding:6px 8px}
.dinv-tot td:first-child{font-weight:700}.dinv-tot td:last-child{text-align:right}
.dinv-tot tr.g td{font-weight:700;font-size:14px;border-top:2px solid #000}
.dinv-sign{display:flex;justify-content:space-between;margin-top:auto;padding-top:60px}
.dinv-sign div{width:200px;border-top:1px solid #000;text-align:center;padding-top:4px;font-weight:700}
.dinv-foot{text-align:center;border-top:2px solid #000;margin-top:18px;padding-top:8px;font-size:11px}
.dinv-print-only{position:fixed;left:-99999px;top:0}
@media print{
  @page{size:A4 portrait;margin:0}
  body.dinv-printing > *:not(.dinv-print-only){display:none !important}
  body.dinv-printing .dinv-print-only{position:static !important;left:auto !important;display:block !important}
  .dinv-sheet{width:210mm !important;height:297mm !important;page-break-after:avoid}
}
`;

export function DigitalInvoiceModal({ sale, outlets, isOpen, onClose }: DigitalInvoiceModalProps) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [copy, setCopy] = useState<'ORIGINAL' | 'CUSTOMER'>('ORIGINAL');
  const [scale, setScale] = useState(0.7);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setScale(w < 640 ? (w - 40) / A4_W : w < 1000 ? 0.7 : 0.85);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!sale) return null;

  let settings: any = {};
  try { settings = getSettings() || {}; } catch { /* ignore */ }
  const companyName = settings.companyName || 'KFM BEVERAGES (WARSA)';
  const companyAddress = settings.companyAddress || '40-1 Saddar Bazar, Dhaka Road, Lahore Cantt';
  const companyPhone = settings.companyPhone || '0314-1421965';

  const outlet = outlets.find(o =>
    o.Name === sale.OutletName || (sale.OutletCode && o.Code === sale.OutletCode) || o.Address === sale.Address
  );
  const outletCode = outlet?.Code || sale.OutletCode || '-';
  const balance = outlet?.OpeningBalance !== undefined ? outlet.OpeningBalance : sale.GrandTotal;
  const items = buildStandardInvoicePrintItems(sale, outlet);

  let dateText = sale.Date || '';
  try { if (sale.Date) dateText = format(new Date(sale.Date), 'dd/MM/yyyy HH:mm'); } catch { /* keep raw */ }

  const status = String(sale.DeliveryStatus || sale.Status || 'BOOKED').toUpperCase();
  const grand = Number(sale.GrandTotal) || 0;

  const Sheet = () => (
    <div className="dinv-sheet">
      <div className="dinv-head">
        <div className="dinv-co">{companyName.toUpperCase()}</div>
        <div className="dinv-sub">Bottled Drinking Water &bull; Distribution</div>
        <div className="dinv-sub">{companyAddress} &bull; Tel: {companyPhone}</div>
      </div>

      <div className="dinv-title">
        <h1>SALES INVOICE &ndash; BOOKED ORDER</h1>
        <span className="dinv-copy">{copy === 'CUSTOMER' ? 'CUSTOMER COPY' : 'ORIGINAL COPY'}</span>
      </div>

      <div className="dinv-grid">
        <div><span className="dinv-k">Invoice #:</span>{sale.ID}</div>
        <div><span className="dinv-k">Date:</span>{dateText}</div>
        <div><span className="dinv-k">Outlet Name:</span>{sale.OutletName}</div>
        <div><span className="dinv-k">Outlet Code:</span>{outletCode}</div>
        <div><span className="dinv-k">Address:</span>{sale.Address || outlet?.Address || '-'}</div>
        <div><span className="dinv-k">Route:</span>{sale.Route || '-'}</div>
        <div><span className="dinv-k">Owner:</span>{sale.OwnerName || outlet?.OwnerName || '-'}</div>
        <div><span className="dinv-k">Contact:</span>{sale.ContactNumber || outlet?.ContactNumber || '-'}</div>
        <div><span className="dinv-k">Order Booker:</span>{sale.BookedBy || sale.OrderBooker || outlet?.OB || '-'}</div>
        <div><span className="dinv-k">Status:</span>{status}</div>
        <div><span className="dinv-k">Payment:</span>{sale.PaymentMethod || 'Credit'}</div>
        <div><span className="dinv-k">Customer Balance:</span>Rs. {money(balance)}</div>
      </div>

      <table className="dinv-table">
        <thead>
          <tr>
            <th style={{ width: 50 }}>#</th>
            <th>Description</th>
            <th style={{ width: 110 }}>Qty (Cases)</th>
            <th style={{ width: 120 }}>Rate</th>
            <th style={{ width: 140 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 4).map((it, i) => (
            <tr key={i}>
              <td className="c">{it.num}</td>
              <td>{it.desc}</td>
              <td className="c">{money(it.qty)}</td>
              <td className="r">{typeof it.price === 'number' ? money(it.price) : it.price}</td>
              <td className="r">{typeof it.amount === 'number' ? money(it.amount) : it.amount}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>TOTAL CASES</td>
            <td className="c" style={{ fontWeight: 700 }}>{money(sale.TotalCases)}</td>
            <td colSpan={2}></td>
          </tr>
        </tbody>
      </table>

      <div className="dinv-bottom">
        <div className="dinv-words">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Amount in words:</div>
          <div>Rupees {numberToWords(grand)} Only</div>
          {sale.HasPromo && sale.PromoDescription ? (
            <div style={{ marginTop: 8 }}><b>Promo:</b> {sale.PromoDescription}</div>
          ) : null}
        </div>
        <table className="dinv-tot">
          <tbody>
            <tr><td>Total Amount</td><td>Rs. {money(sale.TotalAmount)}</td></tr>
            <tr><td>Discount</td><td>Rs. {money(sale.Discount || 0)}</td></tr>
            <tr className="g"><td>GRAND TOTAL</td><td>Rs. {money(sale.GrandTotal)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="dinv-sign">
        <div>Customer Signature</div>
        <div>Order Booker / Delivered By</div>
      </div>

      <div className="dinv-foot">
        Thank you for your business! &bull; WhatsApp: 03415956432 &bull; Helpline: 03413475816<br />
        This is a computer generated invoice.
      </div>
    </div>
  );

  const handlePrint = () => {
    document.body.classList.add('dinv-printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('dinv-printing'), 1000);
    }, 80);
  };

  const handleDownloadPdf = async () => {
    const el = exportRef.current?.querySelector('.dinv-sheet') as HTMLElement | null;
    if (!el) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
      pdf.save(`Invoice_${sale.ID}_${copy === 'CUSTOMER' ? 'Customer' : 'Original'}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Could not download invoice PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ResponsiveDialog
        isOpen={isOpen}
        onClose={onClose}
        title={`Invoice #${sale.ID}`}
        subtitle="Digital A4 invoice (black & white)"
        size="full"
      >
        <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <div className="inline-flex rounded-md overflow-hidden border border-slate-300">
              {(['ORIGINAL', 'CUSTOMER'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCopy(c)}
                  className={`px-3 py-1.5 text-xs font-bold ${copy === c ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                >
                  {c === 'ORIGINAL' ? 'Original Copy' : 'Customer Copy'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={busy} className="gap-1.5 text-xs font-bold">
                <Download className="h-3.5 w-3.5" /> {busy ? 'Preparing...' : 'Download PDF'}
              </Button>
              <Button size="sm" onClick={handlePrint} className="gap-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white">
                <Printer className="h-3.5 w-3.5" /> Print A4
              </Button>
            </div>
          </div>

          <div className="overflow-auto bg-slate-200 rounded-xl p-3 flex justify-center">
            <div style={{ width: A4_W * scale, height: A4_H * scale }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: A4_W, height: A4_H, boxShadow: '0 1px 6px rgba(0,0,0,.25)' }}>
                <Sheet />
              </div>
            </div>
          </div>
        </div>
      </ResponsiveDialog>

      {isOpen && typeof document !== 'undefined' &&
        createPortal(
          <div className="dinv-print-only" ref={exportRef}>
            <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />
            <Sheet />
          </div>,
          document.body
        )}
    </>
  );
}