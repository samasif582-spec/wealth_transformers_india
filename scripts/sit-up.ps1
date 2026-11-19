# Wealth Transformers India Pvt Ltd — Launch SIT Environment
Write-Host "🚀 Starting Wealth Transformers WhatsApp SIT Environment..." -ForegroundColor Cyan

# 1. Start Virtual Meta Server & Client Emulator
Write-Host "📦 Starting Mock WhatsApp Server (Port 4010) and Client Emulator (Port 4020)..." -ForegroundColor Yellow
Start-Process npm -ArgumentList "run dev:mock" -NoNewWindow
Start-Process npm -ArgumentList "run dev:emulator" -NoNewWindow

Start-Sleep -Seconds 3

# 2. Seed Initial State
Write-Host "🌱 Seeding initial SIT virtual tenants and approved templates..." -ForegroundColor Green
Invoke-RestMethod -Uri "http://localhost:4010/admin/scenarios/seed" -Method Post | Format-Table

Write-Host "✅ SIT Environment is ONLINE:" -ForegroundColor Green
Write-Host "   - Mock WhatsApp Cloud API Server: http://localhost:4010" -ForegroundColor White
Write-Host "   - Multi-Tenant Client Emulator:    http://localhost:4020" -ForegroundColor White
Write-Host "   - SUT Backend (API):              http://localhost:3000/api/v1" -ForegroundColor White
Write-Host "   - SUT Frontend:                   http://localhost:5173" -ForegroundColor White
