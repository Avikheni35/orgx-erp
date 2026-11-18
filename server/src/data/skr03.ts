import type { AccountType } from '../models/Account';

export interface StandardAccount {
  number: string;
  name: string;
  type: AccountType;
  subtype: string;
  taxCode: string;
}

// SKR03 — standard chart of accounts for Dienstleistung / Handel
export const SKR03: StandardAccount[] = [
  // ── Klasse 0: Anlagevermögen (Fixed Assets) ─────────────────────────────
  { number: '0100', name: 'Immaterielle Vermögensgegenstände',          type: 'asset',     subtype: 'fixed_intangible', taxCode: '' },
  { number: '0140', name: 'Lizenzen, Software',                         type: 'asset',     subtype: 'fixed_intangible', taxCode: '' },
  { number: '0200', name: 'Grundstücke und Gebäude',                    type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },
  { number: '0400', name: 'Maschinen und maschinelle Anlagen',          type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },
  { number: '0410', name: 'Betriebs- und Geschäftsausstattung',         type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },
  { number: '0420', name: 'Kraftfahrzeuge',                             type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },
  { number: '0450', name: 'Büromaschinen, EDV-Anlagen',                 type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },
  { number: '0480', name: 'Geleistete Anzahlungen auf Anlagevermögen', type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },
  { number: '0490', name: 'Kumulierte Abschreibungen Anlagevermögen',  type: 'asset',     subtype: 'fixed_acc_depr',   taxCode: '' },

  // ── Klasse 1: Umlaufvermögen ─────────────────────────────────────────────
  { number: '1000', name: 'Kasse',                                      type: 'asset',     subtype: 'cash',             taxCode: '' },
  { number: '1010', name: 'Kasse 2',                                    type: 'asset',     subtype: 'cash',             taxCode: '' },
  { number: '1200', name: 'Bank',                                       type: 'asset',     subtype: 'bank',             taxCode: '' },
  { number: '1201', name: 'Bank 2',                                     type: 'asset',     subtype: 'bank',             taxCode: '' },
  { number: '1300', name: 'Forderungen aus Lieferungen und Leistungen', type: 'asset',     subtype: 'receivable',       taxCode: '' },
  { number: '1370', name: 'Sonstige Forderungen',                       type: 'asset',     subtype: 'receivable',       taxCode: '' },
  { number: '1400', name: 'Debitorenkonto (Sammelkonto)',               type: 'asset',     subtype: 'receivable',       taxCode: '' },
  { number: '1500', name: 'Wertpapiere des Umlaufvermögens',            type: 'asset',     subtype: 'securities',       taxCode: '' },
  { number: '1510', name: 'Geleistete Anzahlungen',                     type: 'asset',     subtype: 'prepayment',       taxCode: '' },
  { number: '1540', name: 'Aktive Rechnungsabgrenzungsposten (ARAP)',   type: 'asset',     subtype: 'accrual',          taxCode: '' },
  { number: '1571', name: 'Abziehbare Vorsteuer 7%',                   type: 'asset',     subtype: 'vat',              taxCode: 'VST7' },
  { number: '1576', name: 'Abziehbare Vorsteuer 19%',                  type: 'asset',     subtype: 'vat',              taxCode: 'VST19' },

  // ── Verbindlichkeiten (Klasse 1 cont.) ──────────────────────────────────
  { number: '1600', name: 'Verbindlichkeiten aus Lieferungen und Leistungen', type: 'liability', subtype: 'payable',  taxCode: '' },
  { number: '1620', name: 'Kreditorenkonto (Sammelkonto)',              type: 'liability', subtype: 'payable',          taxCode: '' },
  { number: '1700', name: 'Erhaltene Anzahlungen',                      type: 'liability', subtype: 'advance',          taxCode: '' },
  { number: '1730', name: 'Verbindlichkeiten ggü. Kreditinstituten',    type: 'liability', subtype: 'bank_loan',        taxCode: '' },
  { number: '1740', name: 'Verbindlichkeiten ggü. Gesellschaftern',     type: 'liability', subtype: 'shareholder',      taxCode: '' },
  { number: '1742', name: 'Verbindlichkeiten ggü. Arbeitnehmern (Löhne)', type: 'liability', subtype: 'wages',          taxCode: '' },
  { number: '1750', name: 'Verbindlichkeiten Steuern und SS-Beiträge',  type: 'liability', subtype: 'tax_payable',      taxCode: '' },
  { number: '1771', name: 'Umsatzsteuer 7%',                           type: 'liability', subtype: 'vat',              taxCode: 'UST7' },
  { number: '1776', name: 'Umsatzsteuer 19%',                          type: 'liability', subtype: 'vat',              taxCode: 'UST19' },
  { number: '1780', name: 'Umsatzsteuer Vorjahreszeitraum',            type: 'liability', subtype: 'vat',              taxCode: '' },
  { number: '1790', name: 'Umsatzsteuer-Vorauszahlungen',              type: 'liability', subtype: 'vat',              taxCode: '' },
  { number: '1800', name: 'Privatentnahmen',                            type: 'equity',    subtype: 'drawings',         taxCode: '' },
  { number: '1890', name: 'Passive Rechnungsabgrenzungsposten (PRAP)', type: 'liability', subtype: 'deferral',          taxCode: '' },

  // ── Klasse 2: Eigenkapital ───────────────────────────────────────────────
  { number: '2000', name: 'Gezeichnetes Kapital (Stammkapital)',        type: 'equity',    subtype: 'share_capital',    taxCode: '' },
  { number: '2010', name: 'Ausstehende Einlagen',                       type: 'equity',    subtype: 'share_capital',    taxCode: '' },
  { number: '2100', name: 'Kapitalrücklage',                            type: 'equity',    subtype: 'reserve',          taxCode: '' },
  { number: '2200', name: 'Gewinnrücklagen',                            type: 'equity',    subtype: 'retained',         taxCode: '' },
  { number: '2300', name: 'Gewinn-/Verlustvortrag',                     type: 'equity',    subtype: 'retained',         taxCode: '' },
  { number: '2900', name: 'Eigenkapital (Einzelunternehmen)',            type: 'equity',    subtype: 'share_capital',    taxCode: '' },

  // ── Klasse 3: Fremdkapital / Rückstellungen ──────────────────────────────
  { number: '3000', name: 'Darlehen (langfristig)',                     type: 'liability', subtype: 'long_term_debt',   taxCode: '' },
  { number: '3030', name: 'Verbindlichkeiten ggü. Kreditinstituten (langfristig)', type: 'liability', subtype: 'long_term_debt', taxCode: '' },
  { number: '3200', name: 'Rückstellungen für Pensionen',               type: 'liability', subtype: 'provision',        taxCode: '' },
  { number: '3300', name: 'Steuerrückstellungen',                       type: 'liability', subtype: 'provision',        taxCode: '' },
  { number: '3400', name: 'Sonstige Rückstellungen',                    type: 'liability', subtype: 'provision',        taxCode: '' },

  // ── Klasse 4: Betriebliche Aufwendungen ─────────────────────────────────
  { number: '4000', name: 'Materialaufwand (Roh-, Hilfs- und Betriebsstoffe)', type: 'expense', subtype: 'cogs',       taxCode: '' },
  { number: '4100', name: 'Bezogene Waren',                             type: 'expense',   subtype: 'cogs',             taxCode: '' },
  { number: '4200', name: 'Bezogene Leistungen',                        type: 'expense',   subtype: 'cogs',             taxCode: '' },
  { number: '4300', name: 'Fremdleistungen',                            type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4400', name: 'Miete, Pacht',                               type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4530', name: 'Energiekosten',                              type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4600', name: 'Instandhaltung, Reparaturen',                type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4650', name: 'Werbekosten',                                type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4660', name: 'Reisekosten',                                type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4670', name: 'Bewirtungskosten',                           type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4700', name: 'Versicherungen',                             type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4730', name: 'Beiträge und Abgaben',                       type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4800', name: 'Porto und Versandkosten',                    type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4830', name: 'Telefon und Internet',                       type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4840', name: 'Bürobedarf',                                 type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4850', name: 'Zeitschriften und Fachbücher',               type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4900', name: 'Steuerberatungskosten',                      type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4910', name: 'Rechts- und Beratungskosten',                type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4920', name: 'Buchführungskosten',                         type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4940', name: 'Abschreibungen auf Sachanlagen',             type: 'expense',   subtype: 'depreciation',     taxCode: '' },
  { number: '4950', name: 'Abschreibungen auf immaterielle WG',         type: 'expense',   subtype: 'depreciation',     taxCode: '' },
  { number: '4960', name: 'Sonstige betriebliche Aufwendungen',         type: 'expense',   subtype: 'other',            taxCode: '' },
  { number: '4970', name: 'Gewerbesteuer',                              type: 'expense',   subtype: 'tax',              taxCode: '' },
  { number: '4980', name: 'Körperschaftsteuer',                         type: 'expense',   subtype: 'tax',              taxCode: '' },

  // ── Klasse 6: Personalaufwendungen ──────────────────────────────────────
  { number: '6000', name: 'Löhne und Gehälter',                         type: 'expense',   subtype: 'personnel',        taxCode: '' },
  { number: '6010', name: 'Gehälter',                                   type: 'expense',   subtype: 'personnel',        taxCode: '' },
  { number: '6020', name: 'Löhne',                                      type: 'expense',   subtype: 'personnel',        taxCode: '' },
  { number: '6110', name: 'Gesetzliche soziale Aufwendungen',           type: 'expense',   subtype: 'personnel',        taxCode: '' },
  { number: '6130', name: 'Freiwillige soziale Aufwendungen',           type: 'expense',   subtype: 'personnel',        taxCode: '' },
  { number: '6200', name: 'Reisekosten Arbeitnehmer',                   type: 'expense',   subtype: 'personnel',        taxCode: '' },

  // ── Klasse 7: Sonstige Aufwendungen ─────────────────────────────────────
  { number: '7300', name: 'Zinsen und ähnliche Aufwendungen',           type: 'expense',   subtype: 'financial',        taxCode: '' },
  { number: '7310', name: 'Bankgebühren',                               type: 'expense',   subtype: 'financial',        taxCode: '' },
  { number: '7320', name: 'Zinsen für kurzfristige Verbindlichkeiten', type: 'expense',   subtype: 'financial',        taxCode: '' },

  // ── Klasse 8: Erträge ────────────────────────────────────────────────────
  { number: '8000', name: 'Umsatzerlöse 19% (Inland)',                  type: 'revenue',   subtype: 'sales',            taxCode: 'UST19' },
  { number: '8100', name: 'Umsatzerlöse 7% (Inland)',                   type: 'revenue',   subtype: 'sales',            taxCode: 'UST7' },
  { number: '8120', name: 'Steuerfreie Umsätze §4 UStG',               type: 'revenue',   subtype: 'sales',            taxCode: 'UST0' },
  { number: '8200', name: 'Sonstige betriebliche Erträge',              type: 'revenue',   subtype: 'other',            taxCode: '' },
  { number: '8400', name: 'Zinsen und ähnliche Erträge',                type: 'revenue',   subtype: 'financial',        taxCode: '' },
  { number: '8510', name: 'Erträge aus dem Abgang von Anlagevermögen', type: 'revenue',   subtype: 'other',            taxCode: '' },
  { number: '8600', name: 'Außerordentliche Erträge',                  type: 'revenue',   subtype: 'other',            taxCode: '' },

  // ── Klasse 9: Abschlusskonten ────────────────────────────────────────────
  { number: '9000', name: 'Saldenvorträge (Eröffnungsbilanzkonto)',     type: 'equity',    subtype: 'closing',          taxCode: '' },
  { number: '9008', name: 'Gewinn- und Verlustkonto (GuV)',             type: 'equity',    subtype: 'closing',          taxCode: '' },
];

// SKR04 — standard chart of accounts for Industrie (GKV method)
export const SKR04: StandardAccount[] = [
  // ── Klasse 0: Anlagevermögen ─────────────────────────────────────────────
  { number: '0100', name: 'Konzessionen, gewerbliche Schutzrechte',     type: 'asset',     subtype: 'fixed_intangible', taxCode: '' },
  { number: '0140', name: 'Software',                                   type: 'asset',     subtype: 'fixed_intangible', taxCode: '' },
  { number: '0200', name: 'Grundstücke (unbebaute)',                    type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },
  { number: '0210', name: 'Grundstücke (bebaute)',                      type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },
  { number: '0400', name: 'Technische Anlagen und Maschinen',           type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },
  { number: '0410', name: 'Andere Anlagen, Betriebs- und Geschäftsausstattung', type: 'asset', subtype: 'fixed_tangible', taxCode: '' },
  { number: '0420', name: 'Kraftfahrzeuge',                             type: 'asset',     subtype: 'fixed_tangible',   taxCode: '' },

  // ── Klasse 1: Umlaufvermögen + Finanzverbindlichkeiten ───────────────────
  { number: '1000', name: 'Kasse',                                      type: 'asset',     subtype: 'cash',             taxCode: '' },
  { number: '1200', name: 'Guthaben bei Kreditinstituten (Bank)',       type: 'asset',     subtype: 'bank',             taxCode: '' },
  { number: '1300', name: 'Vorräte',                                    type: 'asset',     subtype: 'inventory',        taxCode: '' },
  { number: '1400', name: 'Forderungen aus Lieferungen und Leistungen', type: 'asset',     subtype: 'receivable',       taxCode: '' },
  { number: '1406', name: 'Abziehbare Vorsteuer 19%',                  type: 'asset',     subtype: 'vat',              taxCode: 'VST19' },
  { number: '1401', name: 'Abziehbare Vorsteuer 7%',                   type: 'asset',     subtype: 'vat',              taxCode: 'VST7' },
  { number: '1460', name: 'Aktive Rechnungsabgrenzungsposten',          type: 'asset',     subtype: 'accrual',          taxCode: '' },
  { number: '1500', name: 'Verbindlichkeiten ggü. Kreditinstituten (kurzfristig)', type: 'liability', subtype: 'bank_loan', taxCode: '' },
  { number: '1600', name: 'Erhaltene Anzahlungen',                      type: 'liability', subtype: 'advance',          taxCode: '' },
  { number: '1700', name: 'Verbindlichkeiten aus Lieferungen und Leistungen', type: 'liability', subtype: 'payable', taxCode: '' },
  { number: '1718', name: 'Umsatzsteuer 7%',                           type: 'liability', subtype: 'vat',              taxCode: 'UST7' },
  { number: '1741', name: 'Verbindlichkeiten aus Lohn und Gehalt',      type: 'liability', subtype: 'wages',            taxCode: '' },
  { number: '1770', name: 'Sonstige Verbindlichkeiten',                 type: 'liability', subtype: 'other',            taxCode: '' },
  { number: '1780', name: 'Passive Rechnungsabgrenzungsposten',         type: 'liability', subtype: 'deferral',         taxCode: '' },
  { number: '1800', name: 'Umsatzsteuer 19%',                          type: 'liability', subtype: 'vat',              taxCode: 'UST19' },

  // ── Klasse 2: Eigenkapital ───────────────────────────────────────────────
  { number: '2000', name: 'Gezeichnetes Kapital',                       type: 'equity',    subtype: 'share_capital',    taxCode: '' },
  { number: '2100', name: 'Kapitalrücklage',                            type: 'equity',    subtype: 'reserve',          taxCode: '' },
  { number: '2200', name: 'Gewinnrücklagen',                            type: 'equity',    subtype: 'retained',         taxCode: '' },
  { number: '2300', name: 'Gewinn-/Verlustvortrag',                     type: 'equity',    subtype: 'retained',         taxCode: '' },
  { number: '2400', name: 'Rückstellungen für Pensionen',               type: 'liability', subtype: 'provision',        taxCode: '' },
  { number: '2500', name: 'Steuerrückstellungen',                       type: 'liability', subtype: 'provision',        taxCode: '' },
  { number: '2600', name: 'Sonstige Rückstellungen',                    type: 'liability', subtype: 'provision',        taxCode: '' },
  { number: '2800', name: 'Verbindlichkeiten ggü. Kreditinstituten (langfristig)', type: 'liability', subtype: 'long_term_debt', taxCode: '' },

  // ── Klasse 4: Betriebliche Aufwendungen ─────────────────────────────────
  { number: '4000', name: 'Materialaufwand',                            type: 'expense',   subtype: 'cogs',             taxCode: '' },
  { number: '4100', name: 'Bezogene Waren',                             type: 'expense',   subtype: 'cogs',             taxCode: '' },
  { number: '4200', name: 'Bezogene Leistungen',                        type: 'expense',   subtype: 'cogs',             taxCode: '' },
  { number: '4300', name: 'Raumkosten (Miete)',                         type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4320', name: 'Energiekosten',                              type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4400', name: 'Versicherungen',                             type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4500', name: 'Werbekosten',                                type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4510', name: 'Reisekosten',                                type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4600', name: 'Bürokosten',                                 type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4610', name: 'Telefon, Porto',                             type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4700', name: 'Rechts- und Beratungskosten',                type: 'expense',   subtype: 'operating',        taxCode: '' },
  { number: '4800', name: 'Abschreibungen auf Sachanlagen',             type: 'expense',   subtype: 'depreciation',     taxCode: '' },
  { number: '4820', name: 'Sonstige betriebliche Aufwendungen',         type: 'expense',   subtype: 'other',            taxCode: '' },
  { number: '4900', name: 'Steuern vom Einkommen und Ertrag',           type: 'expense',   subtype: 'tax',              taxCode: '' },
  { number: '4910', name: 'Gewerbesteuer',                              type: 'expense',   subtype: 'tax',              taxCode: '' },

  // ── Klasse 6: Personal ──────────────────────────────────────────────────
  { number: '6000', name: 'Löhne',                                      type: 'expense',   subtype: 'personnel',        taxCode: '' },
  { number: '6010', name: 'Gehälter',                                   type: 'expense',   subtype: 'personnel',        taxCode: '' },
  { number: '6100', name: 'Gesetzliche soziale Aufwendungen',           type: 'expense',   subtype: 'personnel',        taxCode: '' },
  { number: '6200', name: 'Freiwillige soziale Aufwendungen',           type: 'expense',   subtype: 'personnel',        taxCode: '' },

  // ── Klasse 5: Zinsen ────────────────────────────────────────────────────
  { number: '7300', name: 'Zinsaufwendungen',                           type: 'expense',   subtype: 'financial',        taxCode: '' },
  { number: '7310', name: 'Bankgebühren',                               type: 'expense',   subtype: 'financial',        taxCode: '' },

  // ── Klasse 8: Umsatzerlöse ───────────────────────────────────────────────
  { number: '8000', name: 'Umsatzerlöse 19% (Inland)',                  type: 'revenue',   subtype: 'sales',            taxCode: 'UST19' },
  { number: '8100', name: 'Umsatzerlöse 7% (Inland)',                   type: 'revenue',   subtype: 'sales',            taxCode: 'UST7' },
  { number: '8120', name: 'Steuerfreie Umsätze',                        type: 'revenue',   subtype: 'sales',            taxCode: 'UST0' },
  { number: '8200', name: 'Sonstige betriebliche Erträge',              type: 'revenue',   subtype: 'other',            taxCode: '' },
  { number: '8400', name: 'Zinserträge',                                type: 'revenue',   subtype: 'financial',        taxCode: '' },

  // ── Abschluss ────────────────────────────────────────────────────────────
  { number: '9000', name: 'Eröffnungsbilanzkonto',                      type: 'equity',    subtype: 'closing',          taxCode: '' },
  { number: '9008', name: 'Gewinn- und Verlustkonto',                   type: 'equity',    subtype: 'closing',          taxCode: '' },
];
