# Qaso System

Sistema de inventario construido con metodologia en cascada, Python, Flask, Excel, HTML, CSS y JavaScript.

Los datos se almacenan en `inventario.xlsx`, con las hojas `Productos` y `Movimientos`. El archivo se crea automaticamente al iniciar por primera vez.

## Estructura MVC

- `models/excel_model.py`: lectura, escritura y reglas de persistencia del archivo Excel.
- `controllers/inventory_controller.py`: rutas Flask, validaciones y respuestas de la API.
- `views/`: configuracion de la capa de vistas y errores HTTP.
- `templates/`: vista HTML principal.
- `static/`: estilos CSS y comportamiento JavaScript.
- `app.py`: punto de entrada y registro de componentes.

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

## Modulos

- Dashboard con metricas, actividad y alertas de stock.
- Nuevo producto con catalogo persistente.
- Movimientos para registrar entradas y salidas.
- Inventario con estados y exportacion CSV.
- Reportes con indicadores basicos.
- Buscar por nombre, SKU o categoria.
- Configuracion de preferencias de usuario.
