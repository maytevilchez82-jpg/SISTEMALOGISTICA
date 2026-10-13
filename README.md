# Qaso System

Sistema de inventario construido con metodologia en cascada, Python, Flask, Excel, HTML, CSS y JavaScript.

Los datos se almacenan en `inventario.xlsx`, con las hojas `Productos` y `Movimientos`. El archivo se crea automaticamente al iniciar por primera vez.

## Modelo - Vista - Controlador (MVC)

- **Modelo (`Modelo/excel_model.py`):** contiene la estructura de productos y movimientos, las reglas de datos y la lectura y escritura del libro Excel. También realiza la importación y exportación.
- **Vista (`templates/`, `static/` y `Vista/`):** `templates/index.html` y `templates/login.html` son las pantallas. Los archivos JavaScript gestionan la interacción del usuario y consumen la API; los archivos CSS presentan la interfaz. `Vista/__init__.py` registra el manejador de errores 404.
- **Controlador (`Controlador/inventory_controller.py`):** recibe las solicitudes de páginas y API, valida datos, aplica permisos y coordina las operaciones del modelo.
- **Arranque (`app.py`):** configura Flask, registra los blueprints e inicializa el modelo; no contiene las reglas de inventario.

La aplicación ya trabaja con estas responsabilidades sin mover archivos. `app.py` registra `Controlador.inventory_controller` y `Vista.views`.

La estructura actual adaptada a Flask es:

```text
app.py
Controlador/
	__init__.py
	inventory_controller.py
Modelo/
	__init__.py
	excel_model.py
Vista/
	__init__.py
controllers/
	__init__.py
	inventory_controller.py  # alternativo, no registrado por app.py
templates/
	index.html
	login.html
static/
	app.js
	login.js
	style.css
	login.css
	imagenes de marca
```

### Flujo de datos

1. La vista inicia una solicitud desde `static/app.js` o `static/login.js`.
2. `Controlador/inventory_controller.py` valida la solicitud y comprueba permisos cuando corresponde.
3. El controlador llama a `Modelo/excel_model.py`, que lee o actualiza `inventario.xlsx`.
4. El controlador devuelve la respuesta y la vista actualiza los datos presentados.

### Funciones ubicadas en MVC

- El acceso y cierre de sesión se presentan en `templates/` y `static/`; la autenticación vive en las rutas del controlador.
- El área del perfil se muestra como `Logística` y se conserva en `localStorage` desde `static/app.js`.
- La tabla de Inventario presenta Observación como valor de respaldo para Grupo, omite la columna Observación y no añade una columna Acciones. Al guardar Grupo, el cliente envía también Observación vacía para que el modelo persista ese cambio.
- La eliminación de productos permanece en Nuevo producto; el cliente invoca la ruta administrativa del controlador, que delega la operación al modelo.
- Los ajustes de legibilidad, color y ajuste de texto pertenecen a `static/style.css`; no cambian las entidades ni el formato del libro Excel.

### Límites actuales

- `Controlador/inventory_controller.py` agrupa las rutas de autenticación, inventario, productos y movimientos en un blueprint. `controllers/inventory_controller.py` es una copia alternativa que no se registra desde `app.py`; el controlador activo se mantiene en `Controlador/` para no mover archivos ni cambiar rutas.
- `Modelo/excel_model.py` combina acceso al libro con operaciones de dominio. No se separa en modelos por entidad porque eso implicaría mover código.
- `static/app.js` combina renderizado y coordinación de solicitudes del navegador; no accede directamente a Excel ni a archivos de datos.
- `Vista/` contiene el manejador de errores. En Flask las vistas HTML se sirven desde `templates/`.
- No se crea `Services/` ni `Database/`: la aplicación usa Excel y no tiene una capa de base de datos relacional o un servicio independiente que justifique esas carpetas.
- `inventario.db` se conserva sin cambios; no hay referencias a ese archivo en el código de la aplicación.
- No se movieron archivos de código ni datos. Se actualizaron únicamente los imports para apuntar a la carpeta existente `Modelo/`.

## Requisitos

- Python 3.10 o superior

## Instalacion

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Abre `http://127.0.0.1:5000` en el navegador.

## Acceso por roles

- Administrador: usuario `ADMIN_USERNAME` y contraseña `ADMIN_PASSWORD` (en desarrollo, `admin` / `Nakama2026@`). Puede editar el inventario.
- Visitantes: `OFERTAS` y `OPERACIONES` usan `NakamaSoluciones2026` en desarrollo. Pueden consultar el inventario y ver su valor, pero no editarlo.
- En producción, configura `SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `VISITOR_USERNAMES` (en este caso `OFERTAS,OPERACIONES`) y `VISITOR_PASSWORD` como variables de entorno. Para asignar una contraseña distinta a `OPERACIONES`, configura también `OPERACIONES_PASSWORD`.

## Modulos

- Dashboard con metricas, actividad y alertas de stock.
- Nuevo producto con catalogo persistente.
- Movimientos para registrar entradas y salidas.
- Inventario con estados y exportacion CSV.
- Reportes con indicadores basicos.
- Buscar por nombre, SKU o categoria.
- Configuracion de preferencias de usuario.
