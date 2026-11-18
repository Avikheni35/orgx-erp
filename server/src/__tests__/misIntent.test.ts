/**
 * M3 MIS chatbot intent classifier tests.
 * All tests run against the pure classifyIntent function — no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import { classifyIntent, VALID_INTENT_TAGS, INTENT_PATTERNS } from '../utils/misIntent';

const noHistory: { role: string; content: string }[] = [];

// ── VALID_INTENT_TAGS ─────────────────────────────────────────────────────────
describe('VALID_INTENT_TAGS', () => {
  it('contains all expected intent strings', () => {
    expect(VALID_INTENT_TAGS.has('sales')).toBe(true);
    expect(VALID_INTENT_TAGS.has('today')).toBe(true);
    expect(VALID_INTENT_TAGS.has('weekly')).toBe(true);
    expect(VALID_INTENT_TAGS.has('inventory')).toBe(true);
    expect(VALID_INTENT_TAGS.has('financial')).toBe(true);
    expect(VALID_INTENT_TAGS.has('returns')).toBe(true);
    expect(VALID_INTENT_TAGS.has('customers')).toBe(true);
    expect(VALID_INTENT_TAGS.has('ar_aging')).toBe(true);
    expect(VALID_INTENT_TAGS.has('ap_aging')).toBe(true);
    expect(VALID_INTENT_TAGS.has('payroll_cost')).toBe(true);
    expect(VALID_INTENT_TAGS.has('cash_position')).toBe(true);
    expect(VALID_INTENT_TAGS.has('budget_actual')).toBe(true);
    expect(VALID_INTENT_TAGS.has('general')).toBe(true);
  });
});

// ── INTENT_PATTERNS completeness ──────────────────────────────────────────────
describe('INTENT_PATTERNS', () => {
  it('has exactly 12 patterns', () => {
    expect(INTENT_PATTERNS).toHaveLength(12);
  });
});

// ── Direct intent matches (German & English keywords) ────────────────────────
describe('classifyIntent — direct pattern matches', () => {
  it('matches weekly — German (letzte Woche)', () => {
    const r = classifyIntent('letzte Woche wie viel?', noHistory);
    expect(r.has('weekly')).toBe(true);
  });

  it('matches weekly — English (last week)', () => {
    const r = classifyIntent('what were last week sales?', noHistory);
    expect(r.has('weekly')).toBe(true);
  });

  it('matches returns — German (Storno)', () => {
    const r = classifyIntent('zeig mir alle Storno Vorgänge', noHistory);
    expect(r.has('returns')).toBe(true);
  });

  it('matches returns — English (refund)', () => {
    const r = classifyIntent('how many refund transactions today?', noHistory);
    expect(r.has('returns')).toBe(true);
  });

  it('matches customers — German (Kunden)', () => {
    const r = classifyIntent('welche Kunden kaufen am meisten?', noHistory);
    expect(r.has('customers')).toBe(true);
  });

  it('matches customers — English (customer)', () => {
    const r = classifyIntent('who is my top customer?', noHistory);
    expect(r.has('customers')).toBe(true);
  });

  it('matches promotion — German (empfehlen)', () => {
    const r = classifyIntent('welches Produkt soll ich empfehlen?', noHistory);
    expect(r.has('promotion')).toBe(true);
  });

  it('matches promotion — English (promote)', () => {
    const r = classifyIntent('which product should I promote?', noHistory);
    expect(r.has('promotion')).toBe(true);
  });

  it('matches financial — German (Gewinn)', () => {
    const r = classifyIntent('wie ist unser Gewinn diesen Monat?', noHistory);
    expect(r.has('financial')).toBe(true);
  });

  it('matches financial — English (profit)', () => {
    const r = classifyIntent('what is our profit margin?', noHistory);
    expect(r.has('financial')).toBe(true);
  });

  it('matches inventory — German (Lagerbestand)', () => {
    const r = classifyIntent('zeig den aktuellen Lagerbestand', noHistory);
    expect(r.has('inventory')).toBe(true);
  });

  it('matches inventory — English (stock)', () => {
    const r = classifyIntent('which items are low stock?', noHistory);
    expect(r.has('inventory')).toBe(true);
  });

  it('matches sales — German (Umsatz)', () => {
    const r = classifyIntent('wie ist der Umsatz heute?', noHistory);
    expect(r.has('sales')).toBe(true);
  });

  it('matches sales — English (revenue)', () => {
    const r = classifyIntent('show me revenue for this month', noHistory);
    expect(r.has('sales')).toBe(true);
  });

  it('matches ar_aging — German (offene Forderungen)', () => {
    const r = classifyIntent('zeig alle offenen Forderungen', noHistory);
    expect(r.has('ar_aging')).toBe(true);
  });

  it('matches ar_aging — English (ar aging)', () => {
    const r = classifyIntent('run an AR aging report', noHistory);
    expect(r.has('ar_aging')).toBe(true);
  });

  it('matches ap_aging — German (Verbindlichkeiten)', () => {
    const r = classifyIntent('offene Verbindlichkeiten gegenüber Lieferanten', noHistory);
    expect(r.has('ap_aging')).toBe(true);
  });

  it('matches ap_aging — English (payable)', () => {
    const r = classifyIntent('how much payable is overdue?', noHistory);
    expect(r.has('ap_aging')).toBe(true);
  });

  it('matches payroll_cost — German (Personalkosten)', () => {
    const r = classifyIntent('wie hoch sind die Personalkosten?', noHistory);
    expect(r.has('payroll_cost')).toBe(true);
  });

  it('matches payroll_cost — English (payroll cost)', () => {
    const r = classifyIntent('show me payroll cost breakdown', noHistory);
    expect(r.has('payroll_cost')).toBe(true);
  });

  it('matches cash_position — German (Kassenbestand)', () => {
    const r = classifyIntent('aktueller Kassenbestand bitte', noHistory);
    expect(r.has('cash_position')).toBe(true);
  });

  it('matches cash_position — English (cash on hand)', () => {
    const r = classifyIntent('what is our cash on hand?', noHistory);
    expect(r.has('cash_position')).toBe(true);
  });

  it('matches budget_actual — German (Plan-Ist)', () => {
    const r = classifyIntent('zeig Plan-Ist Vergleich', noHistory);
    expect(r.has('budget_actual')).toBe(true);
  });

  it('matches budget_actual — English (budget variance)', () => {
    const r = classifyIntent('are we over budget? show variance', noHistory);
    expect(r.has('budget_actual')).toBe(true);
  });
});

// ── Cascade rules ─────────────────────────────────────────────────────────────
describe('classifyIntent — cascade rules', () => {
  it('promotion adds sales and inventory automatically', () => {
    const r = classifyIntent('which product should I promote?', noHistory);
    expect(r.has('promotion')).toBe(true);
    expect(r.has('sales')).toBe(true);
    expect(r.has('inventory')).toBe(true);
  });

  it('weekly adds sales automatically', () => {
    const r = classifyIntent('last week numbers', noHistory);
    expect(r.has('weekly')).toBe(true);
    expect(r.has('sales')).toBe(true);
  });

  it('ar_aging adds financial automatically', () => {
    const r = classifyIntent('offene Forderungen zeigen', noHistory);
    expect(r.has('ar_aging')).toBe(true);
    expect(r.has('financial')).toBe(true);
  });

  it('ap_aging adds financial automatically', () => {
    const r = classifyIntent('payable aging report', noHistory);
    expect(r.has('ap_aging')).toBe(true);
    expect(r.has('financial')).toBe(true);
  });

  it('payroll_cost adds financial automatically', () => {
    const r = classifyIntent('Personalkosten diesen Monat', noHistory);
    expect(r.has('payroll_cost')).toBe(true);
    expect(r.has('financial')).toBe(true);
  });

  it('cascade does NOT apply when trigger intent is absent', () => {
    const r = classifyIntent('Umsatz heute', noHistory);
    // sales matches, but no promotion — so inventory should NOT be added by cascade
    expect(r.has('promotion')).toBe(false);
    // Only sales from 'Umsatz', no weekly → no cascade-added sales from weekly
    expect(r.has('weekly')).toBe(false);
  });
});

// ── General fallback ──────────────────────────────────────────────────────────
describe('classifyIntent — general fallback', () => {
  it('returns general when no pattern matches', () => {
    const r = classifyIntent('hello there', noHistory);
    expect(r.has('general')).toBe(true);
    expect(r.size).toBe(1);
  });

  it('does NOT add general when at least one pattern matched', () => {
    const r = classifyIntent('Umsatz heute', noHistory);
    expect(r.has('general')).toBe(false);
  });
});

// ── History context ───────────────────────────────────────────────────────────
describe('classifyIntent — history context', () => {
  it('includes keywords from the last 2 history messages', () => {
    const history = [
      { role: 'user',      content: 'Hallo' },
      { role: 'assistant', content: 'Wie kann ich helfen?' },
      { role: 'user',      content: 'zeig Umsatz' },     // -2 (included)
      { role: 'assistant', content: 'Hier ist der Umsatz...' }, // -1 (included)
    ];
    // Current message has no keyword but history[-1] has "Umsatz"
    const r = classifyIntent('und was noch?', history);
    expect(r.has('sales')).toBe(true);
  });

  it('uses only the last 2 history messages, not older ones', () => {
    const history = [
      { role: 'user',      content: 'Kassenbestand bitte' }, // -3 (NOT included)
      { role: 'assistant', content: 'Hier der Kassenbestand' }, // -3/-2 boundary
      { role: 'user',      content: 'danke' },     // -2 included
      { role: 'assistant', content: 'Gerne' },     // -1 included
    ];
    // If history[-3] was included, cash_position would match "Kassenbestand"
    // With only last 2, no keyword → should fall back to general
    const r = classifyIntent('noch etwas?', history);
    // The 5-element history.slice(-2) = ['danke', 'Gerne'] — no cash keywords
    expect(r.has('cash_position')).toBe(false);
    expect(r.has('general')).toBe(true);
  });

  it('combines message and history for multi-intent detection', () => {
    const history = [
      { role: 'user', content: 'Personalkosten?' },
      { role: 'assistant', content: 'Personalkosten sind hoch' },
    ];
    // history has payroll_cost keyword; message adds returns keyword
    const r = classifyIntent('zeig Storno auch', history);
    expect(r.has('payroll_cost')).toBe(true);
    expect(r.has('returns')).toBe(true);
  });
});
