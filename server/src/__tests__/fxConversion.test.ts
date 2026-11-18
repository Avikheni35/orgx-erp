import { describe, it, expect } from 'vitest';

/**
 * Tests for the FX conversion formula used in autoPost.ts.
 *
 * Convention: fxRate = "1 EUR = X foreign currency"
 *   EUR amount = foreignCents / 100 / fxRate
 *
 * This isolates the pure arithmetic from DB calls.
 */

function toEur(cents: number, fxRate: number, isForeign: boolean): number {
  return isForeign ? (cents / 100) / fxRate : cents / 100;
}

describe('FX conversion formula (autoPost convention: 1 EUR = X foreign)', () => {
  it('EUR invoice: returns cents/100 with no conversion', () => {
    expect(toEur(100_00, 1, false)).toBeCloseTo(100.0);
    expect(toEur(5000, 1, false)).toBeCloseTo(50.0);
  });

  it('USD @1.08: $1000 → ~€925.93', () => {
    // 1 EUR = 1.08 USD → €1000 / 1.08 ≈ €925.93
    expect(toEur(100_000, 1.08, true)).toBeCloseTo(925.93, 1);
  });

  it('USD @1.08: $108 → exactly €100', () => {
    expect(toEur(108_00, 1.08, true)).toBeCloseTo(100.0, 4);
  });

  it('CHF @0.94: CHF 940 → €1000', () => {
    // 1 EUR = 0.94 CHF → CHF 940 = 940 / 0.94 = €1000
    expect(toEur(94_000, 0.94, true)).toBeCloseTo(1000.0, 2);
  });

  it('GBP @0.86: £860 → €1000', () => {
    expect(toEur(86_000, 0.86, true)).toBeCloseTo(1000.0, 2);
  });

  it('fxRate of 1.0 with isForeign=true is a passthrough', () => {
    expect(toEur(500_00, 1.0, true)).toBeCloseTo(500.0);
  });

  it('divides (not multiplies) — higher rate = lower EUR amount', () => {
    const lowRate  = toEur(100_00, 1.05, true); // stronger EUR
    const highRate = toEur(100_00, 1.15, true); // weaker EUR
    expect(lowRate).toBeGreaterThan(highRate);
  });

  it('zero cents always returns zero', () => {
    expect(toEur(0, 1.08, true)).toBe(0);
    expect(toEur(0, 1.0, false)).toBe(0);
  });
});
