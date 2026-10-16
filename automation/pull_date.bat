@echo off
setlocal

rem Double-click to pull one date, or a range, and upload it to the rider dashboard.
set /p FROM_DATE=Date to pull, or start of a range (YYYY-MM-DD):

if "%FROM_DATE%"=="" (
    echo No date entered - cancelled.
    pause
    exit /b 1
)

set /p TO_DATE=End of range (YYYY-MM-DD), or press Enter for just that one day:

cd /d "%~dp0"
if "%TO_DATE%"=="" (
    ".\venv\Scripts\python.exe" run.py --date %FROM_DATE%
) else (
    ".\venv\Scripts\python.exe" run.py --from %FROM_DATE% --to %TO_DATE%
)

echo.
pause
