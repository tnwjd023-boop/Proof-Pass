# Run in an elevated Windows PowerShell. Never restarts Windows automatically.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot '.local/setup'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$resultPath = Join-Path $logDir 'wsl-install.json'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$result = [ordered]@{
    startedAt = [DateTime]::UtcNow.ToString('o')
    elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    command = 'wsl.exe --install -d Ubuntu --no-launch'
    status = 'running'
}
try {
    if (-not $result.elevated) { throw 'Administrator PowerShell is required.' }
    $result | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $env:SystemRoot 'System32/wsl.exe'
    $start.Arguments = '--install -d Ubuntu --no-launch'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.Encoding]::Unicode
    $start.StandardErrorEncoding = [Text.Encoding]::Unicode
    $process = [Diagnostics.Process]::Start($start)
    $outTask = $process.StandardOutput.ReadToEndAsync()
    $errTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $result.stdout = $outTask.Result
    $result.stderr = $errTask.Result
    $result.exitCode = $process.ExitCode
    $result.status = 'finished-command-needs-verification'
} catch {
    $result.status = 'failed'
    $result.error = $_.Exception.Message
} finally {
    $result.finishedAt = [DateTime]::UtcNow.ToString('o')
    $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding UTF8
}
if ($result.status -eq 'failed') { exit 1 }
exit $result.exitCode
