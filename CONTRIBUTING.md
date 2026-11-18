# Contributing to OrgX ERP

## Development Setup

### Prerequisites
- Node.js 20+
- MongoDB running at `mongodb://localhost:27017`

### Install
```bash
npm install
```

### Run in development mode
```bash
npm run dev
# Server: http://localhost:5002
# Client: http://localhost:3002
```

### Seed demo data
```bash
cd server
npx tsx src/scripts/seed.ts           # users + tenant
npx tsx src/scripts/seed_erp_data.ts  # accounts, invoices, journal entries
# Or: full wipe + reseed in one step:
npx tsx src/scripts/seed_fresh.ts
```

---

## Project Structure

```
client/   React + Vite frontend (port 3002)
server/   Express API           (port 5002)
```

All MongoDB collections are prefixed `m3_` to avoid conflicts on the shared database.

---

## Running Tests

```bash
npm test               # run once
npm run test:watch     # watch mode
```

Tests cover: double-entry autoposting, period guards, AES-256-GCM encryption, GoBD hashing, FX conversion, inventory lifecycle, and MIS intent routing.

---

## TypeScript

```bash
npm run build -w server      # check server types
npm run typecheck -w client  # check client types
```

Both must pass with zero errors before submitting a PR.

---

## Code Style

- TypeScript strict mode throughout
- Zod schemas for all request body validation
- All UI strings go in `client/src/i18n/de.json`, then `en.json`
- SKR03 account numbers are hardcoded constants in `server/src/utils/autoPost.ts` — changes there must maintain GoBD compliance
- Never bypass `requireOpenPeriod` middleware on write routes

---

## Submitting a Pull Request

1. Fork the repo and create a branch from `master`
2. Make your changes with focused, atomic commits
3. Ensure `npm test` and both typecheck commands pass
4. Open a PR with a clear description of what and why

---

## Reporting Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) issue template.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
