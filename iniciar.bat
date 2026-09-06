@echo off
chcp 65001 > nul
title VoxLivre - Leitor de PDF com Voz Humana

echo ========================================================
echo   🔊 Iniciando VoxLivre (Voz Humana Neural Ilimitada)
echo ========================================================
echo.

cd /d "%~dp0"

if not exist "node_modules\" (
    echo [1/2] Instalando dependencias necessarias...
    call npm install
    echo.
)

echo [2/2] Abrindo servidor e navegador...
start "" cmd /c "node server.js"

timeout /t 2 /nobreak > nul
start http://localhost:3000

echo.
echo ========================================================
echo   ✅ Tudo pronto! O programa foi aberto no seu navegador.
echo   Para encerrar o programa, basta fechar a janela do servidor.
echo ========================================================
echo.
pause
