import type { ISalesInvoice } from '../models/SalesInvoice';
import type { ICompanySettings } from '../models/CompanySettings';
import type { IBankAccount } from '../models/BankAccount';

function cents(n: number): string {
  return (n / 100).toFixed(2);
}

function yyyymmdd(d: Date | string): string {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// UN/ECE Recommendation 20 unit codes
const UNIT_MAP: Record<string, string> = {
  stück: 'C62', stk: 'C62', 'stk.': 'C62', pc: 'C62', pcs: 'C62', 'stück.': 'C62',
  stunde: 'HUR', std: 'HUR', 'std.': 'HUR', h: 'HUR', hr: 'HUR', hour: 'HUR', hours: 'HUR',
  tag: 'DAY', tage: 'DAY', day: 'DAY', days: 'DAY',
  monat: 'MON', month: 'MON',
  jahr: 'ANN', year: 'ANN',
  km: 'KMT',
  'm²': 'MTK', m2: 'MTK', qm: 'MTK',
  m: 'MTR', meter: 'MTR',
  kg: 'KGM',
  liter: 'LTR', l: 'LTR',
  pauschal: 'C62', pausch: 'C62', lst: 'C62', 'ls.': 'C62', ls: 'C62',
};

function unitCode(unit: string): string {
  return UNIT_MAP[unit.toLowerCase().trim()] ?? 'C62';
}

function vatCategoryCode(rate: number): string {
  return rate === 0 ? 'Z' : 'S';
}

function esc(s: string | undefined | null): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtQty(n: number): string {
  // Remove trailing zeros but keep at least one decimal if needed
  const s = n.toFixed(4);
  return s.replace(/\.?0+$/, '') || '0';
}

export function buildXRechnungXml(
  invoice: ISalesInvoice,
  company: ICompanySettings | null,
  bank: IBankAccount | null,
): string {
  // Group VAT by rate for the header tax summary (BG-23)
  const vatGroups = new Map<number, { basis: number; tax: number }>();
  for (const l of invoice.lineItems) {
    const g = vatGroups.get(l.vatRate) ?? { basis: 0, tax: 0 };
    g.basis += l.totalNetCents;
    g.tax   += l.totalVatCents;
    vatGroups.set(l.vatRate, g);
  }

  const snap      = invoice.customerSnapshot;
  const coBase    = company?.companyName ?? '';
  const coLegal   = company?.legalForm ?? '';
  const coName    = (coBase && coLegal && !coBase.endsWith(coLegal))
    ? `${coBase} ${coLegal}`.trim()
    : coBase.trim() || 'Unbekannt';
  const coAddr    = company?.address ?? { street: '', zip: '', city: '', country: 'DE' };
  const snapLegal = snap.legalForm ?? '';
  const buyerName = (snap.companyName && snapLegal && !snap.companyName.endsWith(snapLegal))
    ? `${snap.companyName} ${snapLegal}`.trim()
    : snap.companyName.trim();

  // BG-25: Line items
  const lineItemsXml = invoice.lineItems.map((l, i) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(l.itemName || l.description || `Position ${i + 1}`)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${cents(l.unitPriceCents)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCode(l.unit)}">${fmtQty(l.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${vatCategoryCode(l.vatRate)}</ram:CategoryCode>
          <ram:RateApplicablePercent>${l.vatRate.toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${cents(l.totalNetCents)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('');

  // BG-23: Tax summaries per VAT rate
  const vatSummariesXml = [...vatGroups.entries()].map(([rate, { basis, tax }]) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${cents(tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${cents(basis)}</ram:BasisAmount>
        <ram:CategoryCode>${vatCategoryCode(rate)}</ram:CategoryCode>
        <ram:RateApplicablePercent>${rate.toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`).join('');

  // BG-16: Payment means — 58 = SEPA credit transfer
  const paymentMeansXml = bank
    ? `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(bank.iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>${bank.bic ? `
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${esc(bank.bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>`
    : `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>1</ram:TypeCode>
      </ram:SpecifiedTradeSettlementPaymentMeans>`;

  // Seller VAT/tax registration (VA = EU VAT ID, FC = Steuernummer)
  const sellerTaxXml = company?.vatId
    ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(company.vatId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>`
    : company?.steuernummer
    ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${esc(company.steuernummer)}</ram:ID>
        </ram:SpecifiedTaxRegistration>`
    : '';

  const buyerTaxXml = snap.vatId
    ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(snap.vatId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>`
    : '';

  const duePayable = invoice.totalGrossCents - invoice.paidCents;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <!-- BT-24: Specification identifier (XRechnung 3.0 / EN 16931) -->
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <!-- BT-1/BT-2/BT-3: Invoice header -->
  <rsm:ExchangedDocument>
    <ram:ID>${esc(invoice.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${yyyymmdd(invoice.invoiceDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    ${lineItemsXml}

    <!-- BG-4: Seller / BG-7: Buyer -->
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(coName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(coAddr.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(coAddr.street)}</ram:LineOne>
          <ram:CityName>${esc(coAddr.city)}</ram:CityName>
          <ram:CountryID>${esc(coAddr.country || 'DE')}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${sellerTaxXml}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(buyerName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(snap.address.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(snap.address.street)}</ram:LineOne>
          <ram:CityName>${esc(snap.address.city)}</ram:CityName>
          <ram:CountryID>${esc(snap.address.country || 'DE')}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${buyerTaxXml}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery/>

    <!-- BG-17: Settlement -->
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(invoice.invoiceNumber)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${paymentMeansXml}
      ${vatSummariesXml}
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${yyyymmdd(invoice.dueDate)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <!-- BG-22: Document totals -->
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${cents(invoice.totalNetCents)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${cents(invoice.totalNetCents)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${cents(invoice.totalVatCents)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${cents(invoice.totalGrossCents)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${cents(duePayable)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
