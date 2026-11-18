# OrgX ERP

A full double-entry bookkeeping ERP system targeting German SMEs. Covers the complete accounting lifecycle — from journal entries and invoicing to payroll, ELSTER filings, and AI-powered management reporting.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7.x-47A248?logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Features

### Core Accounting
- **Double-entry bookkeeping** — every transaction balances debit = credit
- **SKR03 chart of accounts** — standard German account framework
- **GoBD compliance** — SHA-256 hash stamped on every journal entry and cash book record to detect tampering
- Automatic posting on invoice approval and payment recording (AR: 1400, AP: 1600, Bank: 1200)
- Fiscal year and accounting period management with period locking
- Accruals and prepayments with automatic reversal entries
- Intercompany cost centre allocation

### Invoicing & AR/AP
- Sales invoices (draft → approved → paid pipeline)
- Vendor invoices with GoBD-compliant PDF attachment storage
- Sales quotes → orders → invoices conversion flow
- Purchase orders with approval workflow
- Credit notes
- Automated dunning cycles (configurable intervals and escalation levels)
- Recurring invoice templates

### Tax & Compliance
- **ELSTER** — USt-Voranmeldung (VAT pre-registration) and annual declarations
- **DATEV CSV export** — full journal export compatible with DATEV Kanzlei-Rechnungswesen
- Multi-currency support with live FX rates and automatic EUR conversion
- HGB §257 10-year audit log (10-year TTL index)
- DSGVO Art. 17 (right to erasure) and Art. 20 (data portability)

### Payroll & HR
- Payroll runs with payslip PDF generation
- **SEPA XML direct-debit export** (pain.008.003.02)
- Employee management with contract types (full-time, part-time, Minijob)
- Absence and leave tracking
- **OrgX Event sync** — event timesheets from M2 flow into payroll automatically

### Banking
- Bank account management (IBAN, BIC)
- Bank statement import (CSV)
- Bank reconciliation workspace
- SEPA mandate management for direct debit runs

### Analytics (MIS)
- KPI dashboard: Revenue, Expenses, Net Margin, Cash Position
- Revenue vs. Expenses trend chart
- Invoice status breakdown
- Income Statement (P&L) with SKR03 account drill-down
- Budget vs. Actual variance report by cost centre
- **AI chatbot** (OpenAI) — ask natural-language questions about your financials

### Fixed Assets
- Asset register with depreciation schedules (straight-line)
- Automatic monthly depreciation journal entries
- Disposal flow with P&L impact posting

---

## Tech Stack

| Layer | Technology |
|---|---|
| **API** | Express.js 4, TypeScript, Zod validation |
| **Database** | MongoDB 7 + Mongoose 8 (all collections prefixed `m3_`) |
| **Auth** | JWT (access 15 min + HttpOnly refresh cookie) |
| **Frontend** | React 18, Vite, MUI v5, Zustand, React Query v5 |
| **i18n** | react-i18next (German + English; per-user language preference) |
| **PDF** | Puppeteer (invoices, payslips, asset register) |
| **Field encryption** | AES-256-GCM (`enc:<iv>:<authTag>:<ciphertext>` format) |
| **Integrity hashing** | SHA-256 canonical JSON (GoBD) |
| **AI** | OpenAI (intent-routed chatbot to minimise token usage) |
| **Monitoring** | Sentry |
| **Testing** | Vitest |

---

## Quick Start

### Prerequisites
- Node.js 20+
- MongoDB running at `mongodb://localhost:27017`

### Install & run
```bash
npm install
npm run dev
# Server: http://localhost:5002
# Client: http://localhost:3002
```

### Seed demo data
```bash
cd server

# 1. Base users + demo tenant (or reuse an existing M1/M2 demo tenant)
npx tsx src/scripts/seed.ts

# 2. Full ERP demo dataset (accounts, customers, invoices, journal entries…)
npx tsx src/scripts/seed_erp_data.ts

# Or wipe everything and do a full reseed in one step:
npx tsx src/scripts/seed_fresh.ts
```

Default seed credentials (override with env vars):

| Account | Email | Password env var |
|---|---|---|
| ERP Admin | `admin@erp.demo` | `SEED_ERP_PASSWORD` |
| Accountant | `buchhalter@erp.demo` | `SEED_ERP_PASSWORD` |
| Viewer | `viewer@erp.demo` | `SEED_ERP_PASSWORD` |
| Tax Advisor | `steuerberater@erp.demo` | `SEED_ERP_PASSWORD` |
| Employee (POS) | `kassierer@erp.demo` | `SEED_KASSE_PASSWORD` |

---

## Configuration

Copy `server/.env.example` to `server/.env`:

```bash
cp server/.env.example server/.env
```

Key variables:

| Variable | Description | Required in prod |
|---|---|---|
| `JWT_ACCESS_SECRET` | 64-char random string | ✅ |
| `JWT_REFRESH_SECRET` | 64-char random string | ✅ |
| `MONGODB_URI` | MongoDB connection string | ✅ |
| `FIELD_ENCRYPTION_KEY` | 64-char hex string (`openssl rand -hex 32`) | ✅ |
| `CLIENT_URL` | Frontend origin (CORS) | ✅ |
| `OPENAI_API_KEY` | OpenAI key for MIS chatbot | optional |
| `SMTP_HOST` | SMTP server (blank → console) | optional |
| `SENTRY_DSN` | Sentry error tracking | optional |

Generate secrets:
```bash
openssl rand -hex 32   # for JWT secrets and FIELD_ENCRYPTION_KEY
```

---

## Project Structure

```
m3/
├── client/          # React + Vite frontend
│   └── src/
│       ├── api/     # Axios API clients
│       ├── pages/   # Route-level page components
│       │   └── erp/ # All ERP pages under /erp/
│       ├── stores/  # Zustand state
│       └── i18n/    # de.json / en.json
└── server/          # Express API
    └── src/
        ├── config/  # env.ts, db.ts
        ├── middleware/  # auth, rbac, tenant, upload, requireOpenPeriod
        ├── models/  # JournalEntry, SalesInvoice, Payroll, Employee…
        ├── routes/  # Express routers (all prefixed /api/)
        ├── utils/   # autoPost, crypto (AES+GoBD), pdf, email, recurringCron
        └── scripts/ # seed, seed_erp_data, seed_fresh, seed_customers…
```

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Esc` | Navigate back |
| `Tab` | Move to next invoice line item |

---

## Testing

```bash
npm test               # run all tests once
npm run test:watch     # watch mode
```

---

## GoBD Note

All `JournalEntry` and `CashBookEntry` documents are stamped with a SHA-256 hash of their canonical JSON representation at creation time. Any tampering with the stored document will cause the hash to no longer match. This is required for GoBD-compliant accounting software in Germany.

---

## License

MIT
