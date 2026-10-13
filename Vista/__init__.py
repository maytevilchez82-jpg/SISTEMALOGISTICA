from flask import Blueprint

views = Blueprint("views", __name__)


@views.app_errorhandler(404)
def not_found(error):
    return {"error": "Recurso no encontrado."}, 404
