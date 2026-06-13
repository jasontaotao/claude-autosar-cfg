#!/usr/bin/env bash
set -euo pipefail
echo "=== Stage: lint ==="; pnpm lint
echo "=== Stage: type-check ==="; pnpm type-check
echo "=== Stage: test ==="; pnpm test
echo "=== Stage: coverage ==="; pnpm test:coverage
echo "=== Stage: build ==="; pnpm build
echo "All stages passed. (E2E skipped — run 'pnpm test:e2e' manually.)"