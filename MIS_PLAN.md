# M3 ERP — MIS (Management Information System) Plan

## Overview

MIS is an executive-facing analytics layer inside M3, complementing the existing accounting reports (BWA, Bilanz, USt, SuSa). The distinction:

| Accounting Reports (existing) | MIS (new) |
|---|---|
| Precise, audit-ready tables | Visual charts and KPI tiles |
| For accountants / tax advisors | For business owner / manager |
| Point-in-time snapshots | Trends over time |
| Drill-down to individual entries | High-level aggregates with comparisons |

Route prefix: `/erp/mis`  
Server prefix: `/api/erp/mis`  
New server file: `m3/server/src/routes/mis.ts`  
New client pages: `m3/client/src/pages/erp/mis/`

---

## Data Sources (all existing M3 models)

| Data | Model | Collection |
|---|---|---|
| Sales revenue | `SalesInvoice` | `m3_sales_invoices` |
| Purchase costs | `VendorInvoice` | `m3_vendor_invoices` |
| Cash in/out | `CashBookEntry` | `m3_cashbook_entries` |
| Payroll costs | `Payroll` | `m3_payrolls` |
| Account balances | `JournalEntry` | `m3_journal_entries` |
| VAT | `JournalEntry` lines on 1776/1576 | `m3_journal_entries` |
| Customers | `Customer` + SalesInvoice snapshot | — |
| Suppliers | `Supplier` + VendorInvoice snapshot | — |

---

## Server — `m3/server/src/routes/mis.ts`

All routes: `requireAuth`, `requireRole('erp_admin', 'erp_accountant', 'erp_viewer')`  
All queries scoped to `tenantId: req.tenantId`

### Endpoints

#### `GET /mis/summary?year=YYYY`
Main dashboard KPIs for a given year (defaults to current year).

Aggregates from multiple models in parallel:
- `revenueYTD` — SalesInvoice (status `sent`|`paid`), sum of `totalGrossCents` where `invoiceDate` in year
- `expensesYTD` — VendorInvoice (status `approved`|`paid`), sum of `totalGrossCents` where `invoiceDate` in year
- `netResultYTD` — revenueYTD − expensesYTD
- `cashBalance` — CashBookEntry: sum receipts − sum payments (all time, account 1000+1200 style — or just all cashbook entries)
- `openAR` — SalesInvoice where status `sent`, sum `totalGrossCents − paidCents`
- `openAP` — VendorInvoice where status `approved`, sum `totalGrossCents − paidCents`
- `overdueARCount` — SalesInvoice where status `sent` and `dueDate < today`
- `overdueARAmount` — same, sum of outstanding
- `payrollYTD` — Payroll (status `posted`), where year matches, sum `totalGrossCents`
- `payrollRatio` — payrollYTD / revenueYTD × 100 (%)
- `invoiceDraftCount`, `invoiceSentCount`, `invoicePaidCount`, `invoiceCancelledCount` — SalesInvoice counts by status

Response:
```json
{
  "year": 2026,
  "revenueYTD": 125000.00,
  "expensesYTD": 87500.00,
  "netResultYTD": 37500.00,
  "cashBalance": 42000.00,
  "openAR": 18500.00,
  "openAP": 9200.00,
  "overdueARCount": 3,
  "overdueARAmount": 4500.00,
  "payrollYTD": 48000.00,
  "payrollRatio": 38.4,
  "invoiceStatusCounts": { "draft": 2, "sent": 8, "paid": 47, "cancelled": 1 }
}
```

---

#### `GET /mis/revenue/monthly?year=YYYY`
Monthly revenue for the year from SalesInvoice (status `sent`|`paid`).

Group by `invoiceDate` month. Return 12 months (fill 0 for months with no data).

```json
{
  "year": 2026,
  "months": [
    { "month": 1, "label": "Jan", "grossCents": 950000, "count": 5 },
    { "month": 2, "label": "Feb", "grossCents": 1120000, "count": 7 },
    ...
  ]
}
```

---

#### `GET /mis/expenses/monthly?year=YYYY`
Monthly purchase/expense costs from VendorInvoice (status `approved`|`paid`).

Same structure as revenue/monthly.

---

#### `GET /mis/cashflow/monthly?year=YYYY`
Monthly cash in vs cash out from CashBookEntry.

Group by `date` month, split by `type` (receipt vs payment).

```json
{
  "year": 2026,
  "months": [
    { "month": 1, "label": "Jan", "receiptsCents": 800000, "paymentsCents": 620000, "netCents": 180000 },
    ...
  ]
}
```

---

#### `GET /mis/payroll/monthly?year=YYYY`
Monthly payroll cost from Payroll (status `posted`), group by `month` field.

```json
{
  "year": 2026,
  "months": [
    { "month": 1, "label": "Jan", "grossCents": 420000, "netCents": 310000, "employeeCount": 4 },
    ...
  ]
}
```

---

#### `GET /mis/customers/top?year=YYYY&limit=10`
Top N customers by invoiced revenue in the year.

From SalesInvoice (status `sent`|`paid`), group by `customerId`, sum `totalGrossCents`, join with `customerSnapshot.companyName`.

```json
{
  "customers": [
    { "customerId": "...", "companyName": "Müller GmbH", "totalGrossCents": 3200000, "invoiceCount": 12 },
    ...
  ]
}
```

---

#### `GET /mis/suppliers/top?year=YYYY&limit=10`
Top N suppliers by purchase spend in the year.

From VendorInvoice (status `approved`|`paid`), group by `supplierId`.

Same structure as customers/top.

---

#### `GET /mis/vat/monthly?year=YYYY`
Monthly VAT collected (Umsatzsteuer, account `1776`) vs VAT paid (Vorsteuer, account `1576`).

From JournalEntry lines, filter by accountNumber, group by date month.

```json
{
  "year": 2026,
  "months": [
    { "month": 1, "label": "Jan", "ustCents": 95000, "vstCents": 42000, "netVatCents": 53000 },
    ...
  ]
}
```

---

#### `GET /mis/profit/monthly?year=YYYY`
Combined revenue vs expenses vs net result by month (for the trend chart).

Merges revenue/monthly and expenses/monthly data.

```json
{
  "year": 2026,
  "months": [
    { "month": 1, "label": "Jan", "revenueCents": 950000, "expensesCents": 720000, "netCents": 230000 },
    ...
  ]
}
```

---

## Client — Pages

### Layout changes
Add a **MIS** section in `m3/client/src/layouts/ErpLayout.tsx` sidebar, above or below "Berichte". Use an icon like `AnalyticsIcon` or `DashboardIcon`. Nav entries:
- Übersicht → `/erp/mis`
- Umsatz → `/erp/mis/umsatz`
- Kosten → `/erp/mis/kosten`
- Cashflow → `/erp/mis/cashflow`
- Lohnkosten → `/erp/mis/lohn`
- Steuer → `/erp/mis/steuer`

---

### Page 1: MIS Dashboard (`/erp/mis`) — `MISDashboardPage.tsx`

**Year selector** at top right (default current year).

**Row 1 — KPI tiles (6 tiles):**
- Umsatz (Revenue YTD) — with % change vs last year
- Aufwände (Expenses YTD)
- Ergebnis (Net Result YTD) — green if positive, red if negative
- Kassenbestand (Cash Balance)
- Offene Forderungen (Open AR)
- Überfällig (Overdue AR) — red if > 0

**Row 2 — Charts:**
- Left (60%): Revenue vs Expenses bar chart by month (grouped bars, 12 months)
- Right (40%): Invoice status donut chart (draft/sent/paid/cancelled)

**Row 3:**
- Left (50%): Top 5 customers table (company name, revenue, invoice count)
- Right (50%): Payroll cost bar chart by month

All data from `GET /mis/summary` + `GET /mis/revenue/monthly` + `GET /mis/payroll/monthly`.

---

### Page 2: Revenue Analytics (`/erp/mis/umsatz`) — `MISRevenuePage.tsx`

- Monthly revenue bar chart (full year)
- Revenue this year vs last year line comparison
- Top 10 customers table with: company name, total revenue, invoice count, avg invoice value, last invoice date
- Invoice status breakdown (counts + amounts)

Data: `GET /mis/revenue/monthly?year=N` + `GET /mis/revenue/monthly?year=N-1` + `GET /mis/customers/top`

---

### Page 3: Cost Analytics (`/erp/mis/kosten`) — `MISCostPage.tsx`

- Monthly expenses bar chart
- Expenses this year vs last year
- Top 10 suppliers table (company name, total spend, invoice count)
- Expense trend as % of revenue (line chart)

Data: `GET /mis/expenses/monthly` + `GET /mis/suppliers/top`

---

### Page 4: Cash Flow (`/erp/mis/cashflow`) — `MISCashflowPage.tsx`

- Grouped bar chart: monthly receipts (green) vs payments (red)
- Net cash flow line chart overlay
- Running cash balance area chart (cumulative)
- Summary: total in, total out, net for the year

Data: `GET /mis/cashflow/monthly`

---

### Page 5: Payroll Analytics (`/erp/mis/lohn`) — `MISPayrollPage.tsx`

- Monthly payroll gross cost bar chart
- Payroll cost as % of revenue line (uses both `/mis/payroll/monthly` and `/mis/revenue/monthly`)
- Gross vs net vs deductions stacked bar chart by month
- YTD summary: total gross, total net, total tax+SV

Data: `GET /mis/payroll/monthly` + `GET /mis/revenue/monthly`

---

### Page 6: VAT / Tax Overview (`/erp/mis/steuer`) — `MISTaxPage.tsx`

- Monthly USt (collected) vs VSt (paid) grouped bars
- Net VAT payable line
- YTD summary: total USt, total VSt, net payable
- Trend of net VAT liability across months

Data: `GET /mis/vat/monthly`

---

## Charts — Implementation Approach

Use **inline SVG** (already used in `CashBookReportPage`) — no new dependencies.

Standard chart components to build once and reuse:
- `BarChart` — grouped or single, with hover tooltips
- `LineChart` — with data points and area fill
- `DonutChart` — for status distributions

Keep consistent: same colors, same axes formatting, same tooltip style across all MIS pages.

Color convention:
- Revenue / receipts: `#2e7d32` (green)
- Expenses / payments: `#c62828` (red)
- Net result (positive): `#1565c0` (blue)
- Net result (negative): `#c62828` (red)
- Payroll: `#6a1b9a` (purple)
- Neutral: `#546e7a` (blue-grey)

---

## API Client — `m3/client/src/api/mis.ts`

```typescript
export const misApi = {
  summary:         (year: number) => apiClient.get<MISSummary>(`/mis/summary?year=${year}`),
  revenueMonthly:  (year: number) => apiClient.get<MonthlyData>(`/mis/revenue/monthly?year=${year}`),
  expensesMonthly: (year: number) => apiClient.get<MonthlyData>(`/mis/expenses/monthly?year=${year}`),
  cashflowMonthly: (year: number) => apiClient.get<CashflowData>(`/mis/cashflow/monthly?year=${year}`),
  payrollMonthly:  (year: number) => apiClient.get<PayrollMonthly>(`/mis/payroll/monthly?year=${year}`),
  topCustomers:    (year: number, limit = 10) => apiClient.get<TopCustomers>(`/mis/customers/top?year=${year}&limit=${limit}`),
  topSuppliers:    (year: number, limit = 10) => apiClient.get<TopSuppliers>(`/mis/suppliers/top?year=${year}&limit=${limit}`),
  vatMonthly:      (year: number) => apiClient.get<VatMonthly>(`/mis/vat/monthly?year=${year}`),
  profitMonthly:   (year: number) => apiClient.get<ProfitMonthly>(`/mis/profit/monthly?year=${year}`),
};
```

---

## Wiring

### Server
- Add `import misRoutes from './mis'` in `m3/server/src/routes/index.ts`
- Register: `router.use('/mis', misRoutes)`

### Client
- Add `import` + 6 routes in `m3/client/src/App.tsx` under `/erp/mis/*`
- Add MIS nav section in `m3/client/src/layouts/ErpLayout.tsx`
- Add i18n keys in `de.json` and `en.json` for all new strings

---

## Build Order

1. Server route `mis.ts` — all 9 endpoints (pure aggregation, no model changes)
2. `mis.ts` registered in `routes/index.ts`
3. Client API `mis.ts`
4. Reusable chart components (BarChart, LineChart, DonutChart SVG)
5. `MISDashboardPage` (most important — builds first)
6. `MISRevenuePage`
7. `MISCostPage`
8. `MISCashflowPage`
9. `MISPayrollPage`
10. `MISTaxPage`
11. ErpLayout nav entries + App.tsx routing
12. i18n keys
13. TypeScript check on both client and server

---

## What This Does NOT Include (by design)

- Fixed assets depreciation tracking (different module)
- Cost center analytics (requires cost center assignments on journal lines)
- Budget vs actual (no budget model exists)
- M1/M2 cross-service data
- Recurring transactions
- Document attachments
