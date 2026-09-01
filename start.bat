@echo off
cd /d "%~dp0"

rem Python (same lookup as Launch Dispatch Board.bat)
for /d %%P in ("%LOCALAPPDATA%\Programs\Python\Python*") do set "PATH=%%P;%%P\Scripts;%PATH%"
rem Node, if it was installed to the default location and is not already on PATH
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found on PATH.
    echo Install the LTS build from https://nodejs.org and tick "Add to PATH".
    pause
    exit /b 1
)

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python not found on PATH.
    echo Install Python 3 from https://python.org and tick "Add python.exe to PATH".
    echo If typing python opens the Microsoft Store, that stub is not a real
    echo install - use the python.org installer instead.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing npm packages...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)

echo Starting the board ^(Vite on port 5173^) and the IRC bridge.
echo Leave both windows open. AdiIRC/HexChat still need the bridge script loaded.
echo.
start "Dispatch Board" cmd /k npx vite --host
start "FRBoard Bridge" cmd /k python -u scripts\python\node.py --no-browser
timeout /t 3 >nul
start http://localhost:5173
