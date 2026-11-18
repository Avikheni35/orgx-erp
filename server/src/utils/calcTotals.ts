export interface LineItemInput {
  quantity:       number;
  unitPriceCents: number;
  vatRate:        number;
  description?:   string;
  unit?:          string;
  itemName?:      string;
  serviceItemId?: string;
  productId?:     string;
  variantId?:     string;
  [key: string]:  unknown;
}

export interface LineItemOutput extends LineItemInput {
  totalNetCents:   number;
  totalVatCents:   number;
  totalGrossCents: number;
}

export interface TotalsResult {
  lineItems:       LineItemOutput[];
  totalNetCents:   number;
  totalVatCents:   number;
  totalGrossCents: number;
}

/**
 * Compute per-line and invoice totals.
 * @param priceIsGross  true = POS mode (unitPriceCents is VAT-inclusive)
 *                      false = B2B mode (unitPriceCents is net, VAT added on top)
 */
export function calcTotals(items: LineItemInput[], priceIsGross = false): TotalsResult {
  let totalNetCents = 0;
  let totalVatCents = 0;

  const lineItems = items.map(item => {
    let lineNetCents: number, lineVatCents: number, lineGrossCents: number;

    if (priceIsGross) {
      lineGrossCents = Math.round(item.quantity * item.unitPriceCents);
      lineNetCents   = Math.round(lineGrossCents / (1 + item.vatRate / 100));
      lineVatCents   = lineGrossCents - lineNetCents;
    } else {
      lineNetCents   = Math.round(item.quantity * item.unitPriceCents);
      lineVatCents   = Math.round(lineNetCents * item.vatRate / 100);
      lineGrossCents = lineNetCents + lineVatCents;
    }

    totalNetCents += lineNetCents;
    totalVatCents += lineVatCents;

    return { ...item, totalNetCents: lineNetCents, totalVatCents: lineVatCents, totalGrossCents: lineGrossCents } as LineItemOutput;
  });

  return { lineItems, totalNetCents, totalVatCents, totalGrossCents: totalNetCents + totalVatCents };
}
