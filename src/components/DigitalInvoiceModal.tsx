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
  exportFormat?: 'png' | 'pdf' | null;
  onExportComplete?: () => void;
}

const A4_W = 1123; // px at 96dpi (297mm)
const A4_H = 794; // px at 96dpi (210mm)

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
.dinv-sheet{width:${A4_W}px;height:${A4_H}px;background:#fff;color:#000;box-sizing:border-box;padding:45px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;display:flex;flex-direction:column}
.dinv-sheet *{box-sizing:border-box;color:#000;background:transparent}
.dinv-hd{display:flex;justify-content:space-between;align-items:flex-start}
.dinv-co{font-size:22px;font-weight:700}.dinv-hd p{margin:2px 0;font-size:11px}
.dinv-rt{text-align:right;font-size:11px}.dinv-rt b{font-size:16px;letter-spacing:2px}
.dinv-frame{border:1px solid #000;border-radius:6px;margin-top:8px;padding:8px 10px;display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:14px}
.dinv-frame div div{padding:1px 0}.dinv-frame b{display:inline-block;min-width:84px}
.dinv-items{width:100%;border-collapse:collapse;margin-top:10px;border-top:1px solid #000;border-bottom:1px solid #000}
.dinv-items th{text-align:left;padding:6px;border-bottom:1px solid #000}
.dinv-items td{padding:6px;border-bottom:1px solid #000}
.dinv-items .r{text-align:right}.dinv-items .c{text-align:center}
.dinv-items .ex td{font-weight:700;font-style:italic;padding:3px 6px;border-bottom:0}
.dinv-items .t td{font-weight:700}.dinv-items .tl{text-align:right}
.dinv-sum{width:340px;border-collapse:collapse;margin:12px 0 0 auto}
.dinv-sum td{padding:3px 6px}.dinv-sum td:last-child{text-align:right;width:120px}
.dinv-sum .g td{font-weight:700;border-top:1px solid #000;padding-top:8px}
.dinv-words{margin-top:10px;font-size:11px}
.dinv-sign{display:flex;justify-content:space-between;margin-top:auto;padding-top:70px}
.dinv-sign div{width:160px;border-top:1px solid #000;text-align:center;padding-top:4px;font-weight:700}
.dinv-note{margin-top:12px;border:1px solid #000;padding:8px;font-size:11px;white-space:pre-wrap}
.dinv-foot{text-align:center;margin-top:14px;font-size:10px}
.dinv-print-only{position:fixed;left:-99999px;top:0}
@media print{
  @page{size:A4 landscape;margin:0}
  body.dinv-printing > *:not(.dinv-print-only){display:none !important}
  body.dinv-printing .dinv-print-only{position:static !important;left:auto !important;display:block !important}
  .dinv-sheet{width:297mm !important;height:210mm !important;page-break-after:avoid}
}
`;

export function DigitalInvoiceModal({
  sale,
  outlets,
  isOpen,
  onClose,
  exportFormat = null,
  onExportComplete
}: DigitalInvoiceModalProps) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [copy, setCopy] = useState<'ORIGINAL' | 'CUSTOMER'>('ORIGINAL');
  const [scale, setScale] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState<string>(() => {
    try { return localStorage.getItem('warsa_inv_custom_label') || 'Remarks'; } catch { return 'Remarks'; }
  });
  const [customText, setCustomText] = useState<string>(() => {
    try { return localStorage.getItem('warsa_inv_custom_text') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try {
      localStorage.setItem('warsa_inv_custom_label', customLabel);
      localStorage.setItem('warsa_inv_custom_text', customText);
    } catch { /* storage unavailable */ }
  }, [customLabel, customText]);
  const [taxRate, setTaxRate] = useState<number>(() => {
    try { const r = Number((getSettings() as any).invoiceTaxRate); return [0, 16, 18].includes(r) ? r : 0; } catch { return 0; }
  });

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setScale(w < 640 ? (w - 40) / A4_W : w < 1000 ? 0.7 : 0.85);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isOpen || !sale || !exportFormat) return;
    const timer = window.setTimeout(async () => {
      const el = exportRef.current?.querySelector('.dinv-sheet') as HTMLElement | null;
      if (!el) {
        console.error('Digital invoice export target is unavailable.');
        onExportComplete?.();
        return;
      }

      try {
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
        if (exportFormat === 'png') {
          const anchor = document.createElement('a');
          anchor.href = canvas.toDataURL('image/png');
          anchor.download = `Invoice_${sale.ID}_Digital.png`;
          anchor.click();
        } else {
          const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210);
          pdf.save(`Invoice_${sale.ID}_Digital.pdf`);
        }
      } catch (err) {
        console.error(`Digital invoice ${exportFormat.toUpperCase()} export failed:`, err);
        alert(`Could not download digital invoice ${exportFormat.toUpperCase()}.`);
      } finally {
        onExportComplete?.();
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [exportFormat, isOpen, onExportComplete, sale]);

  if (!sale) return null;

  let settings: any = {};
  try { settings = getSettings() || {}; } catch { /* ignore */ }
  const companyName = settings.companyName || 'KFM BEVERAGES (WARSA)';
  const companyAddress = settings.companyAddress || '40-1 Saddar Bazar, Dhaka Road, Lahore Cantt';
  const companyPhone = settings.companyPhone || '0314-1421965';
  const companyNTN = settings.companyNTN || '';

  const outlet = outlets.find(o =>
    o.Name === sale.OutletName || (sale.OutletCode && o.Code === sale.OutletCode) || o.Address === sale.Address
  );
  const outletCode = outlet?.Code || sale.OutletCode || '-';
  const balance = outlet?.OpeningBalance !== undefined ? outlet.OpeningBalance : sale.GrandTotal;
  const items = buildStandardInvoicePrintItems(sale, outlet);

  let dateText = sale.Date || '';
  try { if (sale.Date) dateText = format(new Date(sale.Date), 'dd-MMM-yyyy'); } catch { /* keep raw */ }

  const discount = Number(sale.Discount) || 0;
  const shown = items.filter(it => Number(it.qty) > 0);
  const base = (shown.length ? shown : items.slice(0, 1)).slice(0, 4);
  const grossOf = (it: any) => (typeof it.price === 'number' ? Number(it.qty) * it.price : 0);
  const totalGross = base.reduce((n, it) => n + grossOf(it), 0);
  const rows = base.map(it => {
    const gross = grossOf(it);
    const offer = totalGross > 0 ? Math.round((discount * gross) / totalGross) : 0;
    return { it, gross, offer, net: gross - offer };
  });
  const totalQty = rows.reduce((n, r) => n + Number(r.it.qty || 0), 0);
  const totalOffer = rows.reduce((n, r) => n + r.offer, 0);
  const net = totalGross - totalOffer;
  const taxAmount = Math.round(net * taxRate) / 100;
  const grand = net + taxAmount;
  const opening = Number(outlet?.OpeningBalance) || 0;
  const closing = opening + grand;
  const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const skuFor = (d: string) => (d.includes('1500') ? 'WAR-1.5L' : d.includes('19') ? 'WAR-19L' : 'WAR-500ML');
  const full = (d: string) => (d.startsWith('PROMO') ? 'Promo 500ml (Free)' : 'Warsa Bottled Water ' + d.replace('ML', 'ml'));
  const customerNTN = (outlet as any)?.NTN || (outlet as any)?.CustomerNTN || '';

  const Sheet = () => (
    <div className="dinv-sheet">
      <div className="dinv-hd">
        <div>
          <div className="dinv-co">{companyName.toUpperCase()}</div>
          <p>{companyAddress} &bull; Tel: {companyPhone} &bull; NTN: {companyNTN || '—'}</p>
        </div>
        <div className="dinv-rt">
          <b>{taxRate > 0 ? 'TAX INVOICE' : 'INVOICE'}</b><br />
          {outlet?.CustomerType || 'Retail'}<br />
          No. of Items: {rows.length}<br />
          {copy === 'CUSTOMER' ? 'CUSTOMER COPY' : 'ORIGINAL COPY'}
        </div>
      </div>

      <div className="dinv-frame">
        <div>
          <div><b>Buyer&rsquo;s Code:</b> {outletCode}</div>
          <div><b>Buyer&rsquo;s Name:</b> {sale.OutletName}</div>
          <div><b>Address:</b> {sale.Address || outlet?.Address || '-'}</div>
          <div><b>NTN/CNIC #:</b> {customerNTN || '—'}</div>
          <div><b>STRN #:</b> {(outlet as any)?.STRN || ''}</div>
          <div><b>Mobile No:</b> {sale.ContactNumber || outlet?.ContactNumber || '-'}</div>
        </div>
        <div>
          <div><b>Section:</b> {sale.Route || '-'}</div>
          <div><b>Order Booker:</b> {sale.BookedBy || sale.OrderBooker || outlet?.OB || '-'}</div>
          <div><b>Delivery Man:</b> {sale.DriverName || '-'}</div>
        </div>
        <div>
          <div><b>Invoice No:</b> {sale.ID}</div>
          <div><b>Invoice Date:</b> {dateText}</div>
          <div><b>Delivery Date:</b> {dateText}</div>
        </div>
      </div>

      <table className="dinv-items">
        <thead>
          <tr>
            <th style={{ width: 34 }}>Sr.</th>
            <th>Description</th>
            <th className="c" style={{ width: 48 }}>Qty</th>
            <th className="r" style={{ width: 70 }}>Trade Price</th>
            <th className="r" style={{ width: 82 }}>Gross Value</th>
            <th className="r" style={{ width: 82 }}>Trade Offer</th>
            <th className="r" style={{ width: 92 }}>Net Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="ex"><td colSpan={7}>{taxRate > 0 ? `Taxable @ ${taxRate}%` : 'Exempted'}</td></tr>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{skuFor(String(r.it.desc))} - {full(String(r.it.desc))}</td>
              <td className="c">{money(r.it.qty)}</td>
              <td className="r">{typeof r.it.price === 'number' ? money(r.it.price) : r.it.price}</td>
              <td className="r">{money(r.gross)}</td>
              <td className="r">{fmt(r.offer)}</td>
              <td className="r">{fmt(r.net)}</td>
            </tr>
          ))}
          {['Sub Total:', 'Grand Total:'].map(label => (
            <tr key={label} className="t">
              <td></td><td className="tl">{label}</td>
              <td className="c">{money(totalQty)}</td><td></td>
              <td className="r">{money(totalGross)}</td>
              <td className="r">{fmt(totalOffer)}</td>
              <td className="r">{fmt(net)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="dinv-sum">
        <tbody>
          <tr><td>Less Additional Discount</td><td>0.00</td></tr>
          <tr><td>GST {taxRate.toFixed(2)} %</td><td>{fmt(taxAmount)}</td></tr>
          <tr><td>Advance Tax 0.00 %</td><td>0.00</td></tr>
          <tr className="g"><td>Net Receivable</td><td>{fmt(grand)}</td></tr>
          <tr><td style={{ paddingTop: 14 }}>Opening Balance:</td><td style={{ paddingTop: 14 }}>{fmt(opening)} DR</td></tr>
          <tr><td>This Invoice Value:</td><td>{fmt(grand)}</td></tr>
          <tr className="g"><td>Closing Balance:</td><td>{fmt(closing)} DR</td></tr>
        </tbody>
      </table>
      <div className="dinv-words"><b>Amount in words:</b> Rupees {numberToWords(grand)} Only</div>

      {customText.trim() && (
        <div className="dinv-note"><b>{customLabel.trim() || 'Remarks'}:</b> {customText.trim()}</div>
      )}

      <div className="dinv-sign"><div>Prepared By</div><div>Checked By</div><div>Authorized By</div></div>
      <div className="dinv-foot">Computer generated invoice. Goods once sold will not be taken back.</div>
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
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210);
      pdf.save(`Invoice_${sale.ID}_${copy === 'CUSTOMER' ? 'Customer' : 'Original'}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Could not download invoice PDF.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPng = async () => {
    const el = exportRef.current?.querySelector('.dinv-sheet') as HTMLElement | null;
    if (!el) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const anchor = document.createElement('a');
      anchor.href = canvas.toDataURL('image/png');
      anchor.download = `Invoice_${sale.ID}_${copy === 'CUSTOMER' ? 'Customer' : 'Original'}.png`;
      anchor.click();
    } catch (err) {
      console.error('PNG export failed:', err);
      alert('Could not download invoice PNG.');
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
        subtitle="Professional A4 invoice (black & white)"
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
            <div className="flex gap-2 items-center">
              <Button variant="outline" size="sm" onClick={() => setShowCustom(v => !v)} className="text-xs font-bold">
                {showCustom ? 'Hide Custom Text' : 'Add Custom Text'}
              </Button>
              <label className="text-xs font-bold text-slate-700">Tax
                <select value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className="ml-1 border border-slate-300 rounded px-2 py-1 text-xs bg-white">
                  <option value={0}>0%</option><option value={16}>16%</option><option value={18}>18%</option>
                </select>
              </label>
                <Button variant="outline" size="sm" onClick={handleDownloadPng} disabled={busy} className="gap-1.5 text-xs font-bold">
                  <Download className="h-3.5 w-3.5" /> Save PNG
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={busy} className="gap-1.5 text-xs font-bold">
                  <Download className="h-3.5 w-3.5" /> {busy ? 'Preparing...' : 'Download PDF'}
              </Button>
              <Button size="sm" onClick={handlePrint} className="gap-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white">
                <Printer className="h-3.5 w-3.5" /> Print A4
              </Button>
            </div>
          </div>

          {showCustom && (
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-1">
                  <label className="text-[11px] font-bold text-slate-700">Heading</label>
                  <input value={customLabel} maxLength={30} onChange={e => setCustomLabel(e.target.value)}
                    placeholder="Remarks" className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs" />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-700">Your text (printed above the signatures)</label>
                  <textarea value={customText} maxLength={400} rows={3} onChange={e => setCustomText(e.target.value)}
                    placeholder="e.g. Bank: HBL, Account 1234... / Payment due in 7 days / Delivery note"
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs" />
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>{customText.length}/400 &bull; Saved on this device for the next invoices. Leave empty to hide.</span>
                <button type="button" onClick={() => setCustomText('')} className="font-bold text-slate-700 underline">Clear text</button>
              </div>
            </div>
          )}

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