@echo off
setlocal

set /p TARGET_DATE=Enter the date to pull (YYYY-MM-DD):

if "%TARGET_DATE%"=="" (
    echo No date entered - cancelled.
    pause
    exit /b 1
)

cd /d "%~dp0"
".\venv\Scripts\python.exe" main.py --date %TARGET_DATE%

echo.
pause
