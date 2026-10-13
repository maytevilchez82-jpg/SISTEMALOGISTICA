# Despliegue público

La aplicación conserva los archivos y carpetas actuales. Para publicarla en un servicio Linux compatible con discos persistentes:

1. Configura estas variables de entorno en el panel del hosting:
   - `APP_ENV=production`
   - `SECRET_KEY`: valor aleatorio y privado, por ejemplo generado con `python -c "import secrets; print(secrets.token_hex(32))"`.
   - `ADMIN_PASSWORD`: contraseña fuerte para el administrador.
   - `VISITOR_USERNAMES=OFERTAS,OPERACIONES` y `VISITOR_PASSWORD`: cuentas visitantes y contraseña compartida.
   - `OPERACIONES_PASSWORD`: opcional, para asignar a `OPERACIONES` una contraseña distinta a la compartida.
   - `EXCEL_PATH=/var/data/inventario.xlsx`, ajustando `/var/data` al punto de montaje del disco persistente.
2. Comando de instalación: `pip install -r requirements.txt`.
3. Comando de inicio: `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 1 app:app`.
4. Monta un disco persistente en la ruta configurada y ejecuta una sola instancia. El libro Excel no está preparado para escrituras concurrentes entre varios procesos o instancias.
5. Conserva copias de seguridad del Excel antes de importar. La importación sincroniza por SKU: actualiza los existentes, agrega nuevos y quita del inventario los productos que no vengan en el archivo; los movimientos se conservan.

## Acceso a datos

Antes de publicar datos privados, protege también las rutas de consulta y exportación. Por ejemplo, `GET /api/products` y `GET /api/export` no exigen sesión de administrador actualmente. Las rutas de modificación e importación sí verifican el rol administrativo.
