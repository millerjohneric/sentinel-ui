@echo off
REM Launch Sentinel UI
REM This batch file starts the web interface for Sentinel Media Sync

powershell -ExecutionPolicy Bypass -File "%~dp0launch-ui.ps1" %*
