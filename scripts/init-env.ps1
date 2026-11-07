$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskEnvPath = Join-Path $taskProjectRoot '.env'
if (Test-Path -LiteralPath $taskEnvPath) {
    Write-Host '.env already exists; no changes made.'
    exit 0
}
$taskRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $taskDbBytes = New-Object byte[] 24
    $taskJwtBytes = New-Object byte[] 32
    $taskRandom.GetBytes($taskDbBytes)
    $taskRandom.GetBytes($taskJwtBytes)
    $taskLines = @(
        ('DB_PASSWORD=' + [Convert]::ToBase64String($taskDbBytes)),
        ('JWT_SECRET=' + [Convert]::ToBase64String($taskJwtBytes)),
        'CORS_ORIGINS=http://localhost:5173,http://localhost:3000'
    )
    [System.IO.File]::WriteAllLines($taskEnvPath, $taskLines, (New-Object System.Text.UTF8Encoding $false))
    Write-Host 'Created .env with random local credentials.'
} finally {
    $taskRandom.Dispose()
}
