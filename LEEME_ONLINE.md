# Sistema de pedidos online (Render + Supabase)

## Qué cambia en esta versión
- Usa Supabase PostgreSQL cuando existe `DATABASE_URL`; localmente sigue pudiendo usar SQLite.
- El panel `/admin` y las rutas de gestión quedan protegidas con usuario/contraseña HTTP Basic Auth.
- Render usa `PORT` automáticamente y Gunicorn para servir Flask.
- Los clientes pueden ver el catálogo y enviar pedidos sin iniciar sesión; solo el administrador puede consultar/gestionar pedidos y editar productos.

## Publicación gratuita

### 1. Subir el proyecto a GitHub
1. Entrá a https://github.com/ y creá un repositorio privado llamado `sistema-pedidos`.
2. Descomprimí el ZIP y subí el contenido de la carpeta `sistema_pedidos` al repositorio (incluidos `app.py`, `templates`, `static`, `requirements.txt` y `render.yaml`).
3. No subas `pedidos.db`, claves ni contraseñas.

### 2. Copiar la conexión de Supabase
1. Abrí tu proyecto de Supabase.
2. Pulsá **Connect** y copiá la cadena de PostgreSQL del **Session pooler** si Render no puede acceder a la conexión directa por IPv4. Supabase indica que el pooler de sesión es una opción IPv4.
3. Sustituí `[YOUR-PASSWORD]` por la contraseña de la base de datos. Si tiene caracteres especiales, codificalos para URL. Nunca pegues esa cadena en chats ni la guardes en el repositorio.

La app crea automáticamente las tablas `products`, `orders` y `order_items` al arrancar e inserta productos de ejemplo si el catálogo está vacío.

### 3. Crear servicio en Render
1. Entrá a https://dashboard.render.com/ y elegí **New + → Blueprint** (o **New + → Web Service** si preferís configurarlo a mano).
2. Conectá GitHub y seleccioná el repositorio privado.
3. Si usás Blueprint, Render lee `render.yaml`. Elegí el plan **Free**.
4. En **Environment** del servicio configurá:
   - `DATABASE_URL`: la cadena de conexión de Supabase.
   - `ADMIN_USER`: un nombre de usuario que no sea fácil de adivinar.
   - `ADMIN_PASSWORD`: una contraseña larga, única y segura.
5. Guardá los cambios y hacé deploy.

Si configurás Web Service manualmente:
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app --workers 1 --threads 4 --timeout 120`
- Health Check Path: `/health`
- Plan: Free

## Cómo usarlo
- Cliente: `https://TU-SERVICIO.onrender.com/`
- Administrador: `https://TU-SERVICIO.onrender.com/admin` (pedirá usuario y contraseña)
- Prueba técnica: `https://TU-SERVICIO.onrender.com/health`

Render gratuito puede dormir el servicio tras inactividad y tardar en volver a arrancar. El proyecto de Supabase gratuito puede tener límites o pausarse por inactividad. Es una versión inicial; antes de usar con clientes reales, probá crear y cambiar estados de pedidos y guardá credenciales de forma segura.

## Seguridad
- No publiques `DATABASE_URL`, contraseña de Supabase ni `ADMIN_PASSWORD` en GitHub ni en mensajes.
- El panel usa autenticación básica del navegador. Usá solo HTTPS (Render lo proporciona en el dominio `onrender.com`).
- Si la conexión falla, revisá que la cadena completa sea correcta y usá el **Session pooler** indicado en Connect en Supabase.

## Panel administrativo ampliado
- Entrá a `https://TU-SERVICIO.onrender.com/admin` e iniciá sesión con `ADMIN_USER` y `ADMIN_PASSWORD`.
- En **Productos** podés agregar, editar nombre, categoría y precio, o quitar un producto del catálogo.
- En **Categorías** podés crear categorías, renombrarlas y eliminar las que no tengan productos activos.
- En **Configuración del negocio** podés cambiar el nombre del negocio y el símbolo de moneda.
- Las categorías y configuración se guardan en la base de datos. Esta versión corrige la selección de conexión para usar PostgreSQL cuando `DATABASE_URL` está definida.

Antes de desplegar esta versión sobre una instalación que ya recibió pedidos, verificá en Supabase → Table Editor si existen las tablas `orders`, `order_items` y `products`. La versión anterior pudo haber estado guardando datos en SQLite local por un error en la función de conexión; los datos de SQLite no se transfieren automáticamente a Supabase. Conservá una copia de seguridad de cualquier dato que necesites antes de reemplazar el código.
