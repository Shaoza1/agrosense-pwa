import os
from flask import send_from_directory, make_response, request, jsonify
from flask_wtf import CSRFProtect
from app import create_app

# Create the Flask app using your factory.
app = create_app()

# Initialize CSRF protection; requires a configured SECRET_KEY.
csrf = CSRFProtect()
csrf.init_app(app)

# Define the project root (e.g., folder containing this file)
ROOT_DIR = os.path.abspath(os.path.dirname(__file__))


def _send_static_file(filename: str, mimetype: str):
    """Helper to serve a file from the project root with caching headers."""
    response = make_response(send_from_directory(ROOT_DIR, filename, mimetype=mimetype))
    # Cache these assets (adjust as needed)
    response.headers['Cache-Control'] = 'public, max-age=86400, immutable'
    return response


# Serve the service worker at /sw.js.
@app.route('/sw.js')
def service_worker():
    return _send_static_file('sw.js', 'application/javascript')


# Serve the web manifest.
@app.route('/manifest.json')
def manifest():
    return _send_static_file('manifest.json', 'application/manifest+json')


# Serve the offline fallback page.
@app.route('/offline.html')
def offline():
    return _send_static_file('offline.html', 'text/html; charset=utf-8')


# Try to import csrf_exempt; if not available, define a fallback.
try:
    from flask_wtf.csrf import csrf_exempt
except ImportError:
    def csrf_exempt(view):
        view.csrf_exempt = True
        return view


# API endpoint for push subscriptions.
@app.route('/api/subscribe', methods=['POST'])
@csrf_exempt  # Exempt API endpoints from CSRF; they use JSON.
def subscribe():
    subscription = request.get_json()
    # Here, save the subscription as needed (e.g., store in your database).
    return jsonify({'status': 'success'}), 200


# A test API endpoint.
@app.route('/api/test', methods=['GET'])
def api_test():
    import datetime
    return jsonify({
        "message": "Hello from API!",
        "timestamp": datetime.datetime.now().isoformat()
    })


if __name__ == '__main__':
    # Use a proper WSGI server for production.
    app.run(host='0.0.0.0', port=5000, debug=True)