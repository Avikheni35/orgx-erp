import { describe, it, expect } from 'vitest';
import { calcTotals } from '../utils/calcTotals';

describe('calcTotals — B2B mode (priceIsGross=false)', () => {
  it('computes net, VAT, and gross for a single line at 19%', () => {
    const result = calcTotals([{ quantity: 2, unitPriceCents: 10000, vatRate: 19 }]);
    expect(result.lineItems[0].totalNetCents).toBe(20000);
    expect(result.lineItems[0].totalVatCents).toBe(3800);
    expect(result.lineItems[0].totalGrossCents).toBe(23800);
    expect(result.totalNetCents).toBe(20000);
    expect(result.totalVatCents).toBe(3800);
    expect(result.totalGrossCents).toBe(23800);
  });

  it('computes net, VAT, and gross for a single line at 7%', () => {
    const result = calcTotals([{ quantity: 3, unitPriceCents: 5000, vatRate: 7 }]);
    expect(result.lineItems[0].totalNetCents).toBe(15000);
    expect(result.lineItems[0].totalVatCents).toBe(1050);
    expect(result.lineItems[0].totalGrossCents).toBe(16050);
  });

  it('aggregates multiple lines correctly', () => {
    const result = calcTotals([
      { quantity: 1, unitPriceCents: 10000, vatRate: 19 },
      { quantity: 1, unitPriceCents: 5000,  vatRate: 7  },
    ]);
    expect(result.totalNetCents).toBe(15000);
    expect(result.totalVatCents).toBe(1900 + 350); // 1900 + 350
    expect(result.totalGrossCents).toBe(result.totalNetCents + result.totalVatCents);
  });

  it('handles 0% VAT (tax-exempt)', () => {
    const result = calcTotals([{ quantity: 1, unitPriceCents: 5000, vatRate: 0 }]);
    expect(result.lineItems[0].totalVatCents).toBe(0);
    expect(result.lineItems[0].totalGrossCents).toBe(5000);
  });
});

describe('calcTotals — POS mode (priceIsGross=true)', () => {
  it('extracts net and VAT from a gross price at 19%', () => {
    // 119 cents gross → 100 net + 19 vat
    const result = calcTotals([{ quantity: 1, unitPriceCents: 11900, vatRate: 19 }], true);
    expect(result.lineItems[0].totalGrossCents).toBe(11900);
    expect(result.lineItems[0].totalNetCents).toBe(10000);
    expect(result.lineItems[0].totalVatCents).toBe(1900);
  });

  it('extracts net and VAT from a gross price at 7%', () => {
    // 107 cents gross → 100 net + 7 vat
    const result = calcTotals([{ quantity: 1, unitPriceCents: 10700, vatRate: 7 }], true);
    expect(result.lineItems[0].totalGrossCents).toBe(10700);
    expect(result.lineItems[0].totalNetCents).toBe(Math.round(10700 / 1.07));
    expect(result.lineItems[0].totalVatCents).toBe(10700 - Math.round(10700 / 1.07));
  });

  it('gross = net + vat invariant holds for any quantity', () => {
    const result = calcTotals([{ quantity: 5, unitPriceCents: 2999, vatRate: 19 }], true);
    const line = result.lineItems[0];
    expect(line.totalGrossCents).toBe(line.totalNetCents + line.totalVatCents);
    expect(result.totalGrossCents).toBe(result.totalNetCents + result.totalVatCents);
  });
});
