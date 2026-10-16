# Runs run.py and shows a Windows notification with the result ("N of N dates uploaded",
# "session expired, log in manually", or "failed") so a scheduled run never fails silently.
#
# Usage:
#   .\run_and_notify.ps1                                  # today
#   .\run_and_notify.ps1 -Date 2026-10-15                 # one day
#   .\run_and_notify.ps1 -From 2026-10-15 -To 2026-10-16  # a range (what the 01:00 task uses)
#   .\run_and_notify.ps1 -Yesterday                       # yesterday through today (01:00 task)

param(
    [string]$Date,
    [string]$From,
    [string]$To,
    [switch]$Yesterday
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Decode Python's output as UTF-8 so its messages don't turn into mojibake under the console codepage.
$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$PythonExe = Join-Path $ScriptDir "venv\Scripts\python.exe"
# -u keeps stdout unbuffered so the OTP prompt shows up while the run is waiting for it.
$PyArgs = @("-u", "run.py")
if ($Yesterday) {
    $From = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
    $To = (Get-Date).ToString("yyyy-MM-dd")
}
if ($Date) { $PyArgs += @("--date", $Date) }
elseif ($From -and $To) { $PyArgs += @("--from", $From, "--to", $To) }

# Tee, don't capture, so the console shows progress (and the OTP prompt) live. run.py also writes
# logs/run_<date>.log; last_run.log here is just the most recent run.
$LogPath = Join-Path $ScriptDir "last_run.log"
& $PythonExe @PyArgs 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath $LogPath
$ExitCode = $LASTEXITCODE

$Output = if (Test-Path $LogPath) { Get-Content $LogPath -Raw } else { "" }
$Title = "FastBeetle rider dashboard"

if ($Output -match "Session expired with nobody to enter the OTP") {
    $Message = "LoadShare session expired - run 'python run.py' by hand once to log in with the OTP."
    $Icon = [System.Windows.Forms.ToolTipIcon]::Warning
}
elseif ($Output -match "RESULT:\s*(\d+) of (\d+) date\(s\) OK") {
    $Message = "$($Matches[1]) of $($Matches[2]) date(s) uploaded."
    $Icon = if ($Matches[1] -eq $Matches[2]) { [System.Windows.Forms.ToolTipIcon]::Info } else { [System.Windows.Forms.ToolTipIcon]::Error }
}
elseif ($ExitCode -ne 0) {
    $Message = "Run failed - see last_run.log in the automation folder."
    $Icon = [System.Windows.Forms.ToolTipIcon]::Error
}
else {
    $Message = "Run finished (exit code $ExitCode)."
    $Icon = [System.Windows.Forms.ToolTipIcon]::Info
}

$NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
$NotifyIcon.Icon = [System.Drawing.SystemIcons]::Information
$NotifyIcon.Visible = $true
$NotifyIcon.ShowBalloonTip(15000, $Title, $Message, $Icon)
Start-Sleep -Seconds 6   # let Windows render the toast before the icon is disposed
$NotifyIcon.Dispose()

exit $ExitCode
