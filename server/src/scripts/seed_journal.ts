import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/orgx';

function gobdHash(obj: object): string {
  const canonical = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function d(dateStr: string) { return new Date(dateStr); }

function eur(n: number) { return Math.round(n * 100) / 100; }

// Each entry: { date, description, reference?, lines: [{acc, name, debit, credit}] }
interface RawLine { acc: string; name: string; debit?: number; credit?: number; }
interface RawEntry {
  date: string;
  description: string;
  reference?: string;
  lines: RawLine[];
}

// Account name lookup — matches SKR03
const ACC: Record<string, string> = {
  '1000': 'Kasse',
  '1200': 'Bank',
  '1300': 'Forderungen aus Lieferungen und Leistungen',
  '1400': 'Debitorenkonto (Sammelkonto)',
  '1571': 'Abziehbare Vorsteuer 7%',
  '1576': 'Abziehbare Vorsteuer 19%',
  '1600': 'Verbindlichkeiten aus Lieferungen und Leistungen',
  '1620': 'Kreditorenkonto (Sammelkonto)',
  '1742': 'Verbindlichkeiten ggü. Arbeitnehmern (Löhne)',
  '1750': 'Verbindlichkeiten Steuern und SS-Beiträge',
  '1771': 'Umsatzsteuer 7%',
  '1776': 'Umsatzsteuer 19%',
  '1790': 'Umsatzsteuer-Vorauszahlungen',
  '2000': 'Gezeichnetes Kapital (Stammkapital)',
  '4400': 'Miete, Pacht',
  '4530': 'Energiekosten',
  '4650': 'Werbekosten',
  '4660': 'Reisekosten',
  '4700': 'Versicherungen',
  '4800': 'Porto und Versandkosten',
  '4830': 'Telefon und Internet',
  '4840': 'Bürobedarf',
  '4900': 'Steuerberatungskosten',
  '4910': 'Rechts- und Beratungskosten',
  '4940': 'Abschreibungen auf Sachanlagen',
  '4960': 'Sonstige betriebliche Aufwendungen',
  '6010': 'Gehälter',
  '6020': 'Löhne',
  '6110': 'Gesetzliche soziale Aufwendungen',
  '7310': 'Bankgebühren',
  '8000': 'Umsatzerlöse 19% (Inland)',
  '8200': 'Sonstige betriebliche Erträge',
  '9000': 'Saldenvorträge (Eröffnungsbilanzkonto)',
};

function l(acc: string, debit?: number, credit?: number): RawLine {
  return { acc, name: ACC[acc] ?? acc, debit: debit ?? 0, credit: credit ?? 0 };
}

// All sample journal entries — Demo GmbH, a staffing/consulting agency, Jan–Aug 2026
const ENTRIES: RawEntry[] = [
  // ─── JANUARY 2026 ────────────────────────────────────────────────────────
  {
    date: '2026-01-02', description: 'Eröffnungsbuchung — Gesellschaftereinlage', reference: 'EB-2026',
    lines: [ l('1200', 50000), l('2000', 0, 50000) ],
  },
  {
    date: '2026-01-03', description: 'Miete Januar 2026 — Musterstraße 1, Berlin', reference: 'MV-2026-01',
    lines: [ l('4400', 2500), l('1576', 475), l('1600', 0, 2975) ],
  },
  {
    date: '2026-01-04', description: 'Zahlung Mietverbindlichkeit Januar', reference: 'SEPA-001',
    lines: [ l('1600', 2975), l('1200', 0, 2975) ],
  },
  {
    date: '2026-01-08', description: 'Versicherungspaket 2026 — Zurich Versicherung', reference: 'INS-2026',
    lines: [ l('4700', 1800), l('1200', 0, 1800) ],
  },
  {
    date: '2026-01-10', description: 'Ausgangsrechnung RE-2026-001 — Müller Logistik GmbH', reference: 'RE-2026-001',
    lines: [ l('1400', 11900), l('8000', 0, 10000), l('1776', 0, 1900) ],
  },
  {
    date: '2026-01-15', description: 'Bürobedarf — Staples GmbH', reference: 'K-2026-001',
    lines: [ l('4840', 320), l('1576', 60.80), l('1200', 0, 380.80) ],
  },
  {
    date: '2026-01-20', description: 'Gehälter & Sozialabgaben Januar 2026', reference: 'LOHN-2026-01',
    lines: [ l('6010', 12000), l('6110', 2400), l('1742', 0, 9800), l('1750', 0, 4600) ],
  },
  {
    date: '2026-01-22', description: 'Lohnauszahlung Januar 2026', reference: 'SEPA-002',
    lines: [ l('1742', 9800), l('1200', 0, 9800) ],
  },
  {
    date: '2026-01-28', description: 'Bankgebühren Januar 2026', reference: 'BANK-2026-01',
    lines: [ l('7310', 38.50), l('1200', 0, 38.50) ],
  },
  {
    date: '2026-01-31', description: 'Telefon & Internet Januar — Telekom', reference: 'TEL-2026-01',
    lines: [ l('4830', 89), l('1576', 16.91), l('1200', 0, 105.91) ],
  },

  // ─── FEBRUARY 2026 ───────────────────────────────────────────────────────
  {
    date: '2026-02-03', description: 'Miete Februar 2026 — Musterstraße 1, Berlin', reference: 'MV-2026-02',
    lines: [ l('4400', 2500), l('1576', 475), l('1600', 0, 2975) ],
  },
  {
    date: '2026-02-04', description: 'Zahlung Mietverbindlichkeit Februar', reference: 'SEPA-003',
    lines: [ l('1600', 2975), l('1200', 0, 2975) ],
  },
  {
    date: '2026-02-05', description: 'Zahlungseingang RE-2026-001 — Müller Logistik GmbH', reference: 'ZE-001',
    lines: [ l('1200', 11900), l('1400', 0, 11900) ],
  },
  {
    date: '2026-02-07', description: 'Ausgangsrechnung RE-2026-002 — Schmidt & Partner AG', reference: 'RE-2026-002',
    lines: [ l('1400', 17850), l('8000', 0, 15000), l('1776', 0, 2850) ],
  },
  {
    date: '2026-02-12', description: 'Ausgangsrechnung RE-2026-003 — Huber Industrie KG', reference: 'RE-2026-003',
    lines: [ l('1400', 8330), l('8000', 0, 7000), l('1776', 0, 1330) ],
  },
  {
    date: '2026-02-14', description: 'Werbekosten — Google Ads Februar', reference: 'WK-2026-02',
    lines: [ l('4650', 500), l('1576', 95), l('1600', 0, 595) ],
  },
  {
    date: '2026-02-20', description: 'Gehälter & Sozialabgaben Februar 2026', reference: 'LOHN-2026-02',
    lines: [ l('6010', 12000), l('6110', 2400), l('1742', 0, 9800), l('1750', 0, 4600) ],
  },
  {
    date: '2026-02-21', description: 'Lohnauszahlung Februar 2026', reference: 'SEPA-004',
    lines: [ l('1742', 9800), l('1200', 0, 9800) ],
  },
  {
    date: '2026-02-25', description: 'Zahlung Werbekosten Google Ads', reference: 'SEPA-005',
    lines: [ l('1600', 595), l('1200', 0, 595) ],
  },
  {
    date: '2026-02-28', description: 'Bankgebühren Februar 2026', reference: 'BANK-2026-02',
    lines: [ l('7310', 38.50), l('1200', 0, 38.50) ],
  },

  // ─── MARCH 2026 ──────────────────────────────────────────────────────────
  {
    date: '2026-03-03', description: 'Miete März 2026 — Musterstraße 1, Berlin', reference: 'MV-2026-03',
    lines: [ l('4400', 2500), l('1576', 475), l('1600', 0, 2975) ],
  },
  {
    date: '2026-03-04', description: 'Zahlung Mietverbindlichkeit März', reference: 'SEPA-006',
    lines: [ l('1600', 2975), l('1200', 0, 2975) ],
  },
  {
    date: '2026-03-05', description: 'Zahlungseingang RE-2026-002 — Schmidt & Partner AG', reference: 'ZE-002',
    lines: [ l('1200', 17850), l('1400', 0, 17850) ],
  },
  {
    date: '2026-03-05', description: 'Zahlungseingang RE-2026-003 — Huber Industrie KG', reference: 'ZE-003',
    lines: [ l('1200', 8330), l('1400', 0, 8330) ],
  },
  {
    date: '2026-03-10', description: 'Ausgangsrechnung RE-2026-004 — Müller Logistik GmbH', reference: 'RE-2026-004',
    lines: [ l('1400', 14280), l('8000', 0, 12000), l('1776', 0, 2280) ],
  },
  {
    date: '2026-03-10', description: 'Ausgangsrechnung RE-2026-005 — Technik Nord GmbH', reference: 'RE-2026-005',
    lines: [ l('1400', 23800), l('8000', 0, 20000), l('1776', 0, 3800) ],
  },
  {
    date: '2026-03-12', description: 'Steuerberatungskosten Q1 — Müller & Partner Stb.', reference: 'STB-Q1-2026',
    lines: [ l('4900', 900), l('1576', 171), l('1600', 0, 1071) ],
  },
  {
    date: '2026-03-15', description: 'USt-Vorauszahlung Q4/2025 ans Finanzamt', reference: 'UST-Q4-2025',
    lines: [ l('1790', 4200), l('1200', 0, 4200) ],
  },
  {
    date: '2026-03-20', description: 'Gehälter & Sozialabgaben März 2026', reference: 'LOHN-2026-03',
    lines: [ l('6010', 12000), l('6110', 2400), l('1742', 0, 9800), l('1750', 0, 4600) ],
  },
  {
    date: '2026-03-21', description: 'Lohnauszahlung März 2026', reference: 'SEPA-007',
    lines: [ l('1742', 9800), l('1200', 0, 9800) ],
  },
  {
    date: '2026-03-25', description: 'Zahlung Steuerberatung Q1', reference: 'SEPA-008',
    lines: [ l('1600', 1071), l('1200', 0, 1071) ],
  },
  {
    date: '2026-03-31', description: 'Energiekosten Q1 2026 — Vattenfall', reference: 'STROM-Q1',
    lines: [ l('4530', 680), l('1576', 129.20), l('1200', 0, 809.20) ],
  },
  {
    date: '2026-03-31', description: 'Abschreibung Büroausstattung März 2026', reference: 'AfA-2026-03',
    lines: [ l('4940', 250), l('1200', 0, 250) ],
  },

  // ─── APRIL 2026 ──────────────────────────────────────────────────────────
  {
    date: '2026-04-02', description: 'Miete April 2026 — Musterstraße 1, Berlin', reference: 'MV-2026-04',
    lines: [ l('4400', 2500), l('1576', 475), l('1600', 0, 2975) ],
  },
  {
    date: '2026-04-03', description: 'Zahlung Mietverbindlichkeit April', reference: 'SEPA-009',
    lines: [ l('1600', 2975), l('1200', 0, 2975) ],
  },
  {
    date: '2026-04-04', description: 'Zahlungseingang RE-2026-004 — Müller Logistik GmbH', reference: 'ZE-004',
    lines: [ l('1200', 14280), l('1400', 0, 14280) ],
  },
  {
    date: '2026-04-04', description: 'Zahlungseingang RE-2026-005 — Technik Nord GmbH', reference: 'ZE-005',
    lines: [ l('1200', 23800), l('1400', 0, 23800) ],
  },
  {
    date: '2026-04-08', description: 'Ausgangsrechnung RE-2026-006 — Schmidt & Partner AG', reference: 'RE-2026-006',
    lines: [ l('1400', 21420), l('8000', 0, 18000), l('1776', 0, 3420) ],
  },
  {
    date: '2026-04-15', description: 'USt-Vorauszahlung Q1/2026 ans Finanzamt', reference: 'UST-Q1-2026',
    lines: [ l('1776', 8030), l('1571', 0, 500), l('1576', 0, 1900.91), l('1790', 0, 5629.09) ],
  },
  {
    date: '2026-04-16', description: 'Zahlung USt-Vorauszahlung Q1/2026', reference: 'SEPA-010',
    lines: [ l('1790', 5629.09), l('1200', 0, 5629.09) ],
  },
  {
    date: '2026-04-20', description: 'Gehälter & Sozialabgaben April 2026', reference: 'LOHN-2026-04',
    lines: [ l('6010', 12000), l('6110', 2400), l('1742', 0, 9800), l('1750', 0, 4600) ],
  },
  {
    date: '2026-04-21', description: 'Lohnauszahlung April 2026', reference: 'SEPA-011',
    lines: [ l('1742', 9800), l('1200', 0, 9800) ],
  },
  {
    date: '2026-04-23', description: 'Reisekosten Messebesuch Frankfurt — Bahn & Hotel', reference: 'REISE-2026-04',
    lines: [ l('4660', 480), l('1576', 91.20), l('1200', 0, 571.20) ],
  },
  {
    date: '2026-04-30', description: 'Bankgebühren April 2026', reference: 'BANK-2026-04',
    lines: [ l('7310', 38.50), l('1200', 0, 38.50) ],
  },

  // ─── MAY 2026 ────────────────────────────────────────────────────────────
  {
    date: '2026-05-02', description: 'Miete Mai 2026 — Musterstraße 1, Berlin', reference: 'MV-2026-05',
    lines: [ l('4400', 2500), l('1576', 475), l('1600', 0, 2975) ],
  },
  {
    date: '2026-05-04', description: 'Zahlung Mietverbindlichkeit Mai', reference: 'SEPA-012',
    lines: [ l('1600', 2975), l('1200', 0, 2975) ],
  },
  {
    date: '2026-05-05', description: 'Zahlungseingang RE-2026-006 — Schmidt & Partner AG', reference: 'ZE-006',
    lines: [ l('1200', 21420), l('1400', 0, 21420) ],
  },
  {
    date: '2026-05-06', description: 'Ausgangsrechnung RE-2026-007 — Huber Industrie KG', reference: 'RE-2026-007',
    lines: [ l('1400', 29750), l('8000', 0, 25000), l('1776', 0, 4750) ],
  },
  {
    date: '2026-05-08', description: 'Ausgangsrechnung RE-2026-008 — Müller Logistik GmbH', reference: 'RE-2026-008',
    lines: [ l('1400', 16660), l('8000', 0, 14000), l('1776', 0, 2660) ],
  },
  {
    date: '2026-05-12', description: 'Werbekosten — LinkedIn Ads Mai', reference: 'WK-2026-05',
    lines: [ l('4650', 750), l('1576', 142.50), l('1600', 0, 892.50) ],
  },
  {
    date: '2026-05-20', description: 'Gehälter & Sozialabgaben Mai 2026', reference: 'LOHN-2026-05',
    lines: [ l('6010', 13000), l('6110', 2600), l('1742', 0, 10600), l('1750', 0, 5000) ],
  },
  {
    date: '2026-05-21', description: 'Lohnauszahlung Mai 2026', reference: 'SEPA-013',
    lines: [ l('1742', 10600), l('1200', 0, 10600) ],
  },
  {
    date: '2026-05-27', description: 'Zahlung Werbekosten LinkedIn', reference: 'SEPA-014',
    lines: [ l('1600', 892.50), l('1200', 0, 892.50) ],
  },
  {
    date: '2026-05-31', description: 'Telefon & Internet Mai — Telekom', reference: 'TEL-2026-05',
    lines: [ l('4830', 89), l('1576', 16.91), l('1200', 0, 105.91) ],
  },

  // ─── JUNE 2026 ───────────────────────────────────────────────────────────
  {
    date: '2026-06-02', description: 'Miete Juni 2026 — Musterstraße 1, Berlin', reference: 'MV-2026-06',
    lines: [ l('4400', 2500), l('1576', 475), l('1600', 0, 2975) ],
  },
  {
    date: '2026-06-03', description: 'Zahlung Mietverbindlichkeit Juni', reference: 'SEPA-015',
    lines: [ l('1600', 2975), l('1200', 0, 2975) ],
  },
  {
    date: '2026-06-04', description: 'Zahlungseingang RE-2026-007 — Huber Industrie KG', reference: 'ZE-007',
    lines: [ l('1200', 29750), l('1400', 0, 29750) ],
  },
  {
    date: '2026-06-05', description: 'Zahlungseingang RE-2026-008 — Müller Logistik GmbH', reference: 'ZE-008',
    lines: [ l('1200', 16660), l('1400', 0, 16660) ],
  },
  {
    date: '2026-06-10', description: 'Ausgangsrechnung RE-2026-009 — Technik Nord GmbH', reference: 'RE-2026-009',
    lines: [ l('1400', 35700), l('8000', 0, 30000), l('1776', 0, 5700) ],
  },
  {
    date: '2026-06-15', description: 'Rechts- und Beratungskosten — Kanzlei Schneider', reference: 'RA-2026-06',
    lines: [ l('4910', 1200), l('1576', 228), l('1600', 0, 1428) ],
  },
  {
    date: '2026-06-20', description: 'Gehälter & Sozialabgaben Juni 2026', reference: 'LOHN-2026-06',
    lines: [ l('6010', 13000), l('6110', 2600), l('1742', 0, 10600), l('1750', 0, 5000) ],
  },
  {
    date: '2026-06-21', description: 'Lohnauszahlung Juni 2026', reference: 'SEPA-016',
    lines: [ l('1742', 10600), l('1200', 0, 10600) ],
  },
  {
    date: '2026-06-25', description: 'Zahlung Rechtsberatung', reference: 'SEPA-017',
    lines: [ l('1600', 1428), l('1200', 0, 1428) ],
  },
  {
    date: '2026-06-30', description: 'Energiekosten Q2 2026 — Vattenfall', reference: 'STROM-Q2',
    lines: [ l('4530', 620), l('1576', 117.80), l('1200', 0, 737.80) ],
  },
  {
    date: '2026-06-30', description: 'Abschreibung Büroausstattung Q2 2026', reference: 'AfA-2026-Q2',
    lines: [ l('4940', 750), l('1200', 0, 750) ],
  },

  // ─── JULY 2026 ───────────────────────────────────────────────────────────
  {
    date: '2026-07-02', description: 'Miete Juli 2026 — Musterstraße 1, Berlin', reference: 'MV-2026-07',
    lines: [ l('4400', 2500), l('1576', 475), l('1600', 0, 2975) ],
  },
  {
    date: '2026-07-03', description: 'Zahlung Mietverbindlichkeit Juli', reference: 'SEPA-018',
    lines: [ l('1600', 2975), l('1200', 0, 2975) ],
  },
  {
    date: '2026-07-04', description: 'Zahlungseingang RE-2026-009 — Technik Nord GmbH', reference: 'ZE-009',
    lines: [ l('1200', 35700), l('1400', 0, 35700) ],
  },
  {
    date: '2026-07-07', description: 'Ausgangsrechnung RE-2026-010 — Schmidt & Partner AG', reference: 'RE-2026-010',
    lines: [ l('1400', 26180), l('8000', 0, 22000), l('1776', 0, 4180) ],
  },
  {
    date: '2026-07-08', description: 'Ausgangsrechnung RE-2026-011 — Huber Industrie KG', reference: 'RE-2026-011',
    lines: [ l('1400', 19040), l('8000', 0, 16000), l('1776', 0, 3040) ],
  },
  {
    date: '2026-07-10', description: 'USt-Vorauszahlung Q2/2026 ans Finanzamt', reference: 'UST-Q2-2026',
    lines: [ l('1776', 16730), l('1576', 0, 3046.32), l('1790', 0, 13683.68) ],
  },
  {
    date: '2026-07-11', description: 'Zahlung USt-Vorauszahlung Q2/2026', reference: 'SEPA-019',
    lines: [ l('1790', 13683.68), l('1200', 0, 13683.68) ],
  },
  {
    date: '2026-07-15', description: 'Steuerberatungskosten Q2 — Müller & Partner Stb.', reference: 'STB-Q2-2026',
    lines: [ l('4900', 900), l('1576', 171), l('1600', 0, 1071) ],
  },
  {
    date: '2026-07-20', description: 'Gehälter & Sozialabgaben Juli 2026', reference: 'LOHN-2026-07',
    lines: [ l('6010', 13000), l('6110', 2600), l('1742', 0, 10600), l('1750', 0, 5000) ],
  },
  {
    date: '2026-07-21', description: 'Lohnauszahlung Juli 2026', reference: 'SEPA-020',
    lines: [ l('1742', 10600), l('1200', 0, 10600) ],
  },
  {
    date: '2026-07-22', description: 'Bürobedarf — Viking Office', reference: 'K-2026-07',
    lines: [ l('4840', 185), l('1576', 35.15), l('1200', 0, 220.15) ],
  },
  {
    date: '2026-07-31', description: 'Bankgebühren Juli 2026', reference: 'BANK-2026-07',
    lines: [ l('7310', 38.50), l('1200', 0, 38.50) ],
  },

  // ─── AUGUST 2026 (partial / open invoices) ───────────────────────────────
  {
    date: '2026-08-01', description: 'Miete August 2026 — Musterstraße 1, Berlin', reference: 'MV-2026-08',
    lines: [ l('4400', 2500), l('1576', 475), l('1600', 0, 2975) ],
  },
  {
    date: '2026-08-02', description: 'Zahlung Mietverbindlichkeit August', reference: 'SEPA-021',
    lines: [ l('1600', 2975), l('1200', 0, 2975) ],
  },
  {
    date: '2026-08-05', description: 'Zahlungseingang RE-2026-010 — Schmidt & Partner AG', reference: 'ZE-010',
    lines: [ l('1200', 26180), l('1400', 0, 26180) ],
  },
  {
    date: '2026-08-06', description: 'Ausgangsrechnung RE-2026-012 — Müller Logistik GmbH', reference: 'RE-2026-012',
    lines: [ l('1400', 33320), l('8000', 0, 28000), l('1776', 0, 5320) ],
  },
  {
    date: '2026-08-08', description: 'Ausgangsrechnung RE-2026-013 — Technik Nord GmbH', reference: 'RE-2026-013',
    lines: [ l('1400', 41650), l('8000', 0, 35000), l('1776', 0, 6650) ],
  },
  {
    date: '2026-08-12', description: 'Werbekosten — Google Ads August', reference: 'WK-2026-08',
    lines: [ l('4650', 650), l('1576', 123.50), l('1600', 0, 773.50) ],
  },
  {
    date: '2026-08-13', description: 'Sonstige betriebliche Aufwendungen — Reinigung', reference: 'SONST-2026-08',
    lines: [ l('4960', 300), l('1576', 57), l('1200', 0, 357) ],
  },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[Journal Seed] Connected to MongoDB');

  const db = mongoose.connection.db!;
  const tenant = await db.collection('tenants').findOne({ loginCode: 'demo' });
  if (!tenant) { console.error('Demo tenant not found. Run seed.ts first.'); process.exit(1); }

  const tenantId = tenant._id as mongoose.Types.ObjectId;

  // Check existing
  const existing = await db.collection('m3_journal_entries').countDocuments({ tenantId });
  if (existing > 0) {
    console.log(`[Journal Seed] ${existing} entries already exist. Deleting and re-seeding...`);
    await db.collection('m3_journal_entries').deleteMany({ tenantId });
    await db.collection('m3_counters').deleteOne({ tenantId: tenantId.toString(), key: 'journal' });
  }

  // Load fiscal year periods for lookups
  const fy = await db.collection('m3_fiscalyears').findOne({ tenantId, name: 'Geschäftsjahr 2026' });
  if (!fy) { console.error('Fiscal year 2026 not found. Run seed_erp_data.ts first.'); process.exit(1); }

  const periods = await db.collection('m3_periods').find({ tenantId, fiscalYearId: fy._id }).toArray();

  function getPeriod(date: Date) {
    return periods.find((p) => new Date(p.startDate) <= date && new Date(p.endDate) >= date);
  }

  // Get admin user
  const adminUser = await db.collection('users').findOne({ email: 'admin@erp.demo', tenantId });
  const adminId   = adminUser?._id as mongoose.Types.ObjectId;

  let seq = 0;
  const docs = [];

  for (const entry of ENTRIES) {
    seq++;
    const entryNumber = `BU-${String(seq).padStart(6, '0')}`;
    const date        = new Date(entry.date);
    const period      = getPeriod(date);

    const lines = entry.lines.map((ln) => ({
      accountNumber: ln.acc,
      accountName:   ln.name,
      debit:         eur(ln.debit ?? 0),
      credit:        eur(ln.credit ?? 0),
      costCenter:    '',
      description:   '',
    }));

    const totalDebit  = eur(lines.reduce((s, l) => s + l.debit,  0));
    const totalCredit = eur(lines.reduce((s, l) => s + l.credit, 0));

    if (Math.abs(totalDebit - totalCredit) > 0.02) {
      console.warn(`  ⚠ ${entryNumber} not balanced: Soll ${totalDebit} ≠ Haben ${totalCredit} — ${entry.description}`);
    }

    const hash = gobdHash({ tenantId: tenantId.toString(), entryNumber, date: date.toISOString(), description: entry.description, lines, totalDebit, totalCredit });

    docs.push({
      tenantId,
      entryNumber,
      date,
      description:  entry.description,
      reference:    entry.reference ?? '',
      status:       'posted',
      lines,
      totalDebit,
      totalCredit,
      periodId:     period?._id,
      fiscalYearId: fy._id,
      gobdHash:     hash,
      createdBy:    adminId,
      postedAt:     date,
      postedBy:     adminId,
      createdAt:    date,
      updatedAt:    date,
    });
  }

  await db.collection('m3_journal_entries').insertMany(docs);

  // Sync counter to the actual max entryNumber in the collection — handles re-seeding
  // on a DB that already has app-created entries with higher numbers.
  const maxDoc = await db.collection('m3_journal_entries')
    .find({ tenantId })
    .sort({ entryNumber: -1 })
    .limit(1)
    .toArray();
  const maxSeq = maxDoc.length > 0
    ? parseInt(maxDoc[0].entryNumber.replace('BU-', ''), 10)
    : seq;
  const syncedSeq = Math.max(seq, maxSeq);

  await db.collection('m3_counters').findOneAndUpdate(
    { tenantId: tenantId.toString(), key: 'journal' },
    { $set: { seq: syncedSeq } },
    { upsert: true }
  );

  console.log(`[Journal Seed] ✓ Created ${docs.length} journal entries (BU-000001 – BU-${String(seq).padStart(6, '0')})`);
  console.log('\n  Open in browser:');
  console.log('  → Journal:    http://localhost:3002/erp/buchfuehrung');
  console.log('  → Kontenplan: http://localhost:3002/erp/accounts');

  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
