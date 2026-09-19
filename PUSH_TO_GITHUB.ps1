param(
  [string]$RepoUrl = 'https://github.com/faust-0612/BUKLOD-QuickCheck-Web.git'
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host "BUKLOD QuickCheck Web - GitHub bootstrap" -ForegroundColor Cyan
if (-not (Test-Path .git)) { git init -b main }
git add .
if ((git status --porcelain).Length -gt 0) { git commit -m "feat: canonical standalone QuickCheck web on Supabase" }
$hasOrigin = git remote 2>$null | Select-String '^origin$'
if ($hasOrigin) { git remote set-url origin $RepoUrl } else { git remote add origin $RepoUrl }
git push -u origin main
Write-Host "Pushed to $RepoUrl" -ForegroundColor Green
