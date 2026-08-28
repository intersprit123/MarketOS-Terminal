# MarketOS Terminal - Windows PowerShell CLI
# Safe local controller for the MarketOS CodeX project.

$ErrorActionPreference = 'Stop'
$script:Root = if ($env:MARKETOS_ROOT) { $env:MARKETOS_ROOT } else { Join-Path $HOME 'MarketOS\CodeX' }
$script:DevProcess = $null

function Show-Banner {
  Write-Host ''
  Write-Host '  ███╗   ███╗ █████╗ ██████╗ ██╗  ██╗███████╗████████╗' -ForegroundColor Cyan
  Write-Host '  ████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝██╔════╝╚══██╔══╝' -ForegroundColor Cyan
  Write-Host '  ██╔████╔██║███████║██████╔╝█████╔╝ █████╗     ██║   ' -ForegroundColor Cyan
  Write-Host '  ██║╚██╔╝██║██╔══██║██╔══██╗██╔═██╗ ██╔══╝     ██║   ' -ForegroundColor Cyan
  Write-Host '  ██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██╗███████╗   ██║   ' -ForegroundColor Cyan
  Write-Host '  ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ' -ForegroundColor Cyan
  Write-Host '  MarketOS Terminal' -ForegroundColor White
  Write-Host ''
}

function Require-Root {
  if (-not (Test-Path $script:Root)) {
    Write-Host "CodeX folder not found: $script:Root" -ForegroundColor Red
    Write-Host 'Set it with: $env:MARKETOS_ROOT="D:\ESHHAN\My ShareMarket APP\CodeX"' -ForegroundColor Yellow
    return $false
  }
  return $true
}

function Invoke-CodeX([string]$Command) {
  if (-not (Require-Root)) { return }
  Push-Location $script:Root
  try { & powershell -NoProfile -Command $Command } finally { Pop-Location }
}

function Show-Status {
  Write-Host '[MarketOS] STATUS' -ForegroundColor Cyan
  Write-Host "Root: $script:Root"
  if (-not (Require-Root)) { return }
  Push-Location $script:Root
  try {
    $mode = (Get-Content .env.local -ErrorAction SilentlyContinue | Where-Object { $_ -match '^MARKET_DATA_MODE=' } | Select-Object -First 1)
    $groq = (Get-Content .env.local -ErrorAction SilentlyContinue | Where-Object { $_ -match '^GROQ_API_KEY=' } | Select-Object -First 1)
    $twelve = (Get-Content .env.local -ErrorAction SilentlyContinue | Where-Object { $_ -match '^TWELVE_DATA_API_KEY=' } | Select-Object -First 1)
    Write-Host "Node: $(node --version 2>$null)"
    Write-Host "npm:  $(npm --version 2>$null)"
    Write-Host "Git:  $(git --version 2>$null)"
    Write-Host "Market mode: $(if($mode){$mode -replace '=.*','=***'}else{'not set'})"
    Write-Host "Groq key: $(if($groq){'configured'}else{'missing'})"
    Write-Host "Twelve Data key: $(if($twelve){'configured'}else{'missing'})"
    $port = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    Write-Host "Port 3000: $(if($port){'LISTENING'}else{'free'})"
    Write-Host "Dev server: $(if(Get-Process node -ErrorAction SilentlyContinue){'node process detected'}else{'not running'})"
  } finally { Pop-Location }
}

function Start-MarketOS {
  if (-not (Require-Root)) { return }
  if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host '[MarketOS] Already running on http://localhost:3000' -ForegroundColor Yellow
    return
  }
  Write-Host '[MarketOS] Starting dev server...' -ForegroundColor Green
  Push-Location $script:Root
  try { npm run dev } finally { Pop-Location }
}

function Stop-MarketOS {
  $conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($id in $pids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    Write-Host '[MarketOS] Stopped process on port 3000.' -ForegroundColor Green
  } else { Write-Host '[MarketOS] Nothing is listening on port 3000.' -ForegroundColor Yellow }
}

function Restart-MarketOS {
  Stop-MarketOS
  Start-Sleep -Milliseconds 500
  Start-MarketOS
}

function Hot-Restart {
  if (-not (Require-Root)) { return }
  Write-Host '[MarketOS] Clearing .next cache...' -ForegroundColor Cyan
  Push-Location $script:Root
  try {
    if (Test-Path .next) { Remove-Item .next -Recurse -Force }
    Write-Host '[MarketOS] Cache cleared. Restarting...' -ForegroundColor Green
  } finally { Pop-Location }
  Restart-MarketOS
}

function Refresh-Project {
  if (-not (Require-Root)) { return }
  Push-Location $script:Root
  try {
    Write-Host '[MarketOS] Git status:' -ForegroundColor Cyan
    git status --short
    Write-Host '[MarketOS] Pulling latest main...' -ForegroundColor Cyan
    git pull
  } finally { Pop-Location }
}

function Build-Project {
  if (-not (Require-Root)) { return }
  Push-Location $script:Root
  try { npm run build } finally { Pop-Location }
}

function Market-Check {
  try {
    $r = Invoke-RestMethod 'http://localhost:3000/api/market' -TimeoutSec 15
    Write-Host "Source: $($r.source)  Live: $($r.liveData)  Quotes: $($r.quotes.Count)" -ForegroundColor Cyan
    $r.quotes | Format-Table symbol,name,price,changePercent,currency -AutoSize
  } catch { Write-Host "Market API failed: $($_.Exception.Message)" -ForegroundColor Red }
}

function Doctor {
  Show-Status
  if (Require-Root) {
    Push-Location $script:Root
    try {
      Write-Host '[Doctor] package.json:' -ForegroundColor Cyan
      Write-Host (if(Test-Path package.json){'OK'}else{'MISSING'})
      Write-Host '[Doctor] app/api/market/route.ts:' -ForegroundColor Cyan
      Write-Host (if(Test-Path app/api/market/route.ts){'OK'}else{'MISSING'})
      Write-Host '[Doctor] app/api/ai/route.ts:' -ForegroundColor Cyan
      Write-Host (if(Test-Path app/api/ai/route.ts){'OK'}else{'MISSING'})
      Write-Host '[Doctor] node_modules:' -ForegroundColor Cyan
      Write-Host (if(Test-Path node_modules){'OK'}else{'MISSING - run npm install'})
    } finally { Pop-Location }
  }
}

function Show-Help {
  Write-Host ''
  Write-Host 'Commands' -ForegroundColor Cyan
  Write-Host '  status       Show safe system/config status'
  Write-Host '  start        Start Next.js dev server'
  Write-Host '  stop         Stop server on port 3000'
  Write-Host '  restart      Stop + start'
  Write-Host '  hot-restart  Clear .next + restart'
  Write-Host '  refresh      Git pull latest code'
  Write-Host '  build        Run production build'
  Write-Host '  market       Test /api/market'
  Write-Host '  doctor       Run diagnostics'
  Write-Host '  root         Show/set project root'
  Write-Host '  help         Show this help'
  Write-Host '  exit         Quit terminal'
  Write-Host ''
  Write-Host 'Security: API key values are never printed.' -ForegroundColor DarkGray
}

Show-Banner
Write-Host "Connected project: $script:Root" -ForegroundColor DarkGray
Show-Help

while ($true) {
  $cmd = (Read-Host 'marketos').Trim().ToLowerInvariant()
  switch ($cmd) {
    'status' { Show-Status }
    'start' { Start-MarketOS }
    'stop' { Stop-MarketOS }
    'restart' { Restart-MarketOS }
    'hot-restart' { Hot-Restart }
    'refresh' { Refresh-Project }
    'build' { Build-Project }
    'market' { Market-Check }
    'doctor' { Doctor }
    'root' { Write-Host "Current root: $script:Root"; $new = Read-Host 'New root (Enter to keep)'; if($new){$script:Root=$new} }
    'help' { Show-Help }
    'clear' { Clear-Host }
    'exit' { break }
    '' { }
    default { Write-Host "Unknown command: $cmd. Type 'help'." -ForegroundColor Yellow }
  }
}
