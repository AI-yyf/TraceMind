param(
  [switch]$SkipInstall,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot 'skills-backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$backendHealthUrl = 'http://127.0.0.1:3303/health'
$frontendUrl = 'http://127.0.0.1:5173'

function Ensure-Dependencies {
  param(
    [string]$Name,
    [string]$WorkingDirectory
  )

  if ($SkipInstall) {
    return
  }

  $nodeModules = Join-Path $WorkingDirectory 'node_modules'
  if (Test-Path $nodeModules) {
    return
  }

  Write-Host "[TraceMind] Installing $Name dependencies..."
  & npm.cmd install --prefix $WorkingDirectory
}

function Start-ServiceWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $escapedDirectory = $WorkingDirectory.Replace('"', '\"')
  $composedCommand = "title $Title && cd /d `"$escapedDirectory`" && $Command"
  Start-Process cmd.exe `
    -ArgumentList @(
      '/k',
      $composedCommand
    ) `
    -WorkingDirectory $WorkingDirectory | Out-Null
}

function Wait-For-Backend {
  param(
    [string]$HealthUrl
  )

  $deadline = (Get-Date).AddMinutes(2)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 4
      if ($response.status -eq 'ok') {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

Write-Host '[TraceMind] Preparing workspace...'
Ensure-Dependencies -Name 'backend' -WorkingDirectory $backendDir
Ensure-Dependencies -Name 'frontend' -WorkingDirectory $frontendDir

Write-Host '[TraceMind] Starting backend on http://127.0.0.1:3303 ...'
Start-ServiceWindow `
  -Title 'TraceMind Backend' `
  -WorkingDirectory $backendDir `
  -Command 'npm run dev'

if (-not (Wait-For-Backend -HealthUrl $backendHealthUrl)) {
  throw "Backend did not become healthy within the expected time. Check the 'TraceMind Backend' window."
}

Write-Host '[TraceMind] Starting frontend on http://127.0.0.1:5173 ...'
Start-ServiceWindow `
  -Title 'TraceMind Frontend' `
  -WorkingDirectory $frontendDir `
  -Command 'set "VITE_DEV_PROXY_TARGET=http://127.0.0.1:3303" && npm run dev -- --host 127.0.0.1 --strictPort'

Write-Host ''
Write-Host '[TraceMind] Ready.'
Write-Host "  Frontend: $frontendUrl"
Write-Host "  Backend health: $backendHealthUrl"

if (-not $NoBrowser) {
  Start-Process $frontendUrl | Out-Null
}
