@echo off
cd /d "%~dp0"
set ENV=production
set HOST=0.0.0.0
if not defined PORT set PORT=8765
echo Starting Jobilly.AI Resume Dashboard (production)...
echo Listening on http://0.0.0.0:%PORT%
python -u server.py
