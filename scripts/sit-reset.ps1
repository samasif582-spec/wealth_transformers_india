# Wealth Transformers India Pvt Ltd — Reset SIT Environment
Write-Host "🔄 Resetting Wealth Transformers WhatsApp SIT State..." -ForegroundColor Yellow

$response = Invoke-RestMethod -Uri "http://localhost:4010/admin/scenarios/reset" -Method Post
Write-Host "✅ SIT State Reset:" -ForegroundColor Green
Write-Host ($response | ConvertTo-Json)
