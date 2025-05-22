from flask import Blueprint, render_template, request, redirect, url_for, flash, current_app
from flask_login import current_user, login_required
from app import db
from app.models.crop import Crop
import datetime
from datetime import date
import requests

main = Blueprint('main', __name__)

@main.route('/')
def index():
    # Retrieve the user's crops (if using lazy='dynamic', call .all())
    user_crops = current_user.crops.all() if current_user.is_authenticated else []

    # ----- Detect User Location Dynamically -----
    # First, try query parameters: ?lat=...&lon=...
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    if lat and lon:
        try:
            lat = float(lat)
            lon = float(lon)
        except ValueError:
            lat, lon = None, None

    # If not provided or invalid, try using IP-based geolocation.
    if not (lat and lon):
        try:
            # X-Forwarded-For is checked first for proxied requests.
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)
            geo_url = f"https://ipapi.co/{ip}/json/"
            geo_response = requests.get(geo_url, timeout=3)
            geo_data = geo_response.json()
            lat = geo_data.get('latitude')
            lon = geo_data.get('longitude')
        except Exception as e:
            current_app.logger.error(f"IP-based geolocation failed: {e}")

    # If geolocation still isn't available, fall back to a default (Maseru, Lesotho).
    if not (lat and lon):
        lat, lon = -29.3167, 27.4833

    # ----- Fetch Real-Time 7-Day Weather Data -----
    API_KEY = current_app.config.get('OPENWEATHER_API_KEY')
    daily_forecasts = None
    if not API_KEY or API_KEY == 'your_default_openweather_api_key_change_me':
        current_app.logger.error("OpenWeather API key is not set correctly. Falling back to default weather data.")
    else:
        onecall_url = (f"https://api.openweathermap.org/data/2.5/onecall?"
                       f"lat={lat}&lon={lon}&exclude=current,minutely,hourly,alerts&units=metric&appid={API_KEY}")
        try:
            response = requests.get(onecall_url, timeout=5)
            response.raise_for_status()
            data = response.json()
            daily_forecasts = data.get("daily", [])
        except Exception as e:
            current_app.logger.error(f"Error fetching 7-day weather data: {e}")

    # Build the 7-day forecast list.
    if daily_forecasts and len(daily_forecasts) >= 7:
        forecast = []
        today_date = date.today()
        for day in daily_forecasts[:7]:
            # Convert API timestamp to a date object.
            day_date = datetime.datetime.fromtimestamp(day['dt']).date()
            # Label as "Today" if the date matches today's date.
            day_label = "Today" if day_date == today_date else datetime.datetime.fromtimestamp(day['dt']).strftime("%a")
            high = f"{round(day['temp']['max'])}°C"
            low = f"{round(day['temp']['min'])}°C"
            condition = day['weather'][0]['description'].capitalize()
            icon_code = day['weather'][0]['icon']
            # Map OpenWeatherMap icon codes to Font Awesome icons.
            if icon_code.startswith('01'):
                icon_class = "fas fa-sun"
            elif icon_code.startswith('02'):
                icon_class = "fas fa-cloud-sun"
            elif icon_code.startswith('03') or icon_code.startswith('04'):
                icon_class = "fas fa-cloud"
            elif icon_code.startswith('09') or icon_code.startswith('10'):
                icon_class = "fas fa-cloud-rain"
            elif icon_code.startswith('11'):
                icon_class = "fas fa-bolt"
            elif icon_code.startswith('13'):
                icon_class = "fas fa-snowflake"
            elif icon_code.startswith('50'):
                icon_class = "fas fa-smog"
            else:
                icon_class = "fas fa-sun"
            forecast.append({
                "label": day_label,
                "icon_class": icon_class,
                "high": high,
                "low": low,
                "condition": condition
            })
        # Use the first day's forecast for summary current weather.
        today = daily_forecasts[0]
        temperature = f"{round(today['temp']['day'])}°C"
        humidity = f"{today['humidity']}%"
        wind = f"{today['wind_speed']} km/h"
        condition = today['weather'][0]['description'].capitalize()
    else:
        # Fallback default weather data.
        forecast = [
            {"label": "Today", "icon_class": "fas fa-sun", "high": "28°C", "low": "18°C", "condition": "Sunny"},
            {"label": "Thu", "icon_class": "fas fa-cloud-sun", "high": "26°C", "low": "17°C", "condition": "Partly Cloudy"},
            {"label": "Fri", "icon_class": "fas fa-sun", "high": "28°C", "low": "18°C", "condition": "Sunny"},
            {"label": "Sat", "icon_class": "fas fa-cloud-rain", "high": "25°C", "low": "16°C", "condition": "Rainy"},
            {"label": "Sun", "icon_class": "fas fa-sun", "high": "29°C", "low": "19°C", "condition": "Sunny"},
            {"label": "Mon", "icon_class": "fas fa-cloud", "high": "27°C", "low": "17°C", "condition": "Cloudy"},
            {"label": "Tue", "icon_class": "fas fa-sun", "high": "30°C", "low": "20°C", "condition": "Sunny"}
        ]
        temperature = "28°C"
        humidity = "65%"
        wind = "12 km/h"
        condition = "Sunny"

    # Build the complete weather context.
    weather = {
        "locations": [
            {"id": 1, "name": "My Farm Location"},
            {"id": 2, "name": "Secondary Field"}
        ],
        "forecast": forecast,
        "advisory": "Heavy rain expected on Thursday (15mm)",
        "temperature": temperature,
        "humidity": humidity,
        "wind": wind,
        "condition": condition
    }

    current_date = datetime.datetime.now().strftime("%A, %B %d, %Y")
    return render_template('index.html', crops=user_crops, weather=weather, current_date=current_date)


@main.route('/add_crop', methods=['GET', 'POST'])
@login_required
def add_crop():
    if request.method == "POST":
        name = request.form.get("name")
        planted_date_str = request.form.get("planted_date")
        health_status = request.form.get("health_status")

        if not name or not health_status:
            flash("Crop name and health status are required.", "error")
            return redirect(url_for('main.add_crop'))

        try:
            if planted_date_str:
                pd = datetime.datetime.strptime(planted_date_str, "%Y-%m-%d").date()
            else:
                pd = date.today()
        except ValueError:
            pd = date.today()

        new_crop = Crop(name=name, planted_date=pd, health_status=health_status, user_id=current_user.id)
        db.session.add(new_crop)
        db.session.commit()
        flash("Crop added successfully!", "success")
        return redirect(url_for('main.index'))

    return render_template('add_crop.html')