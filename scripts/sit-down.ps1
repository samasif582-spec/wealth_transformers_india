# Wealth Transformers India Pvt Ltd — Teardown SIT Environment
Write-Host "🛑 Tearing down Wealth Transformers SIT standalone containers..." -ForegroundColor Yellow
docker compose -f docker-compose.sit.yml down -v
Write-Host "✅ SIT environment stopped." -ForegroundColor Green
