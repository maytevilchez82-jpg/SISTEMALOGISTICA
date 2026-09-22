from flask import Flask

from controllers.inventory_controller import inventory_controller
from models.excel_model import initialize_database
from views import views

app = Flask(__name__, template_folder="templates", static_folder="static")
app.register_blueprint(views)
app.register_blueprint(inventory_controller)

initialize_database()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
