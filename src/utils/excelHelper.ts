import * as XLSX from 'xlsx';

export interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
}

/**
 * Exports JSON data array to an Excel (.xlsx) file
 */
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  options: ExcelExportOptions
): void {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, options.sheetName || 'Data');
  
  const filename = options.filename.endsWith('.xlsx') 
    ? options.filename 
    : `${options.filename}.xlsx`;
    
  XLSX.writeFile(wb, filename);
}

/**
 * Exports JSON data array to a CSV file
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string
): void {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB limit
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain',
  '' // Some browsers leave MIME empty for CSV
];

/**
 * Sanitizes parsed object to prevent prototype pollution and formula injection
 */
function sanitizeParsedRecord(record: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    // Prototype pollution defense
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    // Clean key string
    const cleanKey = String(key).replace(/[<>'"]/g, '').trim();
    if (!cleanKey) continue;

    // Formula injection & XSS defense
    if (typeof value === 'string') {
      let cleanVal = value.trim();
      if (/^[=+\-@\t\r]/.test(cleanVal)) {
        cleanVal = `'${cleanVal}`; // Neutralize formula
      }
      safe[cleanKey] = cleanVal;
    } else {
      safe[cleanKey] = value;
    }
  }
  return safe;
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV file with enterprise upload security
 */
export async function parseExcelOrCSVFile(file: File): Promise<any[]> {
  // 1. File Size Validation (DoS / Memory exhaustion protection)
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error(`File upload rejected: Maximum allowed file size is 5MB. Uploaded file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`);
  }

  // 2. Extension & Path Traversal Validation
  const lowerName = file.name.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
  if (!hasValidExt) {
    throw new Error('File upload rejected: Unsupported file format. Only .xlsx, .xls, and .csv files are permitted.');
  }

  // 3. MIME Type Validation
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('File upload rejected: Invalid MIME type detected for uploaded file.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { 
          type: 'array',
          cellDates: true,
          cellNF: false,
          cellText: false
        });
        
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve([]);
          return;
        }
        
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        // 4. Sanitize every row against prototype pollution & formula injection
        const sanitized = rawJson.map(row => sanitizeParsedRecord(row));
        resolve(sanitized);
      } catch (err: any) {
        reject(new Error(`Failed to parse file: ${err?.message || 'File corruption or invalid spreadsheet structure.'}`));
      }
    };

    reader.onerror = () => reject(new Error('An error occurred reading the uploaded file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generates and triggers download of a standardized sample template file
 */
export function downloadTemplate(
  type: 'outlets' | 'inventory' | 'sales',
  format: 'xlsx' | 'csv' = 'xlsx'
): void {
  let sampleData: Record<string, any>[] = [];
  let filename = '';

  if (type === 'outlets') {
    filename = 'Warsa_Outlets_Template';
    sampleData = [
      {
        SrNo: 1,
        Code: '101',
        Name: 'Bismillah General Store',
        Address: 'Main Bazar Saddar Lahore',
        Route: 'Saddar Route',
        ContactNumber: '0300-1234567',
        OwnerName: 'Haji Muhammad Aslam',
        OB: 'Muhammad Rizwan',
        Latitude: 31.5204,
        Longitude: 74.3587,
        Balance: 0
      },
      {
        SrNo: 2,
        Code: '102',
        Name: 'Al-Madina Mart & Bakers',
        Address: 'Shop 4, Market Block, Model Town',
        Route: 'Model Town Route',
        ContactNumber: '0321-9876543',
        OwnerName: 'Sheikh Tariq',
        OB: 'Ali Raza',
        Latitude: 31.4812,
        Longitude: 74.3211,
        Balance: 2500
      },
      {
        SrNo: 3,
        Code: '103',
        Name: 'Rehman Sweets & Water Corner',
        Address: 'Main GT Road, Daroghawala',
        Route: 'GT Road Route',
        ContactNumber: '0333-5554321',
        OwnerName: 'Abdur Rehman',
        OB: 'Zahid Khan',
        Latitude: 31.5799,
        Longitude: 74.3912,
        Balance: 0
      }
    ];
  } else if (type === 'inventory') {
    filename = 'Warsa_Inventory_Template';
    sampleData = [
      {
        Name: '1.5 Liter (12 Bottles)',
        Category: 'Bottled Water',
        Cases: 150,
        Rate: 750,
        BottlesPerCase: 12
      },
      {
        Name: '500 ml (24 Bottles)',
        Category: 'Bottled Water',
        Cases: 220,
        Rate: 950,
        BottlesPerCase: 24
      },
      {
        Name: '19 Liter Gallon',
        Category: 'Bulk Gallon',
        Cases: 80,
        Rate: 220,
        BottlesPerCase: 1
      },
      {
        Name: '300 ml (24 Bottles)',
        Category: 'Bottled Water',
        Cases: 100,
        Rate: 850,
        BottlesPerCase: 24
      }
    ];
  } else if (type === 'sales') {
    filename = 'Warsa_Sales_Order_Template';
    sampleData = [
      {
        Date: new Date().toISOString().split('T')[0],
        OutletName: 'Bismillah General Store',
        OutletCode: '101',
        Route: 'Saddar Route',
        BookedBy: 'Muhammad Rizwan',
        ItemsSummary: '1.5 Liter (12 Bottles): 5 cases, 500 ml (24 Bottles): 3 cases',
        TotalCases: 8,
        GrandTotal: 6600,
        Status: 'Delivered',
        PaymentMode: 'Cash'
      }
    ];
  }

  if (format === 'xlsx') {
    exportToExcel(sampleData, { filename, sheetName: `${type.toUpperCase()} Template` });
  } else {
    exportToCSV(sampleData, filename);
  }
}
