@echo off
cd /d "%~dp0"
echo Preparando el sistema de pedidos...
py -m pip install -r requirements.txt
if errorlevel 1 (
  echo No se pudieron instalar las dependencias. Verifica que Python este instalado.
  pause
  exit /b 1
)
echo.
echo Iniciando el servidor. No cierres esta ventana mientras uses el sistema.
echo En esta computadora abre: http://127.0.0.1:5000
echo En celulares conectados al mismo Wi-Fi usa la direccion IP de esta computadora y el puerto 5000.
echo.
py app.py
pause
