# Wealth Transformers India Pvt Ltd — Run Complete SIT Test Suite
Write-Host "🧪 Running WT-SIT-SERVICE-VIRTUALIZATION-001 Test Suite (SIT-001 through SIT-024)..." -ForegroundColor Cyan

npx jest --config tests/jest.config.ts tests/sit/sit-suite.spec.ts --runInBand --verbose
