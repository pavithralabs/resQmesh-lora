@echo off
title ResQMesh - Universal Multi-Network Launcher
cd /d "%~dp0"

python run.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Launcher stopped with code %ERRORLEVEL%.
    pause
)
