@echo off
setlocal

cd /d "%~dp0"
echo [1/5] Kill running app processes...
taskkill /F /IM VideoToPost.exe >nul 2>nul
taskkill /F /IM electron.exe >nul 2>nul

echo [2/5] Clean old release artifacts...
if exist "release\win-unpacked" rmdir /s /q "release\win-unpacked"
if exist "release\builder-effective-config.yaml" del /f /q "release\builder-effective-config.yaml"

echo [3/5] Set Electron download mirror...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_CUSTOM_DIR=v35.7.5
set ELECTRON_BUILDER_CACHE=%cd%\.cache\electron-builder

echo [4/5] Build and package...
call npm.cmd run dist:win
if errorlevel 1 (
  echo.
  echo Build failed. Please check logs above.
  exit /b 1
)

echo [5/5] Done.
echo Installer output dir: %cd%\release
echo Portable exe path: %cd%\release\win-unpacked\VideoToPost.exe
endlocal

