import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DeliveryMan, InventoryItem, SaleRecord, Outlet } from '@/src/types';
import { format } from 'date-fns';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { Button } from '@/src/components/ui/button';
import { buildStandardInvoicePrintItems } from '@/src/utils/invoicePrintHelper';
import { getSettings } from '@/src/api';
import { Printer, Download, MessageCircle } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

interface DigitalInvoiceModalProps {    
  sale: SaleRecord | null;
  outlets: Outlet[];
  inventory: InventoryItem[];
  isOpen: boolean;
  onClose: () => void;
  exportFormat?: 'png' | 'pdf' | null;
  onExportComplete?: () => void;
  deliveryMen?: DeliveryMan[];
  onDeliveryManChange?: (sale: SaleRecord, name: string) => Promise<void>;
}

const A4_W = 1123; // px at 96dpi (297mm)
const A4_H = 794; // px at 96dpi (210mm)
interface InvoiceTax {
  id: string;
  name: string;
  rate: number;
}

const loadInvoiceTaxes = (): InvoiceTax[] => {
  try {
    const saved = localStorage.getItem('warsa_invoice_taxes_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((tax): tax is InvoiceTax => tax && typeof tax.name === 'string' && Number.isFinite(Number(tax.rate)))
          .map(tax => ({ id: String(tax.id || Date.now()), name: tax.name, rate: Math.max(0, Math.min(100, Number(tax.rate))) }));
      }
    }
  } catch { /* use configured defaults */ }
  try {
    const rate = Number((getSettings() as any).invoiceTaxRate);
    return [
      { id: 'gst', name: 'GST', rate: Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : 0 },
      { id: 'advance-tax', name: 'Advance Tax', rate: 0 }
    ];
  } catch {
    return [{ id: 'gst', name: 'GST', rate: 0 }, { id: 'advance-tax', name: 'Advance Tax', rate: 0 }];
  }
};

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
.dinv-sheet{width:${A4_W}px;min-height:${A4_H}px;height:auto;background:#fff;color:#000;box-sizing:border-box;padding:36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;display:flex;flex-direction:column}
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
.dinv-sign{display:flex;justify-content:space-between;margin-top:24px;padding-top:8px;flex-shrink:0}
.dinv-sign div{width:160px;border-top:1px solid #000;text-align:center;padding-top:4px;font-weight:700}
.dinv-note{margin-top:12px;border:1px solid #000;padding:8px;font-size:11px;white-space:pre-wrap}
.dinv-foot{text-align:center;margin-top:14px;font-size:10px}
.dinv-print-only{position:fixed;left:-99999px;top:0}
@media print{
  @page{size:A4 landscape;margin:0}
  body.dinv-printing > *:not(.dinv-print-only){display:none !important}
  body.dinv-printing .dinv-print-only{position:static !important;left:auto !important;display:block !important}
  .dinv-sheet{width:297mm !important;min-height:210mm !important;height:auto !important;page-break-after:avoid}
}
`;

export function DigitalInvoiceModal({
  sale,
  outlets,
  inventory,
  isOpen,
  onClose,
  exportFormat = null,
  onExportComplete,
  deliveryMen = [],
  onDeliveryManChange
}: DigitalInvoiceModalProps) {
  const exportRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [copy, setCopy] = useState<'ORIGINAL' | 'CUSTOMER'>('ORIGINAL');
  const [scale, setScale] = useState(0.7);
  const [sheetHeight, setSheetHeight] = useState(A4_H);
  const [busy, setBusy] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [showTaxEditor, setShowTaxEditor] = useState(false);
  const [showDeliveryEditor, setShowDeliveryEditor] = useState(false);
  const [deliveryManName, setDeliveryManName] = useState(sale?.DriverName || '');
  const [isSavingDeliveryMan, setIsSavingDeliveryMan] = useState(false);
  const [deliverySaveError, setDeliverySaveError] = useState<string | null>(null);
  const [taxes, setTaxes] = useState<InvoiceTax[]>(loadInvoiceTaxes);
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
  useEffect(() => {
    setDeliveryManName(sale?.DriverName || '');
    setShowDeliveryEditor(false);
  }, [sale?.ID, sale?.DriverName]);

  useEffect(() => {
    try {
      localStorage.setItem('warsa_invoice_taxes_v1', JSON.stringify(taxes));
    } catch (error) {
      console.error('Could not save invoice tax settings:', error);
    }
  }, [taxes]);

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
    const preview = previewRef.current;
    if (!preview) return;
    const updateHeight = () => {
      const sheet = preview.querySelector('.dinv-sheet');
      if (sheet) setSheetHeight(Math.max(A4_H, sheet.scrollHeight));
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(preview);
    return () => observer.disconnect();
  }, [sale, taxes, customText, customLabel, deliveryManName]);

  const renderInvoiceCanvas = async (element: HTMLElement) => html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    width: element.scrollWidth,
    height: Math.max(element.scrollHeight, element.offsetHeight),
    windowWidth: A4_W,
    windowHeight: Math.max(A4_H, element.scrollHeight)
  });

  const createInvoicePdf = (canvas: HTMLCanvasElement) => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const margin = 4;
    const maxWidth = 297 - margin * 2;
    const maxHeight = 210 - margin * 2;
    const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (297 - width) / 2, (210 - height) / 2, width, height);
    return pdf;
  };

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
        const canvas = await renderInvoiceCanvas(el);
        if (exportFormat === 'png') {
          const anchor = document.createElement('a');
          anchor.href = canvas.toDataURL('image/png');
          anchor.download = `Invoice_${sale.ID}_Digital.png`;
          anchor.click();
        } else {
          createInvoicePdf(canvas).save(`Invoice_${sale.ID}_Digital.pdf`);
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
  const companyAddress = settings.companyAddress || '40-1 Dhaka Road, Saddar Bazar, Lahore Cantt';
  const companyPhone = '03141421965';
  const companyNTN = settings.companyNTN || 'H039315';

  const outlet = outlets.find(o =>
    o.Name === sale.OutletName || (sale.OutletCode && o.Code === sale.OutletCode) || o.Address === sale.Address
  );
  const outletCode = outlet?.Code || sale.OutletCode || '-';
  const balance = outlet?.OpeningBalance !== undefined ? outlet.OpeningBalance : sale.GrandTotal;
  const items = buildStandardInvoicePrintItems(sale, inventory, outlet);

  let dateText = sale.Date || '';
  try { if (sale.Date) dateText = format(new Date(sale.Date), 'dd-MMM-yyyy'); } catch { /* keep raw */ }

  const discount = Number(sale.Discount) || 0;
  const base = items;
  const grossOf = (it: any) => (typeof it.price === 'number' ? Number(it.qty) * it.price : 0);
  const totalGross = base.reduce((n, it) => n + grossOf(it), 0);
  const rows = base.map(it => {
    const gross = grossOf(it);
    const offer = 0;
    return { it, gross, offer, net: gross - offer };
  });
  const totalQty = rows.reduce((n, r) => n + Number(r.it.qty || 0), 0);
  const totalTradeOffer = rows.reduce((n, r) => n + r.offer, 0);
  const subtotalNet = totalGross - totalTradeOffer;
  const additionalDiscount = Math.max(0, discount);
  const totalOffer = totalTradeOffer;
  const net = Math.max(0, subtotalNet - additionalDiscount);
  const taxAmounts = taxes.map(tax => ({
    ...tax,
    amount: Math.round(net * tax.rate) / 100
  }));
  const taxAmount = taxAmounts.reduce((sum, tax) => sum + tax.amount, 0);
  const totalTaxRate = taxes.reduce((sum, tax) => sum + tax.rate, 0);
  const grand = net + taxAmount;
  const opening = Number(outlet?.OpeningBalance) || 0;
  const closing = opening + grand;
  const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const skuFor = (d: string) => (
    d.includes('1500') ? 'WAR-1.5L' :
    d.includes('19') ? 'WAR-19L' :
    /\b5\s*L\b|\b5000\s*ML\b/i.test(d) ? 'WAR-5L' :
    d.includes('PROMO') ? 'PROMO-500ML' : 'WAR-500ML'
  );
  const full = (d: string) => (d.startsWith('PROMO') ? 'Promo 500ml (Free)' : 'Warsa Bottled Water ' + d.replace('ML', 'ml'));
  const customerNTN = (outlet as any)?.NTN || (outlet as any)?.CustomerNTN || '';

  const Sheet = () => (
    <div className="dinv-sheet">
      <div className="dinv-hd">
        <div>
          <div className="dinv-co">{companyName.toUpperCase()}</div>
          <p>{companyAddress} &bull; Tel: {companyPhone} &bull; NTN: {companyNTN}</p>
        </div>
        <div className="dinv-rt">
          <b>{totalTaxRate > 0 ? 'TAX INVOICE' : 'INVOICE'}</b><br />
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
          <div><b>Order Booker:</b> {outlet?.OB || sale.OrderBooker || sale.BookedBy || '-'}</div>
          <div><b>Delivery Man:</b> {deliveryManName || '-'}</div>
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
            <th>Description</th>
            <th className="c" style={{ width: 48 }}>Qty</th>
            <th className="r" style={{ width: 70 }}>Trade Price</th>
            <th className="r" style={{ width: 82 }}>Gross Value</th>
            <th className="r" style={{ width: 82 }}>Trade Offer</th>
            <th className="r" style={{ width: 92 }}>Net Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="ex"><td colSpan={6}>{totalTaxRate > 0 ? `Taxable @ ${totalTaxRate}%` : 'Exempted'}</td></tr>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{skuFor(String(r.it.desc))} - {full(String(r.it.desc))}</td>
              <td className="c">{money(r.it.qty)}</td>
              <td className="r">{typeof r.it.price === 'number' ? money(r.it.price) : r.it.price}</td>
              <td className="r">{money(r.gross)}</td>
              <td className="r">{fmt(r.offer)}</td>
              <td className="r">{fmt(r.net)}</td>
            </tr>
          ))}
          {['Sub Total:', 'Grand Total:'].map(label => {
            const isGrandTotal = label === 'Grand Total:';
            return (
            <tr key={label} className="t">
              <td className="tl">{label}</td>
              <td className="c">{money(totalQty)}</td><td></td>
              <td className="r">{money(totalGross)}</td>
              <td className="r">{fmt(isGrandTotal ? totalOffer : totalTradeOffer)}</td>
              <td className="r">{fmt(subtotalNet)}</td>
            </tr>
          );})}
        </tbody>
      </table>

      <table className="dinv-sum">
        <tbody>
          <tr><td>Less Additional Discount</td><td>{fmt(additionalDiscount)}</td></tr>
          {taxAmounts.map(tax => (
            <tr key={tax.id}><td>{tax.name} {tax.rate.toFixed(2)} %</td><td>{fmt(tax.amount)}</td></tr>
          ))}
          <tr className="g"><td>Net Receivable</td><td>{fmt(grand)}</td></tr>
          <tr><td style={{ paddingTop: 14 }}>Opening Balance:</td><td style={{ paddingTop: 14 }}>{fmt(opening)} Rs</td></tr>
          <tr><td>This Invoice Value:</td><td>{fmt(grand)}</td></tr>
          <tr className="g"><td>Closing Balance:</td><td>{fmt(closing)} Rs</td></tr>
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
      const canvas = await renderInvoiceCanvas(el);
      createInvoicePdf(canvas).save(`Invoice_${sale.ID}_${copy === 'CUSTOMER' ? 'Customer' : 'Original'}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Could not download invoice PDF.');
    } finally {
      setBusy(false);
    }
  };

  const handleShareOnWhatsApp = async () => {
    const el = exportRef.current?.querySelector('.dinv-sheet') as HTMLElement | null;
    if (!el) return;
    setBusy(true);
    try {
      const canvas = await renderInvoiceCanvas(el);
      const pdf = createInvoicePdf(canvas);
      const blob = pdf.output('blob');
      const file = new File([blob], `Invoice_${sale.ID}.pdf`, { type: 'application/pdf' });
      const shareData = {
        files: [file],
        title: `Invoice ${sale.ID}`,
        text: `Invoice ${sale.ID} for ${sale.OutletName}`
      };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        pdf.save(`Invoice_${sale.ID}.pdf`);
        const message = `Invoice ${sale.ID} for ${sale.OutletName} is downloaded as a PDF. Please attach it to this WhatsApp message.`;
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('WhatsApp invoice sharing failed:', error);
      alert('Could not share the invoice. Please download the PDF and attach it in WhatsApp.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPng = async () => {
    const el = exportRef.current?.querySelector('.dinv-sheet') as HTMLElement | null;
    if (!el) return;
    setBusy(true);
    try {
      const canvas = await renderInvoiceCanvas(el);
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
              <Button variant="outline" size="sm" onClick={() => setShowDeliveryEditor(v => !v)} className="text-xs font-bold">
                Edit Delivery Man
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTaxEditor(v => !v)} className="text-xs font-bold">
                Configure Taxes
              </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPng} disabled={busy} className="gap-1.5 text-xs font-bold">
                  <Download className="h-3.5 w-3.5" /> Save PNG
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={busy} className="gap-1.5 text-xs font-bold">
                  <Download className="h-3.5 w-3.5" /> {busy ? 'Preparing...' : 'Download PDF'}
              </Button>
                <Button variant="outline" size="sm" onClick={handleShareOnWhatsApp} disabled={busy} className="gap-1.5 text-xs font-bold text-green-700 border-green-300 hover:bg-green-50">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp PDF
                </Button>
              <Button size="sm" onClick={handlePrint} className="gap-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white">
                <Printer className="h-3.5 w-3.5" /> Print A4
              </Button>
            </div>
          </div>

          {showDeliveryEditor && (
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-56 space-y-1">
                <label className="text-[11px] font-bold text-slate-700">Delivery Man Name</label>
                <input
                  list={`invoice-delivery-men-${sale.ID}`}
                  value={deliveryManName}
                  maxLength={100}
                  onChange={e => setDeliveryManName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
                  placeholder="Select or enter a name"
                />
                <datalist id={`invoice-delivery-men-${sale.ID}`}>
                  {deliveryMen.map(person => <option key={person.ID} value={person.Name} />)}
                </datalist>
              </div>
              <Button
                size="sm"
                disabled={!onDeliveryManChange || isSavingDeliveryMan}
                onClick={async () => {
                  if (!onDeliveryManChange) return;
                  setIsSavingDeliveryMan(true);
                  setDeliverySaveError(null);
                  try {
                    await onDeliveryManChange(sale, deliveryManName);
                    setShowDeliveryEditor(false);
                  } catch (error) {
                    setDeliverySaveError(error instanceof Error ? error.message : 'Could not save the delivery man name.');
                  } finally {
                    setIsSavingDeliveryMan(false);
                  }
                }}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
              >
                {isSavingDeliveryMan ? 'Saving...' : 'Save Name'}
              </Button>
              {deliverySaveError && <p className="w-full text-xs text-red-600">{deliverySaveError}</p>}
            </div>
          )}

          {showTaxEditor && (
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-700">Invoice Taxes</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTaxes(previous => [...previous, { id: `${Date.now()}-${Math.random()}`, name: 'New Tax', rate: 0 }])}
                  className="text-xs font-bold"
                >
                  Add Tax
                </Button>
              </div>
              {taxes.map(tax => (
                <div key={tax.id} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2 items-end">
                  <label className="text-[11px] font-bold text-slate-700">
                    Tax Name
                    <input
                      value={tax.name}
                      maxLength={40}
                      onChange={e => setTaxes(previous => previous.map(item => item.id === tax.id ? { ...item, name: e.target.value } : item))}
                      className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-normal"
                    />
                  </label>
                  <label className="text-[11px] font-bold text-slate-700">
                    Rate (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={tax.rate}
                      onChange={e => {
                        const rate = Number(e.target.value);
                        setTaxes(previous => previous.map(item => item.id === tax.id ? { ...item, rate: Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : 0 } : item));
                      }}
                      className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-normal"
                    />
                  </label>
                  <Button variant="outline" size="sm" onClick={() => setTaxes(previous => previous.filter(item => item.id !== tax.id))} className="text-xs text-red-600">
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

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
            <div style={{ width: A4_W * scale, height: sheetHeight * scale }}>
              <div ref={previewRef} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: A4_W, boxShadow: '0 1px 6px rgba(0,0,0,.25)' }}>
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