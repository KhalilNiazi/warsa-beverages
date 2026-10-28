import { SaleRecord, Outlet } from '@/src/types';

export interface ProcessedInvoiceItem {
  num: number;
  desc: string;
  qty: number | string;
  price: number | string;
  amount: number | string;
  isPromo: boolean;
  isAlt: boolean;
}

/**
 * Ensures all 4 standard items (500ml, 1500ml, 19 L, and Promo 500ml)
 * are always present in the printed order invoice.
 * Even if the shopkeeper has not added an item, its quantity will show 0 and amount 0.
 */
export function buildStandardInvoicePrintItems(sale: SaleRecord, outlet?: Outlet): ProcessedInvoiceItem[] {
  const rawItems = sale.Items || [];

  const getItemText = (i: any) => 
    ((i.ProductName || i.Product || '') + ' ' + (i.Size || '') + ' ' + (i.SKU || '') + ' ' + (i.PromoScheme || '')).toLowerCase();

  // 1. Match 500ml item (non-promo)
  const item500 = rawItems.find(i => {
    const isPromo = Boolean(i.IsPromo || (i.Price === 0 && getItemText(i).includes('promo')));
    if (isPromo) return false;
    const txt = getItemText(i);
    return txt.includes('500') || i.ProductID === '1';
  });

  // 2. Match 1500ml item (1.5L / 1500ml non-promo)
  const item1500 = rawItems.find(i => {
    const isPromo = Boolean(i.IsPromo || (i.Price === 0 && getItemText(i).includes('promo')));
    if (isPromo) return false;
    const txt = getItemText(i);
    return txt.includes('1500') || txt.includes('1.5') || txt.includes('1,5') || i.ProductID === '2';
  });

  // 3. Match 19 L item (19L / 19 Liter non-promo)
  const item19L = rawItems.find(i => {
    const isPromo = Boolean(i.IsPromo || (i.Price === 0 && getItemText(i).includes('promo')));
    if (isPromo) return false;
    const txt = getItemText(i);
    return txt.includes('19') || i.ProductID === '4';
  });

  // 4. Match Promo 500ml item
  const itemPromo = rawItems.find(i => {
    return Boolean(i.IsPromo || (i.Price === 0 && getItemText(i).includes('promo')));
  });

  // Standard or custom prices
  const price500 = item500?.Price !== undefined && item500.Price > 0
    ? item500.Price
    : (outlet?.CustomRates?.['1'] ?? outlet?.CustomRates?.['WAR-500ML'] ?? 370);

  const price1500 = item1500?.Price !== undefined && item1500.Price > 0
    ? item1500.Price
    : (outlet?.CustomRates?.['2'] ?? outlet?.CustomRates?.['WAR-1.5L'] ?? 370);

  const price19L = item19L?.Price !== undefined && item19L.Price > 0
    ? item19L.Price
    : (outlet?.CustomRates?.['4'] ?? outlet?.CustomRates?.['WAR-19L'] ?? 180);

  // Quantities: if not added by shopkeeper, show 0
  const qty500 = item500 ? (item500.Quantity ?? item500.BookedQty ?? (item500 as any).Qty ?? 0) : 0;
  const qty1500 = item1500 ? (item1500.Quantity ?? item1500.BookedQty ?? (item1500 as any).Qty ?? 0) : 0;
  const qty19L = item19L ? (item19L.Quantity ?? item19L.BookedQty ?? (item19L as any).Qty ?? 0) : 0;

  let promoQty = 0;
  if (itemPromo) {
    promoQty = itemPromo.Quantity ?? itemPromo.BookedQty ?? (itemPromo as any).Qty ?? 1;
  } else if (sale.HasPromo || (sale.PromoFreeCases && sale.PromoFreeCases > 0)) {
    promoQty = sale.PromoFreeCases || 1;
  }

  // Amounts
  const amount500 = qty500 > 0 ? (item500?.Amount ?? (Number(qty500) * Number(price500))) : 0;
  const amount1500 = qty1500 > 0 ? (item1500?.Amount ?? (Number(qty1500) * Number(price1500))) : 0;
  const amount19L = qty19L > 0 ? (item19L?.Amount ?? (Number(qty19L) * Number(price19L))) : 0;

  return [
    {
      num: 1,
      desc: '500ML',
      qty: qty500,
      price: price500,
      amount: amount500,
      isPromo: false,
      isAlt: false
    },
    {
      num: 2,
      desc: '1500ML',
      qty: qty1500,
      price: price1500,
      amount: amount1500,
      isPromo: false,
      isAlt: true
    },
    {
      num: 3,
      desc: '19 L',
      qty: qty19L,
      price: price19L,
      amount: amount19L,
      isPromo: false,
      isAlt: false
    },
    {
      num: 4,
      desc: 'PROMO 500ML',
      qty: promoQty,
      price: promoQty > 0 ? 'FREE' : 0,
      amount: promoQty > 0 ? 'FREE' : 0,
      isPromo: true,
      isAlt: true
    }
  ];
}
