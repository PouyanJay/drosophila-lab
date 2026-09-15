$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install Docker Desktop, then run this launcher again.' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, wait until it is ready, then run this launcher again.' }
Write-Host 'Starting your trainer. The first build downloads dependencies and can take several minutes.'
docker compose -p drosophila-compute -f connect-compose.yaml up --build -d
if ($LASTEXITCODE -ne 0) { throw 'Docker could not start the trainer. Check the error above and rerun this launcher.' }
for ($attempt = 1; $attempt -le 60; $attempt++) {
  $logs = docker compose -p drosophila-compute -f connect-compose.yaml logs --no-color --tail 200 tunnel
  $ErrorActionPreference = 'Continue'
  $connection = $logs | docker compose -p drosophila-compute -f connect-compose.yaml exec -T trainer python -m research.lab.connection_export 2>connection-setup.log
  $exportExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exportExit -eq 0) {
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'connection.json'), ($connection -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Write-Host 'READY: In the website, open Compute and import connection.json from this folder.'
    Write-Host 'Keep Docker running and your computer awake. Closing this terminal is fine.'
    Write-Host 'To stop: docker compose -p drosophila-compute -f connect-compose.yaml stop'
    exit 0
  }
  Start-Sleep -Seconds 5
}
throw 'The trainer is still starting or the connection failed. Check connection-setup.log and Docker, then rerun this launcher. Existing runs are preserved.'
