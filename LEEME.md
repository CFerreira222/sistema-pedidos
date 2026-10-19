# Sistema de pedidos — guía rápida

## Qué incluye
- Pantalla de cliente: elegir productos por categoría, cantidades, notas y enviar pedido.
- Panel del servidor: pedidos actualizados automáticamente cada 3 segundos, estados y total.
- Gestión de productos: agregar o quitar productos del catálogo.
- Base de datos SQLite local persistente (`pedidos.db`).

## Inicio en Windows
1. Instala Python 3.11 o superior desde https://www.python.org/downloads/ (marca “Add Python to PATH”).
2. Descomprime la carpeta completa.
3. Haz doble clic en `INICIAR_WINDOWS.bat` y acepta el permiso de red de Windows Firewall para redes privadas si aparece.
4. En la computadora que ejecuta el sistema, abre `http://127.0.0.1:5000`.
5. Para encontrar la IP local: abre CMD y ejecuta `ipconfig`; busca “Dirección IPv4” de la conexión Wi-Fi (por ejemplo `192.168.1.25`).
6. En cada celular/tablet conectado a la misma red Wi-Fi abre `http://IP-DE-LA-COMPUTADORA:5000` para la pantalla de cliente o añade `/admin` para el panel del servidor.

Ejemplo: `http://192.168.1.25:5000/admin`

## Importante
- La computadora que ejecuta el programa debe permanecer encendida y conectada a la red mientras se usa.
- Todos los dispositivos deben estar en la misma red Wi-Fi. Algunas redes de invitados bloquean la comunicación entre dispositivos.
- Esto es una primera versión para red local; no está publicada en Internet. Para usarla desde distintas redes o fuera del local, hace falta desplegarla en un servidor en la nube.
- El panel de administración no tiene contraseña en esta versión. Úsalo solo en una red de confianza; no expongas el puerto 5000 a Internet.
- Los precios y productos de ejemplo son ficticios y se pueden editar desde el panel.
- Para respaldar los pedidos, cierra la aplicación y copia el archivo `pedidos.db` a un lugar seguro.
