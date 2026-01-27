$TOKEN = "rnd_sJ7D1OCrSzgiVnwgwf1jl9DZ2opT"
$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type"  = "application/json"
}
$SERVICE_ID = "srv-d5s7gdnpm1nc73cn3k7g"

Write-Host "Fetching current service details..."
try {
    $service = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$SERVICE_ID" -Method Get -Headers $headers
    
    # Prepare environment variables
    $envVars = $service.envVars
    $hasCacheDir = $false
    foreach ($ev in $envVars) {
        if ($ev.key -eq "PUPPETEER_CACHE_DIR") {
            $ev.value = "/opt/render/.cache/puppeteer"
            $hasCacheDir = $true
            break
        }
    }
    if (-not $hasCacheDir) {
        $envVars += @{ key = "PUPPETEER_CACHE_DIR"; value = "/opt/render/.cache/puppeteer" }
    }

    # Prepare PATCH body
    $body = @{
        serviceDetails = @{
            envSpecificDetails = @{
                buildCommand = "npm run build"
            }
        }
        envVars        = $envVars
    } | ConvertTo-Json -Depth 10

    Write-Host "Updating service $SERVICE_ID..."
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$SERVICE_ID" -Method Patch -Headers $headers -Body $body
    Write-Host "Service updated successfully!"
    $response | ConvertTo-Json
}
catch {
    Write-Error "Failed to update service: $_"
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)"
    }
}
