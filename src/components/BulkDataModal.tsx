import React, { useState, useRef } from 'react';
import { ResponsiveDialog } from '@/src/components/ui/responsive-dialog';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { 
  FileSpreadsheet, 
  Download, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Store, 
  Package, 
  ShoppingCart,
  Database,
  ArrowRight
} from 'lucide-react';
import { 
  exportToExcel, 
  exportToCSV, 
  downloadTemplate, 
  parseExcelOrCSVFile 
} from '@/src/utils/excelHelper';
import { 
  fetchOutlets, 
  saveOutlet, 
  fetchInventory, 
  addStockInward, 
  fetchSales,
  canModifyData,
  getCurrentUser
} from '@/src/api';
import { Outlet, InventoryItem, SaleRecord } from '@/src/types';

interface BulkDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'outlets' | 'inventory' | 'sales';
  onSuccess?: () => void;
}

export function BulkDataModal({ 
  isOpen, 
  onClose, 
  defaultTab = 'outlets',
  onSuccess 
}: BulkDataModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'outlets' | 'inventory' | 'sales'>(defaultTab);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const canEdit = canModifyData();

  const handleDownloadSample = (format: 'xlsx' | 'csv') => {
    downloadTemplate(activeTab, format);
  };

  const handleExportCurrent = async (format: 'xlsx' | 'csv') => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      if (activeTab === 'outlets') {
        const outlets = await fetchOutlets();
        const exportData = outlets.map(o => ({
          'SrNo': o.SrNo || '',
          'Code': o.Code || '',
          'Name': o.Name,
          'Address': o.Address || '',
          'Route': o.Route || '',
          'ContactNumber': o.ContactNumber || '',
          'OwnerName': o.OwnerName || '',
          'OrderBooker': o.OB || '',
          'OpeningBalance': o.OpeningBalance || 0
        }));
        if (format === 'xlsx') {
          exportToExcel(exportData, { filename: 'Warsa_Outlets_Master', sheetName: 'Outlets' });
        } else {
          exportToCSV(exportData, 'Warsa_Outlets_Master');
        }
      } else if (activeTab === 'inventory') {
        const inventory = await fetchInventory();
        const exportData = inventory.map(i => ({
          'SKU': i.SKU,
          'Product Name': i.Name,
          'Available Cases': i.Quantity,
          'Unit Rate (PKR)': i.Price,
          'Bottles Per Case': i.BottlesPerCase || 12
        }));
        if (format === 'xlsx') {
          exportToExcel(exportData, { filename: 'Warsa_Inventory_Master', sheetName: 'Inventory' });
        } else {
          exportToCSV(exportData, 'Warsa_Inventory_Master');
        }
      } else if (activeTab === 'sales') {
        const sales = await fetchSales();
        const exportData = sales.map(s => ({
          'Invoice ID': s.ID,
          'Date': s.Date,
          'Outlet Code': s.OutletCode || '',
          'Outlet Name': s.OutletName,
          'Route': s.Route || '',
          'Booked By': s.BookedBy || s.OrderBooker || '',
          'Total Cases': s.TotalCases,
          'Grand Total (PKR)': s.GrandTotal,
          'Status': s.DeliveryStatus || 'Booked',
          'Items Breakdown': s.Items?.map(i => `${i.ProductName || (i as any).Product}: ${i.Quantity || (i as any).Qty}cs`).join('; ') || ''
        }));
        if (format === 'xlsx') {
          exportToExcel(exportData, { filename: 'Warsa_Sales_Orders', sheetName: 'Sales Orders' });
        } else {
          exportToCSV(exportData, 'Warsa_Sales_Orders');
        }
      }
      setStatusMessage({ type: 'success', text: `Successfully exported ${activeTab} data in .${format.toUpperCase()}!` });
    } catch (err: any) {
      console.error('Export error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Export failed.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const rows = await parseExcelOrCSVFile(file);
      if (!rows || rows.length === 0) {
        setStatusMessage({ type: 'error', text: 'The uploaded file is empty or could not be parsed.' });
        setParsedRows([]);
      } else {
        setParsedRows(rows);
        setStatusMessage({ 
          type: 'info', 
          text: `Found ${rows.length} rows in ${file.name}. Review preview below and click "Import Records" to commit.` 
        });
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setStatusMessage({ type: 'error', text: `Failed to read file: ${err.message}` });
      setParsedRows([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitImport = async () => {
    if (!parsedRows.length) return;
    setIsProcessing(true);
    setStatusMessage(null);

    try {
      let importedCount = 0;

      if (activeTab === 'outlets') {
        const existingOutlets = await fetchOutlets();

        for (const row of parsedRows) {
          const name = row['Name'] || row['Outlet Name'] || row['name'] || row['outlet_name'];
          if (!name) continue;

          const code = String(row['Code'] || row['Outlet Code'] || row['code'] || '');
          const address = String(row['Address'] || row['address'] || '');
          const route = String(row['Route'] || row['route'] || '');
          const contact = String(row['ContactNumber'] || row['Contact'] || row['Phone'] || row['contact_number'] || '');
          const owner = String(row['OwnerName'] || row['Owner'] || row['owner_name'] || '');
          const ob = String(row['OB'] || row['OrderBooker'] || row['Order Booker'] || '');
          const balance = Number(row['Balance'] || row['balance'] || 0);

          // Find if exists
          const existing = existingOutlets.find(o => 
            (code && o.Code === code) || 
            (name && o.Name.toLowerCase() === name.toLowerCase())
          );

          const outletObj: Outlet = {
            ID: existing?.ID || `OUT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            SrNo: existing?.SrNo || existingOutlets.length + importedCount + 1,
            Code: code || existing?.Code || String(100 + existingOutlets.length + importedCount + 1),
            Name: name,
            Address: address || existing?.Address || '',
            Route: route || existing?.Route || 'General Route',
            ContactNumber: contact || existing?.ContactNumber || '',
            OwnerName: owner || existing?.OwnerName || '',
            OB: ob || existing?.OB || '',
            Status: 'Active',
            CustomRates: existing?.CustomRates || {},
            OpeningBalance: balance
          };

          await saveOutlet(outletObj);
          importedCount++;
        }
      } else if (activeTab === 'inventory') {
        const inv = await fetchInventory();
        for (const row of parsedRows) {
          const name = row['Product Name'] || row['Name'] || row['product'];
          const cases = Number(row['Cases'] || row['Available Cases'] || row['cases'] || 0);
          if (!name || cases <= 0) continue;

          const matched = inv.find(p => p.Name.toLowerCase() === name.toLowerCase());
          if (matched) {
            await addStockInward({
              Date: new Date().toISOString().split('T')[0],
              SupplierSource: `Bulk Import: ${fileName || 'Excel/CSV'}`,
              ProductID: matched.ID,
              ProductName: matched.Name,
              Quantity: cases,
              Unit: 'Cases',
              ReceivedBy: 'System Bulk Import'
            });
            importedCount++;
          }
        }
      }

      setStatusMessage({ 
        type: 'success', 
        text: `Successfully imported ${importedCount} ${activeTab} records into the system!` 
      });
      setParsedRows([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Import commit error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Error during import process.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Data Management (CSV & Excel)"
      subtitle="Download templates, export existing data, and bulk import records"
      className="max-w-4xl"
    >
      <div className="space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setActiveTab('outlets'); setParsedRows([]); setStatusMessage(null); }}
            className={`flex items-center gap-2 py-3 px-5 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'outlets' 
                ? 'border-red-600 text-red-600 bg-red-50/50' 
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Store className="h-4 w-4" /> Customers / Outlets
          </button>
          <button
            onClick={() => { setActiveTab('inventory'); setParsedRows([]); setStatusMessage(null); }}
            className={`flex items-center gap-2 py-3 px-5 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'inventory' 
                ? 'border-red-600 text-red-600 bg-red-50/50' 
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Package className="h-4 w-4" /> Warehouse Inventory
          </button>
          <button
            onClick={() => { setActiveTab('sales'); setParsedRows([]); setStatusMessage(null); }}
            className={`flex items-center gap-2 py-3 px-5 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'sales' 
                ? 'border-red-600 text-red-600 bg-red-50/50' 
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <ShoppingCart className="h-4 w-4" /> Sales Orders
          </button>
        </div>

        {/* Status Message Notification */}
        {statusMessage && (
          <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' 
              : statusMessage.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-900'
              : 'bg-blue-50 border border-blue-200 text-blue-900'
          }`}>
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
              <span>{statusMessage.text}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setStatusMessage(null)} className="h-6 text-[11px]">
              Dismiss
            </Button>
          </div>
        )}

        {/* Step 1 & 2 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Card 1: Sample Template & Export */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                1. Sample Templates & Export
              </h4>
              <Badge variant="outline" className="bg-white text-[10px] uppercase font-bold text-gray-600">
                {activeTab}
              </Badge>
            </div>
            <p className="text-xs text-gray-600">
              Download clean spreadsheet templates with pre-configured headers to fill your data offline, or export live records.
            </p>

            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-bold text-gray-700">Download Blank Template:</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadSample('xlsx')}
                  className="flex-1 bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300 font-bold text-xs h-8"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600 mr-1.5" /> Excel (.xlsx)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadSample('csv')}
                  className="flex-1 bg-white hover:bg-slate-100 text-gray-800 border-slate-300 font-bold text-xs h-8"
                >
                  <Download className="h-3.5 w-3.5 text-gray-600 mr-1.5" /> CSV Format
                </Button>
              </div>

              <div className="text-[11px] font-bold text-gray-700 pt-2">Export Live System Data:</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => handleExportCurrent('xlsx')}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs h-8 shadow-sm"
                >
                  Export All (.xlsx)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isProcessing}
                  onClick={() => handleExportCurrent('csv')}
                  className="flex-1 bg-white border-slate-300 text-gray-800 font-bold text-xs h-8"
                >
                  Export All (.csv)
                </Button>
              </div>
            </div>
          </div>

          {/* Card 2: Upload & Import */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                <Upload className="h-4 w-4 text-blue-600" />
                2. Upload & Bulk Import
              </h4>
              <Badge variant="outline" className="bg-white text-[10px] uppercase font-bold text-blue-700 border-blue-200">
                Bulk Ingest
              </Badge>
            </div>
            <p className="text-xs text-gray-600">
              Upload your completed Excel or CSV file to import multiple records in a single click.
            </p>

            <div className="pt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
                id="bulk-file-upload-input"
              />
              <label
                htmlFor="bulk-file-upload-input"
                className="border-2 border-dashed border-slate-300 hover:border-red-500 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-white transition-all text-center"
              >
                <Upload className="h-6 w-6 text-slate-400" />
                <span className="text-xs font-bold text-gray-700">
                  {fileName ? fileName : 'Click to select Excel (.xlsx) or CSV file'}
                </span>
                <span className="text-[10px] text-gray-400">Supported: .xlsx, .xls, .csv</span>
              </label>
            </div>
          </div>

        </div>

        {/* Preview of Parsed Rows */}
        {parsedRows.length > 0 && (
          <div className="border border-gray-300 rounded-xl bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-gray-900">
                  Data Preview ({parsedRows.length} Rows Ready for Import)
                </h4>
                <p className="text-[11px] text-gray-500">
                  Review the first few records before committing to the database.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setParsedRows([])}
                  className="h-8 text-xs text-gray-600"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  disabled={isProcessing || !canEdit}
                  onClick={handleCommitImport}
                  className="h-8 bg-red-600 hover:bg-red-700 text-white font-bold text-xs gap-1.5 shadow-sm"
                >
                  <ArrowRight className="h-4 w-4" /> Import {parsedRows.length} Records Now
                </Button>
              </div>
            </div>

            {/* Table Preview */}
            <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-100 font-bold sticky top-0">
                  <tr>
                    {Object.keys(parsedRows[0] || {}).slice(0, 7).map(key => (
                      <th key={key} className="p-2 border-b border-gray-300 text-gray-700">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 6).map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {Object.keys(parsedRows[0] || {}).slice(0, 7).map(key => (
                        <td key={key} className="p-2 border-b border-gray-200 text-gray-900 truncate max-w-[150px]">
                          {String(row[key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedRows.length > 6 && (
              <div className="text-[11px] text-gray-400 text-center italic">
                Showing first 6 of {parsedRows.length} rows.
              </div>
            )}
          </div>
        )}

      </div>
    </ResponsiveDialog>
  );
}
