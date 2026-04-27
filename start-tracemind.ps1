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
$backendStdout = Join-Path $repoRoot 'backend-stdout.log'
$backendStderr = Join-Path $repoRoot 'backend-stderr.log'
$frontendStdout = Join-Path $repoRoot 'frontend-stdout.log'
$frontendStderr = Join-Path $repoRoot 'frontend-stderr.log'

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

function Start-ServiceProcess {
  param(
    [string]$WorkingDirectory,
    [string]$Command,
    [string]$StdoutPath,
    [string]$StderrPath
  )

  if (Test-Path $StdoutPath) {
    Remove-Item -LiteralPath $StdoutPath -Force
  }
  if (Test-Path $StderrPath) {
    Remove-Item -LiteralPath $StderrPath -Force
  }

  Start-Process cmd.exe `
    -ArgumentList @(
      '/c',
      $Command
    ) `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath | Out-Null
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

function Wait-For-Frontend {
  param(
    [string]$FrontendUrl
  )

  $deadline = (Get-Date).AddMinutes(2)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 4
      if ($response.StatusCode -ge 200) {
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
Start-ServiceProcess `
  -WorkingDirectory $backendDir `
  -Command 'npm run dev' `
  -StdoutPath $backendStdout `
  -StderrPath $backendStderr

if (-not (Wait-For-Backend -HealthUrl $backendHealthUrl)) {
  throw "Backend did not become healthy within the expected time. Check $backendStdout and $backendStderr."
}

Write-Host '[TraceMind] Starting frontend on http://127.0.0.1:5173 ...'
Start-ServiceProcess `
  -WorkingDirectory $frontendDir `
  -Command 'set "VITE_DEV_PROXY_TARGET=http://127.0.0.1:3303" && npm run dev -- --host 127.0.0.1 --strictPort' `
  -StdoutPath $frontendStdout `
  -StderrPath $frontendStderr

if (-not (Wait-For-Frontend -FrontendUrl $frontendUrl)) {
  throw "Frontend did not become reachable within the expected time. Check $frontendStdout and $frontendStderr."
}

Write-Host ''
Write-Host '[TraceMind] Ready.'
Write-Host "  Frontend: $frontendUrl"
Write-Host "  Backend health: $backendHealthUrl"
Write-Host "  Backend log: $backendStdout"
Write-Host "  Frontend log: $frontendStdout"

if (-not $NoBrowser) {
  Start-Process $frontendUrl | Out-Null
}
