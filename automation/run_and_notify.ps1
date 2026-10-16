# Runs the scraper and shows a Windows notification with the result -
# "N orders uploaded" or "session expired, log in manually" - so a scheduled
# or unattended run doesn't silently succeed or fail with nobody noticing.
#
# Usage:
#   .\run_and_notify.ps1                   # today
#   .\run_and_notify.ps1 -Date 2026-07-20  # a specific day

param(
    [string]$Date
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Decode Python's output as UTF-8 so the em-dashes in its messages render as
# em-dashes instead of the mojibake they turn into under the console codepage.
$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$PythonExe = Join-Path $ScriptDir "venv\Scripts\python.exe"
# -u keeps Python's stdout unbuffered. Without it Python block-buffers as soon
# as stdout is a pipe rather than a console, so prompts (notably "Enter the OTP
# sent to your phone") wouldn't appear until the process had already exited.
$PyArgs = @("-u", "main.py")
if ($Date) { $PyArgs += @("--date", $Date) }

# Tee, don't capture: Out-String would hold the whole stream back until the run
# finished, leaving a blank window during the OTP wait. ToString() flattens the
# ErrorRecords that 2>&1 wraps native stderr lines in, so tracebacks print as
# plain text instead of red NativeCommandError blocks.
$LogPath = Join-Path $ScriptDir "last_run.log"
& $PythonExe @PyArgs 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath $LogPath
$ExitCode = $LASTEXITCODE

$Output = if (Test-Path $LogPath) { Get-Content $LogPath -Raw } else { "" }

$Title = "Loadshare Sync"

if ($Output -match "Uploaded to dashboard:\s*(\d+)\s*orders written") {
    $Message = "Data uploaded successfully - $($Matches[1]) orders written."
    $Icon = [System.Windows.Forms.ToolTipIcon]::Info
}
elseif ($Output -match "nobody was available to enter an OTP") {
    $Message = "Session expired - run main.py manually (in a real terminal) to log back in."
    $Icon = [System.Windows.Forms.ToolTipIcon]::Warning
}
elseif ($ExitCode -ne 0) {
    $Message = "Run failed - check the console output for details."
    $Icon = [System.Windows.Forms.ToolTipIcon]::Error
}
else {
    $Message = "Run finished (exit code $ExitCode) - see console output for details."
    $Icon = [System.Windows.Forms.ToolTipIcon]::Info
}

$NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
$NotifyIcon.Icon = [System.Drawing.SystemIcons]::Information
$NotifyIcon.Visible = $true
$NotifyIcon.ShowBalloonTip(15000, $Title, $Message, $Icon)

# Give Windows time to actually render the toast before the icon gets disposed.
Start-Sleep -Seconds 6
$NotifyIcon.Dispose()

exit $ExitCode
