import { InventoryItem, SaleRecord } from '@/src/types';

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
 * Ensures all standard items (500ml, 1500ml, 5 L, 19 L, and Promo 500ml)
 * are always present in the printed order invoice.
 * Even if the shopkeeper has not added an item, its quantity will show 0 and amount 0.
 */
export function buildStandardInvoicePrintItems(
  sale: SaleRecord,
  inventory: InventoryItem[] = []
): ProcessedInvoiceItem[] {
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

  // 3. Match 5 L item (5L / 5000ml non-promo)
  const item5L = rawItems.find(i => {
    const isPromo = Boolean(i.IsPromo || (i.Price === 0 && getItemText(i).includes('promo')));
    if (isPromo) return false;
    const txt = getItemText(i);
    return /\b5\s*l\b|\b5000\s*ml\b/.test(txt) || i.ProductID === '3';
  });

  // 4. Match 19 L item (19L / 19 Liter non-promo)
  const item19L = rawItems.find(i => {
    const isPromo = Boolean(i.IsPromo || (i.Price === 0 && getItemText(i).includes('promo')));
    if (isPromo) return false;
    const txt = getItemText(i);
    return txt.includes('19') || i.ProductID === '4';
  });

  // 5. Match Promo 500ml item
  const promoItems = rawItems.filter(i => {
    return Boolean(i.IsPromo || (i.Price === 0 && getItemText(i).includes('promo')));
  });

  const inventoryFor = (saleItem: typeof item500, size: '500' | '1500' | '5l' | '19') => {
    if (saleItem?.ProductID) {
      const byId = inventory.find(product => product.ID === saleItem.ProductID);
      if (byId) return byId;
    }

    const textOf = (product: InventoryItem) =>
      `${product.Name} ${product.Size || ''} ${product.SKU}`.toLowerCase();
    const matchesSize = (product: InventoryItem) => {
      const text = textOf(product);
      if (size === '500') return text.includes('500') && !text.includes('promo');
      if (size === '1500') return text.includes('1500') || text.includes('1.5');
      if (size === '5l') return /\b5\s*l\b|\b5000\s*ml\b/.test(text) || product.ID === '3';
      return text.includes('19') || product.ID === '4';
    };

    return inventory.find(matchesSize);
  };
  const productPrice = (saleItem: typeof item500, size: '500' | '1500' | '5l' | '19') => {
    const soldPrice = Number(saleItem?.Price);
    if (Number.isFinite(soldPrice) && soldPrice > 0) return soldPrice;
    const stockPrice = Number(inventoryFor(saleItem, size)?.Price);
    return Number.isFinite(stockPrice) && stockPrice > 0 ? stockPrice : 0;
  };

  const price500 = productPrice(item500, '500');
  const price1500 = productPrice(item1500, '1500');
  const price5L = productPrice(item5L, '5l');
  const price19L = productPrice(item19L, '19');

  // Quantities: if not added by shopkeeper, show 0
  const qty500 = item500 ? (item500.Quantity ?? item500.BookedQty ?? (item500 as any).Qty ?? 0) : 0;
  const qty1500 = item1500 ? (item1500.Quantity ?? item1500.BookedQty ?? (item1500 as any).Qty ?? 0) : 0;
  const qty5L = item5L ? (item5L.Quantity ?? item5L.BookedQty ?? (item5L as any).Qty ?? 0) : 0;
  const qty19L = item19L ? (item19L.Quantity ?? item19L.BookedQty ?? (item19L as any).Qty ?? 0) : 0;

  const itemPromoQty = promoItems.reduce((total, item) =>
    total + Number(item.Quantity ?? item.BookedQty ?? (item as any).Qty ?? 0), 0);
  const promoQty = itemPromoQty > 0
    ? itemPromoQty
    : Number(sale.PromoFreeCases) > 0
      ? Number(sale.PromoFreeCases)
      : sale.HasPromo ? 1 : 0;

  // Amounts
  const amount500 = qty500 > 0 ? (item500?.Amount ?? (Number(qty500) * Number(price500))) : 0;
  const amount1500 = qty1500 > 0 ? (item1500?.Amount ?? (Number(qty1500) * Number(price1500))) : 0;
  const amount5L = qty5L > 0 ? (item5L?.Amount ?? (Number(qty5L) * Number(price5L))) : 0;
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
      desc: '5L',
      qty: qty5L,
      price: price5L,
      amount: amount5L,
      isPromo: false,
      isAlt: false
    },
    {
      num: 4,
      desc: '19 L',
      qty: qty19L,
      price: price19L,
      amount: amount19L,
      isPromo: false,
      isAlt: false
    },
    {
      num: 5,
      desc: 'PROMO 500ML',
      qty: promoQty,
      price: promoQty > 0 ? 'FREE' : 0,
      amount: promoQty > 0 ? 'FREE' : 0,
      isPromo: true,
      isAlt: true
    }
  ];
}
