import { InventoryItem, Outlet, SaleRecord } from '@/src/types';

export interface ProcessedInvoiceItem {
  num: number;
  desc: string;
  sku?: string;
  qty: number | string;
  price: number | string;
  tradeOffer: number;
  amount: number | string;
  isPromo: boolean;
  isAlt: boolean;
}

export type InvoiceProductSize = '500ml' | '1500ml' | '5l' | '19l';

export interface InvoicePromoProductOption {
  size: InvoiceProductSize;
  label: string;
  product: InventoryItem;
}

const PRODUCT_SIZES: Array<{ size: InvoiceProductSize; label: string; matches: RegExp }> = [
  { size: '500ml', label: '500 ml', matches: /\b500\s*ml\b|\b0\.5\s*l\b/i },
  { size: '1500ml', label: '1.5 L', matches: /\b1500\s*ml\b|\b1[.,]5\s*l\b/i },
  { size: '5l', label: '5 L', matches: /\b5000\s*ml\b|\b5\s*l\b/i },
  { size: '19l', label: '19 L', matches: /\b19\s*(?:l|liter|litre)s?\b/i }
];

const getProductText = (product: InventoryItem) =>
  `${product.Name || ''} ${product.Size || ''} ${product.SKU || ''}`;

const getProductSize = (text: string): InvoiceProductSize | undefined =>
  PRODUCT_SIZES.find(option => option.matches.test(text))?.size;

export function getInvoicePromoProductOptions(inventory: InventoryItem[]): InvoicePromoProductOption[] {
  return PRODUCT_SIZES.flatMap(option => {
    const product = inventory.find(item => getProductSize(getProductText(item)) === option.size);
    return product ? [{ size: option.size, label: option.label, product }] : [];
  });
}

export function buildStandardInvoicePrintItems(
  sale: SaleRecord,
  inventory: InventoryItem[] = [],
  outlet?: Outlet
): ProcessedInvoiceItem[] {
  const rawItems = sale.Items || [];
  const isPromoItem = (item: (typeof rawItems)[number]) =>
    Boolean(item.IsPromo || (Number(item.Price) === 0 && /promo/i.test(`${item.ProductName || ''} ${item.PromoScheme || ''}`)));
  const quantityOf = (item: (typeof rawItems)[number]) =>
    Number(item.BookedQty ?? item.Quantity ?? (item as any).Qty ?? 0);

  const regularItems: ProcessedInvoiceItem[] = rawItems.flatMap(item => {
    if (isPromoItem(item)) return [];
    const qty = quantityOf(item);
    if (!Number.isFinite(qty) || qty <= 0) return [];

    const product = inventory.find(candidate => String(candidate.ID) === String(item.ProductID));
    const customRates = outlet?.CustomRates || {};
    const customRate = product ? customRates[product.ID] ?? customRates[product.SKU] : undefined;
    const parsedCustomRate = Number(customRate);
    const soldPrice = Number(item.Price);
    const price = customRate !== undefined && Number.isFinite(parsedCustomRate)
      ? parsedCustomRate
      : Number.isFinite(soldPrice) ? soldPrice : 0;
    const desc = (product?.Name || item.ProductName || 'Product').replace(/\s*\[PROMO FREE\]\s*/i, '').trim();

    return [{
      num: 0,
      desc,
      sku: product?.SKU,
      qty,
      price,
      tradeOffer: 0,
      amount: qty * price,
      isPromo: false,
      isAlt: false
    }];
  });

  const promoItems = rawItems.filter(isPromoItem);
  const promoRows: ProcessedInvoiceItem[] = promoItems.flatMap(item => {
    const qty = quantityOf(item);
    if (!Number.isFinite(qty) || qty <= 0) return [];

    const product = inventory.find(candidate => String(candidate.ID) === String(item.ProductID || sale.PromoProductID));
    const desc = (product?.Name || item.ProductName || sale.PromoProductName || 'Promotional Product')
      .replace(/\s*\[PROMO FREE\]\s*/i, '')
      .trim();

    return [{
      num: 0,
      desc,
      sku: 'PROMO',
      qty,
      price: 'FREE',
      tradeOffer: 0,
      amount: 'FREE',
      isPromo: true,
      isAlt: true
    }];
  });

  if (promoItems.length === 0 && (sale.HasPromo || Number(sale.PromoFreeCases) > 0)) {
    const qty = Number(sale.PromoFreeCases) || 1;
    const product = inventory.find(candidate => String(candidate.ID) === String(sale.PromoProductID));
    promoRows.push({
      num: 0,
      desc: (product?.Name || sale.PromoProductName || '500 ml').replace(/\s*\[PROMO FREE\]\s*/i, '').trim(),
      sku: 'PROMO',
      qty,
      price: 'FREE',
      tradeOffer: 0,
      amount: 'FREE',
      isPromo: true,
      isAlt: true
    });
  }

  return [...regularItems, ...promoRows].map((item, index) => ({ ...item, num: index + 1 }));
}
