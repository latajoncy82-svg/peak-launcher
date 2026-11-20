@echo off
cd /d "%~dp0"
if exist "%~dp0dist\win-unpacked\Peak Launcher.exe" (
  start "" "%~dp0dist\win-unpacked\Peak Launcher.exe"
) else if exist "%~dp0node_modules\electron\dist\electron.exe" (
  start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
) else (
  start "" /b npx --no-install electron .
)
