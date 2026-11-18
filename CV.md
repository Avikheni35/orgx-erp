# OrgX ERP — Project Summary for CV

## Project Title
**Full-Stack ERP System for German SMEs** — Built from scratch as Module 3 of a multi-tenant B2B SaaS platform

## Tech Stack
TypeScript · Node.js · Express.js · React 18 · Vite · MongoDB · Mongoose · MUI v5 · React Query v5 · Zustand · Zod · Vitest · Docker · GitHub Actions · OpenAI API

---

## Key Numbers

| Metric | Count |
|--------|-------|
| API endpoint handlers | 282 |
| Route files | 47 |
| React pages | 126 |
| Mongoose models | 45 |
| TypeScript files | 325 |
| Lines of TypeScript | 51,568 |
| Vitest tests | 101 (7 test files, all passing) |
| Seed scripts | 7 |
| Seeded demo users | 5 (admin, accountant, viewer, tax advisor, POS employee) |

---

## What Was Built

### Accounting Core
- Full **double-entry bookkeeping** engine with SKR03 chart of accounts
- Auto-posting engine (`autoPost.ts`): every sales invoice approval and payment automatically generates balanced journal entries mapped to SKR03 accounts (AR: 1400, AP: 1600, Bank: 1200, Revenue: 8400)
- **Fiscal year and period management** with period lock guards — rejects write requests when target period is `locked` or `closed`
- **GoBD compliance**: SHA-256 canonical hash stamped on every `JournalEntry` and `CashBookEntry` to detect tampering

### Modules
- Sales: Quotes → Orders → Invoices → Credit Notes (full lifecycle)
- Purchasing: Vendor Invoices with PDF attachment storage (GoBD-compliant)
- Payroll: gross/net calculation, payslip PDF generation, SKR03 auto-posting on approval
- Cash Book: daily cash entries, bank statement CSV import
- Bank Accounts: multi-account management, bank reconciliation
- Fixed Assets: asset register, depreciation runs, disposal with journal posting
- Accruals: post and auto-reverse on period boundary
- Cost Centers: budget allocation, variance reporting

### Compliance & Reporting
- **ELSTER filing preparation** (German tax authority XML format)
- **SEPA Direct Debit XML export** (pain.008 format)
- **Multi-currency**: FX rate model, automatic EUR conversion on journal posting
- Dunning cron: auto-escalates overdue vendor invoices on a schedule
- Budget vs. actual variance report per cost center
- Open items reports (debtors and creditors)
- GuV (Profit & Loss) and balance sheet reports

### Roles & Access Control
- 5 roles: `erp_admin`, `erp_accountant`, `erp_viewer`, `erp_employee`, `erp_tax_advisor`
- Tax advisor role: read-only access to journal, payroll, and ELSTER data
- POS/Ops employee role: restricted to Ops Shell (sales terminal, cash, stock, day book)
- All routes protected by JWT auth + RBAC middleware

### MIS / AI Chatbot
- Executive analytics dashboard with KPI tiles and trend charts
- OpenAI (gpt-4o-mini) chatbot with **14 intent classifiers** via regex router (reduces token usage vs. raw NL routing)
- Privacy-safe aggregations: AR/AP aging buckets, payroll cost by cost center, cash position, budget vs. actual — no PII passed to AI context
- Intent cascade rules: `weekly` → implies `sales`; `promotion` → implies `sales + inventory`; `ar_aging` / `ap_aging` / `payroll_cost` → implies `financial`

### Ops Shell (POS Terminal)
- Point-of-sale sales terminal for `erp_employee` role
- Cash register with daily open/close
- Stock view and day book
- Sales auto-post negative `SalesInvoice` for returns

### Internationalization
- Full German/English bilingual support (`react-i18next`)
- Per-user language preference stored on `User` document
- Language switcher in sidebar + dedicated settings route `/erp/einstellungen/sprache`

### Field Encryption & Security
- AES-256-GCM field-level encryption (`enc:<iv>:<authTag>:<ciphertext>`) for sensitive fields
- `enc:` prefix guard prevents double-encryption
- No-op in development when `FIELD_ENCRYPTION_KEY` is absent; enforced in production (64-char hex key)

### DevOps
- Dockerised: `m3-server`, `m3-web`, `m3-seed` containers in `docker-compose.yml`
- GitHub Actions CI: TypeScript check + Vitest on every push
- Sentry error tracking wired to Express error handler and React error boundary
- 10-year TTL index on audit logs (HGB §257 retention requirement)
- 90-day TTL auto-delete on in-app notifications

---

## CV Bullet Points (ready to copy)

- Built a production-grade double-entry ERP from scratch: 282 REST endpoints, 126 React pages, 45 Mongoose models, 51,500+ lines of TypeScript
- Implemented SKR03-mapped auto-posting engine that automatically generates balanced journal entries on invoice approval and payment recording
- Delivered GoBD-compliant audit trail with SHA-256 canonical hashing on every journal and cash book entry, satisfying German HGB §257 retention requirements
- Built ELSTER tax filing preparation, SEPA direct debit XML export, multi-currency FX conversion, and period lock guards for closed accounting periods
- Integrated OpenAI gpt-4o-mini MIS chatbot with 14 regex-based intent classifiers; privacy-safe aggregation design ensures no PII reaches the AI context
- Wrote 101 Vitest unit tests covering auto-posting logic, GoBD crypto, FX conversion, period guards, intent classification, and inventory lifecycle
- Configured Docker Compose and GitHub Actions CI; added Sentry error tracking with structured capture across server and client

---

## Repository Structure

```
m3/
├── server/
│   ├── src/
│   │   ├── models/        # 45 Mongoose models (m3_ collection prefix)
│   │   ├── routes/        # 47 Express route files
│   │   ├── services/      # Business logic layer
│   │   ├── middleware/    # Auth, RBAC, period guard, tenant resolver
│   │   ├── utils/         # crypto (AES-256-GCM + GoBD), autoPost, pdf
│   │   ├── jobs/          # Dunning cron, outbox retry
│   │   ├── scripts/       # 7 seed scripts
│   │   └── __tests__/     # 101 Vitest tests (7 files)
│   └── Dockerfile
└── client/
    ├── src/
    │   ├── pages/         # 126 React pages
    │   ├── components/    # Shared UI components
    │   ├── api/           # Axios client + typed API functions
    │   ├── stores/        # Zustand auth store
    │   └── i18n/          # de.json + en.json locale files
    └── Dockerfile
```
