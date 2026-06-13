$ErrorActionPreference = 'Stop'
function Run-Stage($name, $cmd) {
  Write-Host "=== Stage: $name ===" -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "Stage $name failed" }
}
Run-Stage 'lint'        { pnpm lint }
Run-Stage 'type-check'  { pnpm type-check }
Run-Stage 'test'        { pnpm test }
Run-Stage 'coverage'    { pnpm test:coverage }
Run-Stage 'build'       { pnpm build }
Write-Host "All stages passed. (E2E skipped - run 'pnpm test:e2e' manually.)" -ForegroundColor Green