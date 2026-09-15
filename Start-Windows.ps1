$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node scripts/local-workspace.mjs
if ($LASTEXITCODE -ne 0) { throw "Local workspace startup failed." }
