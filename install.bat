@echo off
setlocal

:: Ensure execution from the repository directory
cd /d "%~dp0"

:: Check if Docker CLI is installed
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not installed or not in PATH.
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

:: Check if Docker Engine is already running
docker info >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Docker Engine is already running!
    goto start_app
)

:: Attempt to find and launch Docker Desktop if not running
echo [INFO] Docker Engine is not running. Starting Docker Desktop...
set "DOCKER_DESKTOP_PATH="

if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    set "DOCKER_DESKTOP_PATH=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" (
    set "DOCKER_DESKTOP_PATH=%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
) else (
    for /f "tokens=*" %%i in ('where /r "%ProgramFiles%" "Docker Desktop.exe" 2^>nul') do (
        set "DOCKER_DESKTOP_PATH=%%i"
        goto found_docker
    )
)

:found_docker
if not defined DOCKER_DESKTOP_PATH (
    echo [WARN] Could not find Docker Desktop executable automatically.
    echo Please start Docker Desktop manually, then press any key to continue...
    pause
) else (
    start "" "%DOCKER_DESKTOP_PATH%"
)

:: Wait until Docker Engine is running
echo [INFO] Waiting for Docker Engine to initialize...
:waitloop
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    timeout /t 3 >nul
    goto waitloop
)
echo [INFO] Docker Engine is now running!

:start_app
:: Ensure host mount directories exist
if not exist "data" mkdir "data"
if not exist "images" mkdir "images"
if not exist "logs" mkdir "logs"

:: Determine Docker Compose command (Compose V2 vs V1)
docker compose version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "COMPOSE_CMD=docker compose"
) else (
    set "COMPOSE_CMD=docker-compose"
)

:: Build and start the container
echo [INFO] Building Spotlight Storage container...
%COMPOSE_CMD% build

echo [INFO] Starting Spotlight Storage container...
%COMPOSE_CMD% up -d

echo [SUCCESS] Installation is complete!
echo Spotlight Storage is running at http://localhost:5000
timeout /t 5 >nul
exit /b 0
