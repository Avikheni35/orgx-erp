#!/usr/bin/env bash
# Seed the M3 database with demo data.
# Requires MongoDB running at localhost:27017.
set -e

echo "Seeding M3 — ERP..."
cd "$(dirname "$0")/.."

echo "1/3 Creating users and tenant..."
npx tsx server/src/scripts/seed.ts

echo "2/3 Seeding ERP data (accounts, invoices, journal entries)..."
npx tsx server/src/scripts/seed_erp_data.ts

echo "3/3 Done. Login credentials:"
echo "  ERP Admin  : admin@erp.demo       / \$SEED_ERP_PASSWORD"
echo "  Accountant : buchhalter@erp.demo  / \$SEED_ERP_PASSWORD"
echo "  Employee   : kassierer@erp.demo   / \$SEED_KASSE_PASSWORD"
