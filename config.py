import os


class Config:
    # SECRET_KEY is used to secure sessions and CSRF tokens.
    # In production, set the environment variable SECRET_KEY to a strong, unique value.
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your_default_secret_key_change_me'

    # Database URI: Using SQLite for development.
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///agrosense.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    DEBUG = False

    # OpenWeatherMap API key.
    # In production, set the environment variable OPENWEATHER_API_KEY to your production API key.
    OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY') or 'your_default_openweather_api_key_change_me'


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False