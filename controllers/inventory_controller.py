from datetime import datetime

from flask import Blueprint, jsonify, render_template, request, send_file

from models.excel_model import add_movement, add_product, export_products_workbook, get_movements, get_products, read_data

inventory_controller = Blueprint("inventory", __name__)


@inventory_controller.route("/")
def index():
    return render_template("index.html")


@inventory_controller.get("/api/dashboard")
def dashboard():
    products, movements = read_data()
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
def products():
    return jsonify(get_products())


@inventory_controller.get("/api/export")
def export_inventory():
    return send_file(
        export_products_workbook(),
        as_attachment=True,
        download_name=f"inventario-nakama-soluciones-{datetime.now().strftime('%Y-%m-%d')}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@inventory_controller.post("/api/products")
def create_product():
    data = request.get_json() or {}
    if any(not str(data.get(field, "")).strip() for field in ("sku", "name", "unit", "group")):
        return jsonify({"error": "Completa los campos obligatorios."}), 400
    try:
        created, message = add_product(data)
    except (TypeError, ValueError):
        return jsonify({"error": "Stock, minimo y precio deben ser numericos."}), 400
    return jsonify({"message": message}), 201 if created else 409


@inventory_controller.get("/api/movements")
def movements():
    return jsonify(get_movements())


@inventory_controller.post("/api/movements")
def create_movement():
    data = request.get_json() or {}
    try:
        created, message = add_movement(data)
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Movimiento no valido."}), 400
    if not created:
        return jsonify({"error": message}), 404 if message == "Producto no encontrado." else 400
    return jsonify({"message": message}), 201
