from datetime import datetime
from io import BytesIO
from functools import wraps
import os
import secrets
import unicodedata
from zipfile import BadZipFile

from flask import Blueprint, jsonify, render_template, request, send_file, session
from openpyxl.utils.exceptions import InvalidFileException
from PIL import Image

from Modelo.excel_model import _movement_datetime, add_movement, add_product, delete_movement, delete_product, export_movements_workbook, export_products_workbook, get_movements, get_products, import_products_workbook, read_data, update_movement, update_product

inventory_controller = Blueprint("inventory", __name__)


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if session.get("role") != "admin":
            return jsonify({"error": "Inicia sesión como administrador para realizar esta acción."}), 403
        return view(*args, **kwargs)
    return wrapped


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if session.get("role") not in ("admin", "visitor"):
            return jsonify({"error": "Inicia sesión para consultar el inventario."}), 401
        return view(*args, **kwargs)
    return wrapped


def visitor_usernames():
    return [name.strip() for name in os.environ.get("VISITOR_USERNAMES", "").split(",") if name.strip()]


def dashboard_allowed():
    if session.get("role") == "admin":
        return True
    visitor_username = session.get("visitor_username", "").casefold()
    return session.get("role") == "visitor" and bool(visitor_username) and visitor_username != "ofertas"


@inventory_controller.get("/")
@inventory_controller.get("/login")
def login_page():
    return render_template("login.html")


@inventory_controller.get("/inventario")
def index():
    if session.get("role") not in ("admin", "visitor"):
        return render_template("login.html"), 401
    return render_template("index.html", can_view_dashboard=dashboard_allowed())


@inventory_controller.get("/api/session")
def session_status():
    return jsonify({
        "role": session.get("role") if session.get("role") in ("admin", "visitor") else "public",
        "can_view_dashboard": dashboard_allowed(),
        "admin_configured": bool(os.environ.get("ADMIN_USERNAME") and os.environ.get("ADMIN_PASSWORD")),
        "visitor_configured": bool(visitor_usernames() and os.environ.get("VISITOR_PASSWORD")),
    })


@inventory_controller.post("/api/login")
def admin_login():
    data = request.get_json(silent=True) or {}
    supplied_username = str(data.get("username", ""))
    supplied_password = str(data.get("password", ""))
    admin_username = os.environ.get("ADMIN_USERNAME")
    admin_password = os.environ.get("ADMIN_PASSWORD")
    visitor_names = visitor_usernames()
    visitor_password = os.environ.get("VISITOR_PASSWORD")
    admin_matches = bool(admin_username and admin_password) and secrets.compare_digest(supplied_username, admin_username) and secrets.compare_digest(supplied_password, admin_password)
    matched_visitor = next((name for name in visitor_names if secrets.compare_digest(supplied_username.casefold(), name.casefold())), None)
    if matched_visitor and matched_visitor.casefold() == "operaciones":
        visitor_password = os.environ.get("OPERACIONES_PASSWORD") or visitor_password
    visitor_matches = bool(matched_visitor and visitor_password) and secrets.compare_digest(supplied_password, visitor_password)
    if admin_matches:
        requested_role = "admin"
    elif visitor_matches:
        requested_role = "visitor"
    elif not (admin_username and admin_password) and not (visitor_names and visitor_password):
        return jsonify({"error": "El acceso no está configurado en el servidor."}), 503
    else:
        return jsonify({"error": "Usuario o contraseña incorrectos."}), 401
    session.clear()
    session["role"] = requested_role
    if requested_role == "visitor":
        session["visitor_username"] = matched_visitor
    return jsonify({"role": requested_role})


@inventory_controller.post("/api/logout")
def admin_logout():
    session.clear()
    return jsonify({"role": "public"})


@inventory_controller.get("/api/dashboard")
@login_required
def dashboard():
    if not dashboard_allowed():
        return jsonify({"error": "No tienes permiso para consultar el dashboard."}), 403
    products = get_products()
    _, movements = read_data()
    products_by_id = {product["id"]: product for product in products}
    recent_movements = []
    for movement in sorted(movements, key=lambda item: item["id"], reverse=True)[:6]:
        product = products_by_id.get(movement["product_id"], {})
        recent_movements.append({**movement, "product_name": product.get("name", "Producto eliminado"), "sku": product.get("sku", "")})
    return jsonify({
        "products": len(products),
        "units": sum(product["stock"] for product in products),
        "low_stock": sum(product["stock"] <= product["min_stock"] for product in products),
        "inventory_value": round(sum(product["stock"] * product["price"] for product in products), 2),
        "movements": recent_movements,
    })


@inventory_controller.get("/api/products")
@login_required
def products():
    if request.args.get("all") == "1":
        inventory_products, _ = read_data()
        return jsonify(inventory_products)
    return jsonify(get_products())


@inventory_controller.post("/api/import")
@admin_required
def import_inventory():
    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        return jsonify({"error": "Selecciona un archivo Excel."}), 400
    if not uploaded_file.filename.lower().endswith((".xlsx", ".xlsm", ".xlsb")):
        return jsonify({"error": "El archivo debe tener formato .xlsx, .xlsm o .xlsb."}), 400
    try:
        imported_count = import_products_workbook(uploaded_file)
    except (BadZipFile, InvalidFileException, OSError, KeyError):
        return jsonify({"error": "No se pudo leer el archivo Excel."}), 400
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except (TypeError, OverflowError):
        return jsonify({"error": "Revisa que las cantidades y precios del Excel sean numericos."}), 400
    return jsonify({"message": "Inventario importado correctamente.", "count": imported_count})


@inventory_controller.get("/api/export")
@login_required
def export_inventory():
    return send_file(
        export_products_workbook(),
        as_attachment=True,
        download_name=f"inventario-nakama-soluciones-{datetime.now().strftime('%Y-%m-%d')}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@inventory_controller.get("/api/export-movements")
@login_required
def export_movements():
    try:
        month = int(request.args["month"]) if request.args.get("month") else None
        year = int(request.args["year"]) if request.args.get("year") else None
    except ValueError:
        return jsonify({"error": "El mes o el año no son válidos."}), 400
    if month is not None and not 1 <= month <= 12:
        return jsonify({"error": "El mes debe estar entre 1 y 12."}), 400
    if year is not None and not 1 <= year <= 9999:
        return jsonify({"error": "El año no es válido."}), 400
    period = "-".join(str(value) for value in (year, f"{month:02d}" if month else None) if value is not None)
    file_name = f"entradas-y-salidas{f'-{period}' if period else ''}-{datetime.now().strftime('%Y-%m-%d')}.xlsx"
    return send_file(
        export_movements_workbook(month=month, year=year),
        as_attachment=True,
        download_name=file_name,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _pdf_text(value):
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _movement_report_pdf(movements, month=None, year=None):
    page_width, page_height = 792, 612
    logo_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "NAKAMA LOGO 1.jpeg")
    with Image.open(logo_path) as logo:
        logo_width_px, logo_height_px = logo.size
    with open(logo_path, "rb") as logo_file:
        logo_bytes = logo_file.read()
    logo_width = 120
    logo_height = logo_width * logo_height_px / logo_width_px
    columns = [(36, 30), (66, 65), (131, 164), (295, 62), (357, 48), (405, 54), (459, 68), (527, 164), (691, 65)]
    headers = ["ID", "CODIGO", "PRODUCTO", "TIPO", "CANT.", "PISO", "LOCKER", "NOTA", "FECHA"]
    month_names = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    period = " / ".join(value for value in (month_names[month] if month else "", str(year) if year else "") if value)
    rows = [[movement.get("id"), movement.get("sku"), movement.get("product_name"), movement.get("movement_type"), movement.get("quantity"), movement.get("floor"), movement.get("location"), movement.get("note"), str(movement.get("created_at", ""))[:10]] for movement in movements]
    rows = rows or [["", "", "Sin movimientos para este periodo", "", "", "", "", "", ""]]
    page_chunks = [rows[index:index + 22] for index in range(0, len(rows), 22)]
    streams = []
    for page_number, page_rows in enumerate(page_chunks, start=1):
        commands = [
            "0.05 0.25 0.36 rg 36 594 720 3 re f",
            f"q {logo_width:.2f} 0 0 {logo_height:.2f} 36 555 cm /Im1 Do Q",
            f"BT /F1 18 Tf 174 574 Td ({_pdf_text('REPORTE DE MOVIMIENTOS')}) Tj ET",
            f"BT /F1 9 Tf 174 550 Td ({_pdf_text('Periodo: ' + (period or 'Todos los movimientos'))}) Tj ET",
            f"BT /F1 9 Tf 520 550 Td ({_pdf_text('Generado: ' + datetime.now().strftime('%d/%m/%Y'))}) Tj ET",
            "0.05 0.25 0.36 rg 36 486 720 20 re f",
        ]
        for (x, width), label in zip(columns, headers):
            commands.append(f"1 1 1 rg BT /F1 7 Tf {x + 3} 493 Td ({_pdf_text(label)}) Tj ET")
        for row_index, row in enumerate(page_rows):
            y = 467 - row_index * 19
            if row_index % 2 == 0:
                commands.append(f"0.95 0.97 0.98 rg 36 {y - 5} 720 19 re f")
            for column_index, ((x, width), value) in enumerate(zip(columns, row)):
                limit = max(5, int((width - 6) / 4.2))
                value = str(value or "").replace("\r", " ").replace("\n", " ")[:limit]
                commands.append(f"0.08 0.12 0.15 rg BT /F1 7 Tf {x + 3} {y} Td ({_pdf_text(value)}) Tj ET")
        commands.extend([
            "0.78 0.84 0.87 RG 36 486 m 756 486 l S",
            f"0.35 0.42 0.46 rg BT /F1 8 Tf 36 25 Td ({_pdf_text(f'{len(movements)} movimientos  |  Pagina {page_number} de {len(page_chunks)}')}) Tj ET",
        ])
        streams.append("\n".join(commands).encode("ascii"))

    image_object = (
        f"<< /Type /XObject /Subtype /Image /Width {logo_width_px} /Height {logo_height_px} "
        f"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {len(logo_bytes)} >>\nstream\n"
    ).encode("ascii") + logo_bytes + b"\nendstream"
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", None, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", image_object]
    page_ids = []
    for index, stream in enumerate(streams):
        page_id, stream_id = 5 + index * 2, 6 + index * 2
        page_ids.append(page_id)
        objects.extend([
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> /Contents {stream_id} 0 R >>".encode("ascii"),
            f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream",
        ])
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {len(page_ids)} >>".encode("ascii")
    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_id, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{object_id} 0 obj\n".encode("ascii") + body + b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode("ascii"))
    return bytes(pdf)


@inventory_controller.get("/api/export-movements-pdf")
@login_required
def export_movements_pdf():
    try:
        month = int(request.args["month"]) if request.args.get("month") else None
        year = int(request.args["year"]) if request.args.get("year") else None
    except ValueError:
        return jsonify({"error": "El mes o el año no son válidos."}), 400
    if month is not None and not 1 <= month <= 12:
        return jsonify({"error": "El mes debe estar entre 1 y 12."}), 400
    if year is not None and not 1 <= year <= 9999:
        return jsonify({"error": "El año no es válido."}), 400
    movements = get_movements()
    if month is not None or year is not None:
        movements = [movement for movement in movements if (movement_date := _movement_datetime(movement.get("created_at"))) is not None and (month is None or movement_date.month == month) and (year is None or movement_date.year == year)]
    period = "-".join(str(value) for value in (year, f"{month:02d}" if month else None) if value is not None)
    file_name = f"reporte-movimientos{f'-{period}' if period else ''}-{datetime.now().strftime('%Y-%m-%d')}.pdf"
    return send_file(BytesIO(_movement_report_pdf(movements, month, year)), as_attachment=True, download_name=file_name, mimetype="application/pdf")


@inventory_controller.post("/api/products")
@admin_required
def create_product():
    data = request.get_json() or {}
    if any(not str(data.get(field, "")).strip() for field in ("sku", "name", "unit", "group")):
        return jsonify({"error": "Completa los campos obligatorios."}), 400
    try:
        created, message = add_product(data)
    except (TypeError, ValueError):
        return jsonify({"error": "Stock, minimo y precio deben ser numericos."}), 400
    return jsonify({"message": message}), 201 if created else 409


@inventory_controller.put("/api/products/<int:product_id>")
@admin_required
def edit_product(product_id):
    data = request.get_json() or {}
    try:
        updated, message = update_product(product_id, data)
    except (TypeError, ValueError, OverflowError):
        return jsonify({"error": "Revisa los datos: stock, minimo y precio deben ser validos."}), 400
    if not updated:
        return jsonify({"error": message}), 404 if message == "Producto no encontrado." else 409
    return jsonify({"message": message})


@inventory_controller.delete("/api/products/<int:product_id>")
@admin_required
def remove_product(product_id):
    try:
        deleted, message = delete_product(product_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Producto no valido."}), 400
    if not deleted:
        return jsonify({"error": message}), 404
    return jsonify({"message": message})


@inventory_controller.get("/api/movements")
@login_required
def movements():
    return jsonify(get_movements())


@inventory_controller.post("/api/movements")
@admin_required
def create_movement():
    data = request.get_json() or {}
    try:
        created, message = add_movement(data)
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Movimiento no valido."}), 400
    if not created:
        return jsonify({"error": message}), 404 if message == "Producto no encontrado." else 400
    return jsonify({"message": message}), 201


@inventory_controller.delete("/api/movements/<int:movement_id>")
@admin_required
def remove_movement(movement_id):
    try:
        deleted, message = delete_movement(movement_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Movimiento no valido."}), 400
    if not deleted:
        return jsonify({"error": message}), 404 if message in ("Movimiento no encontrado.", "Producto no encontrado.") else 400
    return jsonify({"message": message})


@inventory_controller.put("/api/movements/<int:movement_id>")
@admin_required
def edit_movement(movement_id):
    data = request.get_json() or {}
    try:
        updated, message = update_movement(movement_id, data)
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Movimiento no valido."}), 400
    if not updated:
        return jsonify({"error": message}), 404 if message in ("Movimiento no encontrado.", "Producto no encontrado.") else 400
    return jsonify({"message": message})
