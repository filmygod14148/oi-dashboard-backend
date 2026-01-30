$TOKEN = "rnd_sJ7D1OCrSzgiVnwgwf1jl9DZ2opT"
$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type"  = "application/json"
}
$SERVICE_ID = "srv-d5s7gdnpm1nc73cn3k7g"

Write-Host "Switching service $SERVICE_ID to Docker..."
try {
    # Prepare PATCH body
    $body = @{
        env = "docker"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$SERVICE_ID" -Method Patch -Headers $headers -Body $body
    Write-Host "Service switched to Docker successfully!"
    $response | ConvertTo-Json
}
catch {
    Write-Error "Failed to update service: $_"
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)"
    }
}
