@echo off
cd /d "%~dp0\.."

if not exist .env type nul > .env

if not exist data mkdir data

docker build -t pm-app .
docker run -d --name pm-app -p 8000:8000 -v "%cd%\data:/app/data" --env-file .env pm-app

echo App running at http://localhost:8000
