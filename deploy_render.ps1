$TOKEN = "rnd_sJ7D1OCrSzgiVnwgwf1jl9DZ2opT"
$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type"  = "application/json"
}

# 1. Get Owner ID
Write-Host "Fetching Owner ID..."
try {
    $owners = Invoke-RestMethod -Uri "https://api.render.com/v1/owners" -Method Get -Headers $headers
    $ownerId = $owners[0].owner.id
    Write-Host "Owner ID: $ownerId"
} catch {
    Write-Error "Failed to fetch owners: $_"
    exit 1
}

# 2. Get MongoDB URI from .env
$envFile = "d:\Trae AI\mongo db\oi project\backend\.env"
$mongoUri = ""
if (Test-Path $envFile) {
    $content = Get-Content $envFile
    foreach ($line in $content) {
        if ($line -match "MONGODB_URI=(.+)") {
            $mongoUri = $matches[1].Trim()
            break
        }
    }
}

if (-not $mongoUri) {
    Write-Host "Warning: MONGODB_URI not found in .env, deployment might fail or need manual env var setup."
}

# 3. Create Service
$body = @{
    name = "oi-dashboard-backend"
    type = "web_service"
    repo = "https://github.com/filmygod14148/oi-dashboard-backend"
    branch = "main"
    ownerId = $ownerId
    serviceDetails = @{
        env = "node"
        plan = "free"
        region = "oregon"
        envSpecificDetails = @{
            buildCommand = "npm install"
            startCommand = "node server.js"
        }
    }
    envVars = @(
        @{ key = "PORT"; value = "5000" },
        @{ key = "NODE_ENV"; value = "production" },
        @{ key = "USE_MOCK_DATA"; value = "false" },
        @{ key = "MONGODB_URI"; value = $mongoUri }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Creating service on Render..."
try {
    $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services" -Method Post -Headers $headers -Body $body
    Write-Host "Service creation successful!"
    $response | ConvertTo-Json
} catch {
    Write-Error "Failed to create service: $_"
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)"
    }
}
