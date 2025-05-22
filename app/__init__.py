from flask import Flask
from config import DevelopmentConfig
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect  # Import CSRFProtect

db = SQLAlchemy()
migrate = Migrate()
login = LoginManager()
csrf = CSRFProtect()  # Create CSRFProtect instance

def create_app(config_class=DevelopmentConfig):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login.init_app(app)
    csrf.init_app(app)  # Initialize CSRF protection
    login.login_view = 'auth.login'  # Endpoint for login required redirection

    # Register Blueprints
    from app.routes.main import main as main_blueprint
    from app.routes.auth import auth as auth_blueprint
    app.register_blueprint(main_blueprint)
    app.register_blueprint(auth_blueprint, url_prefix='/auth')

    return app

@login.user_loader
def load_user(user_id):
    # Lazy import of User to avoid circular imports
    from app.models.user import User
    return User.query.get(int(user_id))
