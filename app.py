import os
import secrets

from flask import Flask

from Controlador.inventory_controller import inventory_controller
from Modelo.excel_model import initialize_database
from Vista import views

IS_PRODUCTION = os.getenv("APP_ENV", "development").strip().lower() == "production"
if IS_PRODUCTION:
    missing_settings = [name for name in ("SECRET_KEY", "ADMIN_USERNAME", "ADMIN_PASSWORD", "VISITOR_USERNAMES", "VISITOR_PASSWORD") if not os.getenv(name)]
    if missing_settings:
        raise RuntimeError(f"Configura las variables requeridas para producción: {', '.join(missing_settings)}")
else:
    os.environ.setdefault("ADMIN_USERNAME", "LOGISTICA")
    os.environ.setdefault("ADMIN_PASSWORD", "Nakama2026@")
    os.environ.setdefault("VISITOR_USERNAMES", "OFERTAS,OPERACIONES")
    os.environ.setdefault("VISITOR_PASSWORD", "NakamaSoluciones2026")
    os.environ.setdefault("OPERACIONES_PASSWORD", "NakamaSoluciones2026")

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=IS_PRODUCTION,
)
app.register_blueprint(views)
app.register_blueprint(inventory_controller)

initialize_database()


if __name__ == "__main__":
    
    app.run(host="0.0.0.0", port=5000, debug=False)
