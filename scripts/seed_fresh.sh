#!/usr/bin/env bash
# Wipe the M3 database and do a full reseed from scratch.
# WARNING: This deletes all existing M3 data.
set -e

echo "WARNING: This will wipe all M3 data and reseed from scratch."
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

cd "$(dirname "$0")/.."
echo "Running full reseed..."
npx tsx server/src/scripts/seed_fresh.ts
echo "Done."
