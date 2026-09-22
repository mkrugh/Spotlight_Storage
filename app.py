# Importing necessary modules and packages
from concurrent.futures import ThreadPoolExecutor
import ipaddress
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.parse
import uuid
from flask import Flask, render_template, jsonify, request, send_from_directory, url_for, Response

import db
import requests
from werkzeug.utils import secure_filename

# Creating a Flask application instance
app = Flask(__name__)
if hasattr(app, 'json') and hasattr(app.json, 'sort_keys'):
    app.json.sort_keys = False
else:
    app.config['JSON_SORT_KEYS'] = False

# Default Values
app.brightness = 1
app.delSegments = ""
app.timeout = 5
app.standbyColor = "#00ff00"
app.locateColor = "#00ff00"
app.config['UPLOAD_FOLDER'] = './images'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB upload limit
app.previous_positions = {}  # last located LED positions, per ESP IP
app.off_timers = {}  # pending turn-off timers, per ESP IP
app.state_lock = threading.Lock()  # thread-safe lock for concurrent WSGI threads
app.request_amount = 0

# Initialize database schema and indexes once at app startup
try:
    db.init_db()
except Exception as e:
    print(f"Notice: initial db.init_db() deferred or bypassed: {e}")

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_PROXY_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB proxy buffer limit


def is_safe_public_url(url: str, is_testing: bool = False) -> bool:
    """Validate that URL points to a public, non-private/loopback address to prevent SSRF."""
    if not url:
        return False
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False

        hostname_lower = hostname.lower()
        if hostname_lower in ('localhost', '127.0.0.1', '::1', '0.0.0.0'):
            return False

        # Direct IP address validation (handles IPv6, standard IPv4, and alternative IPv4 encodings)
        ip_obj = None
        try:
            ip_obj = ipaddress.ip_address(hostname)
        except ValueError:
            try:
                ip_obj = ipaddress.ip_address(socket.inet_aton(hostname))
            except (OSError, ValueError):
                pass

        if ip_obj:
            if hasattr(ip_obj, 'ipv4_mapped') and ip_obj.ipv4_mapped:
                ip_obj = ip_obj.ipv4_mapped
            if (ip_obj.is_private or ip_obj.is_loopback or
                ip_obj.is_link_local or ip_obj.is_multicast or
                ip_obj.is_reserved or ip_obj.is_unspecified):
                return False
            return True

        # In testing environments, skip live outbound DNS lookup for external domains
        if is_testing:
            if hostname_lower.endswith(('.local', '.lan', '.internal', '.localdomain', '.home')):
                return False
            return True

        # Resolve hostname via DNS to ensure all target IPs are public
        addr_info = socket.getaddrinfo(hostname, None)
        for entry in addr_info:
            ip_str = entry[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if hasattr(ip_obj, 'ipv4_mapped') and ip_obj.ipv4_mapped:
                ip_obj = ip_obj.ipv4_mapped
            if (ip_obj.is_private or ip_obj.is_loopback or
                ip_obj.is_link_local or ip_obj.is_multicast or
                ip_obj.is_reserved or ip_obj.is_unspecified):
                return False
        return True
    except Exception:
        return False


@app.after_request
def set_security_headers(response):
    """Add defensive security headers to all HTTP responses."""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://code.jquery.com https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; "
        "img-src 'self' data: https: http: blob:; "
        "font-src 'self' https://cdn.jsdelivr.net; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "frame-ancestors 'self';"
    )
    return response


@app.route('/proxy-image', methods=['GET'])
def proxy_image():
    image_url = request.args.get('url', '')
    if not image_url.startswith(('http://', 'https://')):
        return jsonify({'error': 'Invalid URL'}), 400

    if not is_safe_public_url(image_url, app.config.get('TESTING', False)):
        return jsonify({'error': 'Invalid URL or restricted host'}), 400

    try:
        response = requests.get(image_url, timeout=5, stream=True, allow_redirects=False)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error proxying image: {e}")
        return jsonify({'error': 'Could not fetch image'}), 502

    content_type = response.headers.get('Content-Type', '').lower()
    # Enforce image MIME types and explicitly disallow SVG to prevent script execution (XSS)
    if not content_type.startswith('image/') or 'svg' in content_type:
        return jsonify({'error': 'URL does not point to an image'}), 400

    # Validate Content-Length header if provided
    content_length = response.headers.get('Content-Length')
    if content_length:
        try:
            if int(content_length) > MAX_PROXY_IMAGE_SIZE:
                return jsonify({'error': 'Image exceeds maximum allowed size'}), 400
        except ValueError:
            pass

    content = getattr(response, 'content', b'')
    if len(content) > MAX_PROXY_IMAGE_SIZE:
        return jsonify({'error': 'Image exceeds maximum allowed size'}), 400

    return Response(content, content_type=content_type)


# Route to Favicon
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(app.root_path, 'favicon.ico', mimetype='image/vnd.microsoft.icon')


# Route to the home page of the web application
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/images/<name>')
def download_image(name):
    return send_from_directory(app.config["UPLOAD_FOLDER"], name)


@app.route('/upload', methods=['POST'])
def upload_file():
    # check if the post request has the file part
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    # If the user does not select a file, the browser submits an
    # empty file without a filename.
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    clean_name = os.path.basename(file.filename.replace('\\', '/'))
    filename = secure_filename(clean_name)
    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if not filename or extension not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({'error': 'File type not allowed'}), 400

    # Prefix with UUID to prevent overwriting existing files
    unique_filename = f"{uuid.uuid4().hex}_{filename}"
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
    return url_for('download_image', name=unique_filename)


@app.route('/api/tags', methods=['GET', 'POST'])
def tags():
    if request.method == 'GET':
        try:
            tag_data = db.get_all_tags()  # Fetch ESP data from the database
            return jsonify(tag_data), 200
        except Exception as e:
            print(f"Error fetching Tag data: {e}")  # Log the error for debugging
            return jsonify({"error": "An error occurred fetching Tag data"}), 500


def get_unique_ips_from_database():
    # Get all items from the database
    ips = db.read_esp()
    # Create a set to store unique IP addresses
    unique_ips = set()
    # Iterate through the items and extract unique IPs
    for ip in ips:
        ip = ip.get('esp_ip')
        if ip:
            unique_ips.add(ip)
    # Convert the set of unique IPs back to a list (if needed)
    unique_ips_list = list(unique_ips)

    return unique_ips_list


def is_valid_url_or_ip(input_str):
    if not input_str or not isinstance(input_str, str):
        return False
    parts = input_str.strip().split(':')
    if len(parts) > 2:
        return False
    host = parts[0]
    if len(parts) == 2:
        try:
            port = int(parts[1])
            if port < 1 or port > 65535:
                return False
        except ValueError:
            return False

    ip_pattern = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")
    if ip_pattern.match(host):
        octets = host.split('.')
        return all(0 <= int(o) <= 255 for o in octets)

    url_pattern = re.compile(r"^([a-zA-Z0-9-]+)\.([a-zA-Z0-9.-]+)$")
    return bool(url_pattern.match(host))


def is_safe_esp_target(input_str: str) -> bool:
    """Validate that target IP/host is safe for ESP connection test (blocks loopback, cloud metadata, link-local)."""
    if not input_str or not isinstance(input_str, str):
        return False
    parts = input_str.strip().split(':')
    host = parts[0].strip().lower()

    if host in ('localhost', '127.0.0.1', '::1', '0.0.0.0'):
        return False

    try:
        ip_obj = ipaddress.ip_address(host)
        if ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_multicast or ip_obj.is_unspecified:
            return False
        # Explicit check for cloud metadata service
        if str(ip_obj) == '169.254.169.254':
            return False
    except ValueError:
        # Hostname (e.g. wled.local, esp32.lan)
        if host.startswith('127.') or host == 'localhost':
            return False

    return True



def get_current_settings():
    """Read settings from database in a thread-safe manner, returning a dict of active values."""
    settings = db.read_settings() or {}
    brightness = (settings.get('brightness', 100) or 100) / 100
    timeout = settings.get('timeout', 5) or 5
    colors = settings.get('colors') or ["#00ff00", "#00ff00"]
    standby_color = colors[0] if isinstance(colors, list) and len(colors) >= 1 else "#00ff00"
    locate_color = colors[1] if isinstance(colors, list) and len(colors) >= 2 else "#00ff00"

    with app.state_lock:
        app.brightness = brightness
        app.timeout = timeout
        app.standbyColor = standby_color
        app.locateColor = locate_color

    return {
        'brightness': brightness,
        'timeout': timeout,
        'standbyColor': standby_color,
        'locateColor': locate_color
    }


def set_global_settings():
    """Update global settings cache in a thread-safe manner."""
    return get_current_settings()


@app.route('/api/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'GET':
        # If the request method is GET, read data from the database and return as JSON
        return jsonify(db.read_settings())
    elif request.method == 'POST':
        data = request.get_json(silent=True)
        if not data or not isinstance(data, dict):
            return jsonify({'error': 'Invalid JSON body'}), 400
        required_fields = ['brightness', 'timeout', 'lightMode', 'colors', 'language']
        if not all(k in data for k in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
        try:
            db.update_settings(data)  # Update settings in the database
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': f'Failed to update settings: {e}'}), 400


def validate_esp_dimensions(data):
    """Ensure rows and cols do not exceed safe operational bounds to prevent DoS."""
    if not isinstance(data, dict):
        return False, "Invalid payload format"
    sections = data.get('sections')
    if isinstance(sections, list) and len(sections) > 0:
        if len(sections) > 50:
            return False, "Exceeded maximum sections limit (50)"
        for idx, sec in enumerate(sections):
            if isinstance(sec, dict):
                r = sec.get('rows', 1)
                c = sec.get('cols', 1)
                try:
                    r, c = int(r), int(c)
                except (ValueError, TypeError):
                    return False, f"Invalid dimension numbers in section {idx+1}"
                if r <= 0 or c <= 0 or r > 100 or c > 100 or (r * c) > 10000:
                    return False, f"Section {idx+1} dimensions out of safe bounds (max 100x100, 10000 total)"
    else:
        r = data.get('rows')
        c = data.get('cols')
        if r is not None and c is not None:
            try:
                r, c = int(r), int(c)
            except (ValueError, TypeError):
                return False, "Invalid dimension numbers"
            if r <= 0 or c <= 0 or r > 100 or c > 100 or (r * c) > 10000:
                return False, "Dimensions out of safe bounds (max 100x100, 10000 total)"
    return True, None


@app.route('/api/esp', methods=['GET', 'POST'])
@app.route('/api/esp/', methods=['GET', 'POST'])
def esps():
    if request.method == 'GET':
        try:
            esps_data = db.read_esp()  # Fetch ESP data from the database
            return jsonify(esps_data), 200
        except Exception as e:
            print(f"Error fetching ESP data: {e}")  # Log the error for debugging
            return jsonify({"error": "An error occurred fetching ESP data"}), 500

    elif request.method == 'POST':
        try:
            esp_data = request.get_json(silent=True)
            if not esp_data or not isinstance(esp_data, dict):
                return jsonify({"error": "No data provided"}), 400

            is_valid, err = validate_esp_dimensions(esp_data)
            if not is_valid:
                return jsonify({"error": err}), 400

            id = db.write_esp_settings(esp_data)
            if id is None:
                raise ValueError("Failed to write ESP settings")

            esp_data['id'] = id
            return jsonify(esp_data), 201
        except Exception as e:
            print(f"Error on writing ESP data: {e}")  # Log the error
            return jsonify({"error": "An error occurred writing ESP data"}), 500

    else:
        return jsonify({"error": "Method not allowed"}), 405


def double_flash_esp(target_ip):
    """
    Executes a double-flash pulse sequence: 1s ON, 1s OFF, 1s ON, OFF/restore.
    Runs asynchronously in a background thread so client response is not delayed.
    """
    try:
        prev_state = None
        try:
            r = requests.get(f"http://{target_ip}/json/state", timeout=1.5)
            if r.status_code == 200:
                prev_state = r.json()
        except Exception:
            pass

        flash_on = {"on": True, "bri": 180, "transition": 0}
        flash_off = {"on": False, "transition": 0}

        # Pulse 1: 1s on, 1s off
        send_request(target_ip, flash_on)
        time.sleep(1.0)
        send_request(target_ip, flash_off)
        time.sleep(1.0)

        # Pulse 2: 1s on, then off or restore
        send_request(target_ip, flash_on)
        time.sleep(1.0)

        if prev_state and prev_state.get('on'):
            send_request(target_ip, {
                "on": True,
                "bri": prev_state.get('bri', 128),
                "transition": 0
            })
        else:
            send_request(target_ip, flash_off)
    except Exception as e:
        print(f"Error during double-flash on {target_ip}: {e}")


@app.route('/api/esp/test', methods=['POST'])
@app.route('/api/esp/test/', methods=['POST'])
def test_esp_connection():
    data = request.get_json(silent=True) or {}
    ip = (data.get('ip') or data.get('esp_ip') or '').strip()

    if not ip:
        return jsonify({"success": False, "error": "IP address or hostname is required."}), 400

    if not is_valid_url_or_ip(ip):
        return jsonify({"success": False, "error": f"'{ip}' is not a valid IP address or hostname format."}), 400

    if not is_safe_esp_target(ip):
        return jsonify({"success": False, "error": f"'{ip}' is not an allowed target IP address or hostname."}), 400

    try:
        url = f"http://{ip}/json/info"
        response = requests.get(url, timeout=3.0)

        if response.status_code != 200:
            return jsonify({
                "success": False,
                "error": f"Device responded with HTTP status {response.status_code}, expected 200 OK."
            }), 200

        try:
            info = response.json()
        except (ValueError, json.JSONDecodeError):
            return jsonify({
                "success": False,
                "error": f"Device at {ip} responded, but did not return valid JSON. It does not appear to be a WLED device."
            }), 200

        if isinstance(info, dict) and ('ver' in info or 'leds' in info or info.get('brand') == 'WLED'):
            device_name = info.get('name', 'WLED')
            version = info.get('ver', 'Unknown')
            led_count = info.get('leds', {}).get('count') if isinstance(info.get('leds'), dict) else None

            # Spawn double-flash pulse asynchronously in a background thread
            threading.Thread(target=double_flash_esp, args=(ip,), daemon=True).start()

            detail = f"Verified WLED device: \"{device_name}\" (v{version}"
            if led_count is not None:
                detail += f", {led_count} LEDs"
            detail += "). Pulsing lights..."

            return jsonify({
                "success": True,
                "message": detail,
                "name": device_name,
                "version": version,
                "led_count": led_count
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": f"Device at {ip} responded, but lacks WLED signatures. It does not appear to be a WLED controller."
            }), 200

    except requests.exceptions.ConnectTimeout:
        port_suffix = f" on port {ip.split(':')[1]}" if ':' in ip else " on port 80"
        return jsonify({
            "success": False,
            "error": f"Connection timed out while trying to reach {ip}{port_suffix}."
        }), 200
    except requests.exceptions.ConnectionError:
        return jsonify({
            "success": False,
            "error": f"Could not connect to device at {ip} (Connection refused or host unreachable)."
        }), 200
    except requests.exceptions.RequestException as e:
        return jsonify({
            "success": False,
            "error": f"Failed to connect to device at {ip}: {str(e)}"
        }), 200
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Unexpected error while testing {ip}: {str(e)}"
        }), 200


@app.route('/api/esp/<id>', methods=['GET', 'PUT', 'DELETE'])

def handle_esp(id):
    if request.method == 'GET':
        esp_data = db.get_esp_settings_by_ip(id)
        if esp_data is not None:
            return jsonify(esp_data)
        else:
            return jsonify({'error': 'ESP not found'}), 404

    elif request.method == 'PUT':
        esp_data = request.get_json(silent=True)
        if not esp_data or not isinstance(esp_data, dict):
            return jsonify({'error': 'No data provided'}), 400
        is_valid, err = validate_esp_dimensions(esp_data)
        if not is_valid:
            return jsonify({'error': err}), 400
        db.update_esp_settings(id, esp_data)
        return jsonify({'success': True})

    elif request.method == 'DELETE':
        db.delete_esp_settings(id)
        return jsonify({'success': True})


# Route to handle GET and POST requests for items
@app.route('/api/items', methods=['GET', 'POST'])
def items():
    if request.method == 'GET':
        items = db.read_items()
        return jsonify(items)
    elif request.method == 'POST':
        item = request.get_json(silent=True)
        if not item or not isinstance(item, dict) or not str(item.get('name', '')).strip():
            return jsonify({'error': 'Name required'}), 400
        id = db.write_item(item)
        item['id'] = id
        return jsonify(item)


# Route to handle GET, PUT, DELETE requests for a specific item
@app.route('/api/items/<id>', methods=['GET', 'PUT', 'DELETE', 'POST'])
def item(id):
    item = db.get_item(id)
    if item is None:
        return jsonify({'error': 'Item not found'}), 404

    if request.method == 'GET':
        return jsonify(item)

    elif request.method == 'PUT':
        if request.headers.get('Update-Quantity') == 'true':
            db.update_item_quantity(id, request.get_json())
        elif request.headers.get('Update-Image') == 'true':
            db.update_item_image(id, request.get_json())
        else:
            db.update_item(id, request.get_json())
        return jsonify(db.get_item(id))

    elif request.method == 'DELETE':
        db.delete_item(id)
        return jsonify({'success': True})
    elif request.method == 'POST':
        if request.form.get('action') == 'locate':
            item_ip = item.get('ip', '')
            if not item_ip or not str(item_ip).strip():
                return jsonify({'error': 'No cabinet assigned to this part'}), 400

            if is_valid_url_or_ip(item_ip):
                ip = item_ip
            else:
                ip = db.get_ip_by_name(item_ip)

            if not ip:
                return jsonify({'error': 'ESP configuration not found'}), 400

            esp = db.get_esp_settings_by_ip(ip)
            if not esp:
                return jsonify({'error': 'ESP device settings not found in database'}), 400

            try:
                raw_positions = json.loads(item.get('position', '[]')) if isinstance(item.get('position'), str) else item.get('position', [])
                if not isinstance(raw_positions, list):
                    raw_positions = []
            except Exception:
                raw_positions = []

            if not raw_positions:
                return jsonify({'error': 'No bin location assigned to this part'}), 400

            light(item.get('position', '[]'), ip, esp, item.get('quantity', 1))
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Invalid action'}), 400


def send_request(target_ip, data, timeout=2.0):
    url = f"http://{target_ip}/json/state"

    try:
        response = requests.post(url, json=data, timeout=timeout)
        # Check for successful response, and handle accordingly

        if response.status_code == 200:
            # Success
            app.request_amount += 1
        else:
            # Handle other status codes (e.g., 404, 500, etc.) as needed
            print(f"Request failed with status code {response.status_code}")
    except requests.RequestException as e:
        # Covers connection errors, timeouts and other request failures
        print(f"Request to {target_ip} failed: {e}")


def get_total_leds(ip):
    try:
        response = requests.get(f"http://{ip}/json/info", timeout=2)
        response.raise_for_status()
        info = response.json()
        return info['leds']['count']
    except requests.RequestException as e:
        print(f"Error fetching total LEDs: {e}")
        return 1000  # Default value if the request fails


def cancel_off_timer(ip=None):
    # Cancel the pending turn-off timer for one ESP, or for all ESPs (thread-safe)
    with app.state_lock:
        ips = [ip] if ip else list(app.off_timers.keys())
        for key in ips:
            timer = app.off_timers.pop(key, None)
            if timer:
                timer.cancel()


def set_leds(led_indices, color, off_color, ip, testing=False):
    # Get the total number of LEDs from the WLED API
    total_leds = get_total_leds(ip)

    # A new locate action supersedes any pending turn-off for this ESP
    cancel_off_timer(ip)

    # Clear existing segments if they exist
    if app.delSegments:
        off_data = {"on": False, "bri": 0, "transition": 0, "mainseg": 0, "seg": []}
        send_request(ip, off_data)
        time.sleep(0.3)
    else:
        # Turn off all LEDs with the off_color
        payload = {
            "on": False,
            "seg": {"i": []}
        }
        send_request(ip, payload)
        time.sleep(0.3)

    def build_off_payload():
        # Payload that resets all LEDs to the standby color
        payload = {
            "on": True,
            "seg": {"i": []}
        }
        for i in range(total_leds):
            payload["seg"]["i"].extend([i, off_color[1:]])
        return payload

    # Convert the LED indices from a string to a list of integers if necessary
    if isinstance(led_indices, str):
        led_indices_new = list(map(int, led_indices.split(',')))
    else:
        led_indices_new = list(map(int, led_indices))

    # Check if the new positions are different from the previous ones
    with app.state_lock:
        is_different = (app.previous_positions.get(ip) != led_indices_new)

    toggled_off = False
    if is_different:
        # Initialize payload for turning on LEDs with the desired color
        on_payload = {
            "on": True,
            "seg": {"i": []}
        }

        # Light up the current LEDs with the desired color
        for i in led_indices_new:
            on_payload["seg"]["i"].extend([i, color[1:]])

        # Send the API request to set the colors of the LEDs
        send_request(ip, on_payload)

        # Update the previous positions to the current ones
        with app.state_lock:
            app.previous_positions[ip] = led_indices_new
    else:
        # If the positions are the same, turn off all LEDs
        send_request(ip, build_off_payload())
        with app.state_lock:
            app.previous_positions.pop(ip, None)
        toggled_off = True

    # Schedule turning the LEDs off after the timeout, without blocking the request
    if testing:
        time.sleep(app.timeout + 3)  # Ensure a minimum delay during testing
    elif app.timeout > 0 and not toggled_off:
        def turn_off():
            send_request(ip, build_off_payload())
            with app.state_lock:
                app.previous_positions.pop(ip, None)
                app.off_timers.pop(ip, None)

        timer = threading.Timer(app.timeout, turn_off)
        timer.daemon = True
        with app.state_lock:
            app.off_timers[ip] = timer
        timer.start()

    app.delSegments = True


def light(positions, ip, esp, quantity=1, testing=False):
    # Set global settings
    set_global_settings()
    if not esp:
        print(f"Warning: ESP configuration missing for {ip}")
        return

    try:
        raw_positions = json.loads(positions) if isinstance(positions, str) else positions
        if not isinstance(raw_positions, list):
            raw_positions = []
    except (json.JSONDecodeError, TypeError, ValueError):
        raw_positions = []

    positions_list = position_optimization(sorted(raw_positions), esp)

    try:
        qty = int(quantity)
    except (ValueError, TypeError):
        qty = 0

    if testing:
        set_leds(positions_list, app.locateColor, app.standbyColor, ip, testing)
    elif qty <= 0:
        set_leds(positions_list, "#FF0000", app.standbyColor, ip, testing)
    else:
        set_leds(positions_list, app.locateColor, app.standbyColor, ip, testing)


def _calc_section_led(pos, rows, columns, start_y, start_x, serpentine_direction):
    if start_x == "1":
        start_x = "right"
    if serpentine_direction == "1":
        serpentine_direction = "vertical"

    i = pos - 1
    if serpentine_direction == "horizontal":
        row = i // columns
        column = i % columns if row % 2 == 0 else columns - 1 - (i % columns)
    else:
        column = i // rows
        row = i % rows if column % 2 == 0 else rows - 1 - (i % rows)

    if start_x == "right":
        column = columns - 1 - column
    if start_y == "bottom":
        row = rows - 1 - row

    if row % 2 == 0:
        return row * columns + column
    else:
        return row * columns + (columns - 1 - column)


def position_optimization(positions, esp):
    segments = []
    if not esp or not positions:
        return segments

    sections = esp.get('sections')
    if isinstance(sections, list) and len(sections) > 0:
        sec_info = []
        cur_bin = 1
        cur_led_offset = 0
        for s in sections:
            try:
                s_rows = int(s.get('rows', 1))
                s_cols = int(s.get('cols', 1))
            except (ValueError, TypeError):
                continue
            if s_rows <= 0 or s_cols <= 0:
                continue
            b_count = s_rows * s_cols
            s_start_y = str(s.get('start_top', esp.get('start_top', 'top'))).lower()
            s_start_x = str(s.get('start_left', esp.get('start_left', 'left'))).lower()
            s_serp = str(s.get('serpentine_direction', esp.get('serpentine_direction', 'horizontal'))).lower()
            sec_info.append({
                'bin_start': cur_bin,
                'bin_end': cur_bin + b_count - 1,
                'led_offset': cur_led_offset,
                'rows': s_rows,
                'cols': s_cols,
                'start_y': s_start_y,
                'start_x': s_start_x,
                'serp': s_serp
            })
            cur_bin += b_count
            cur_led_offset += b_count

        if not sec_info:
            return segments

        for pos in positions:
            try:
                pos_int = int(pos)
            except (ValueError, TypeError):
                continue
            for sec in sec_info:
                if sec['bin_start'] <= pos_int <= sec['bin_end']:
                    rel_pos = pos_int - sec['bin_start'] + 1
                    local_led = _calc_section_led(
                        rel_pos, sec['rows'], sec['cols'],
                        sec['start_y'], sec['start_x'], sec['serp']
                    )
                    segments.append(sec['led_offset'] + local_led)
                    break
        return segments

    try:
        rows = int(esp.get('rows', 1))
        columns = int(esp.get('cols', 1))
    except (ValueError, TypeError):
        return segments

    if rows <= 0 or columns <= 0:
        return segments

    start_y = str(esp.get('start_top', 'top')).lower()
    start_x = str(esp.get('start_left', 'left')).lower()
    serpentine_direction = str(esp.get('serpentine_direction', 'horizontal')).lower()

    for pos in positions:
        try:
            pos_int = int(pos)
        except (ValueError, TypeError):
            continue
        segments.append(_calc_section_led(pos_int, rows, columns, start_y, start_x, serpentine_direction))

    return segments


@app.route('/test_lights', methods=['POST'])
def test_lights():
    set_global_settings()
    lights_list = request.get_json(silent=True)
    if not lights_list or not isinstance(lights_list, dict):
        return {'error': 'Invalid payload'}, 400
    for ip, positions in lights_list.items():
        # Validate positions list
        if not positions or not all(isinstance(pos, int) for pos in positions):
            return {'error': 'Invalid positions list'}, 400
        positions_json = json.dumps(positions)
        esp = db.get_esp_settings_by_ip(ip)
        light(positions_json, ip, esp, 1, True)
    return {'status': 'Lights controlled'}


def hex_to_rgb(hex_color):
    if hex_color:
        # Remove '#' if present in the hexadecimal color code
        if hex_color.startswith('#'):
            hex_color = hex_color[1:]

        # Check if the input is a valid hexadecimal color value
        if len(hex_color) != 6 or not all(c in '0123456789abcdefABCDEF' for c in hex_color):
            # If not valid, return default colors (red, green, blue)
            return [0, 255, 0]

        # Convert hexadecimal color code to RGB
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)

        return [r, g, b]
    else:
        return [0, 255, 0]


@app.route('/led/on', methods=['GET'])
def turn_led_on():
    set_global_settings()
    cancel_off_timer()
    app.previous_positions = {}  # Reset previous positions
    if request.method == 'GET':
        ips = get_unique_ips_from_database()

        def process_ip_on(ip):
            total_leds = get_total_leds(ip)
            on_data = {
                "on": True,
                "bri": round(255 * app.brightness),
                "transition": 5,
                "mainseg": 0,
                "seg": [
                    {
                        "id": 0,
                        "start": 0,
                        "stop": total_leds,
                        "grp": 1,
                        "spc": 0,
                        "of": 0,
                        "on": True,
                        "frz": False,
                        "cct": 127,
                        "set": 0,
                        "col": [hex_to_rgb(app.standbyColor)],
                        "fx": 0,
                        "sx": 128,
                        "ix": 128,
                        "pal": 0,
                        "c1": 128,
                        "c2": 128,
                        "c3": 16,
                        "sel": True,
                        "rev": False,
                        "mi": False,
                        "o1": False,
                        "o2": False,
                        "o3": False,
                        "si": 0,
                        "m12": 1
                    },
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0},
                    {"stop": 0}
                ]
            }
            send_request(ip, on_data)

        if ips:
            with ThreadPoolExecutor(max_workers=min(10, len(ips))) as executor:
                list(executor.map(process_ip_on, ips))
        return jsonify({'success': True})


# Route to turn the LED off
@app.route('/led/off', methods=['GET'])
def turn_led_off():
    ips = get_unique_ips_from_database()
    cancel_off_timer()
    app.previous_positions = {}  # Reset previous positions

    def process_ip_off(ip):
        total_leds = get_total_leds(ip)
        off_data = {
            "on": False,
            "transition": 5,
            "seg": [
                {
                    "id": 0,
                    "start": 0,
                    "stop": total_leds,
                },
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0},
                {"stop": 0}
            ]
        }
        send_request(ip, off_data)

    if ips:
        with ThreadPoolExecutor(max_workers=min(10, len(ips))) as executor:
            list(executor.map(process_ip_off, ips))
    return jsonify({'success': True})


# Route to turn the LED to Party
@app.route('/led/party', methods=['GET'])
def turn_led_party():
    cancel_off_timer()
    app.previous_positions = {}  # Reset previous positions
    set_global_settings()
    if request.method == 'GET':
        ips = get_unique_ips_from_database()
        party_data = {"on": True, "bri": round(255 * app.brightness), "transition": 5, "mainseg": 0, "seg": [
            {"id": 0, "grp": 1, "spc": 0, "of": 0, "on": True, "frz": False, "bri": 255, "cct": 127, "set": 0,
             "col": [[255, 255, 255], [0, 0, 0], [0, 0, 0]], "fx": 9, "sx": 128, "ix": 128, "pal": 0, "c1": 128,
             "c2": 128, "c3": 16},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0},
            {"stop": 0}]}

        def process_ip_party(ip):
            send_request(ip, party_data)

        if ips:
            with ThreadPoolExecutor(max_workers=min(10, len(ips))) as executor:
                list(executor.map(process_ip_party, ips))
        return jsonify({'success': True})


@app.route('/api/builds', methods=['GET', 'POST'])
def builds():
    if request.method == 'GET':
        include_parts = request.args.get('include_parts', '').lower() in ('true', '1')
        return jsonify(db.read_builds(include_parts=include_parts)), 200
    elif request.method == 'POST':
        data = request.get_json()
        if not data or not data.get('name'):
            return jsonify({'error': 'Name required'}), 400
        build_id = db.write_build(data['name'])
        if data.get('items'):
            db.set_build_items(build_id, data['items'])
        return jsonify({'id': build_id, 'name': data['name']}), 201


@app.route('/api/builds/<int:build_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_build(build_id):
    if request.method == 'GET':
        build_items = db.get_build_items(build_id)
        return jsonify({'id': build_id, 'items': build_items}), 200
    elif request.method == 'PUT':
        data = request.get_json()
        if data.get('name'):
            db.update_build_name(build_id, data['name'])
        if 'items' in data:
            db.set_build_items(build_id, data['items'])
        return jsonify({'success': True})
    elif request.method == 'DELETE':
        db.delete_build(build_id)
        return jsonify({'success': True})


@app.route('/api/builds/<int:build_id>/execute', methods=['POST'])
def execute_build(build_id):
    try:
        warnings = db.execute_build(build_id)
        return jsonify({'success': True, 'warnings': warnings}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/translations', methods=['GET'])
def get_languages():
    # Define the directory containing the translation files, relative to the location of app.py
    translations_dir = os.getenv('TRANSLATIONS_DIR', os.path.join(os.path.dirname(__file__), 'static', 'translations'))

    try:
        # List all .json files in the translations directory
        languages = [f.split('.')[0] for f in os.listdir(translations_dir) if f.endswith('.json')]
        return jsonify(languages), 200
    except Exception as e:
        print(f"Error fetching languages: {e}")
        return jsonify({"error": "An error occurred fetching available languages"}), 500



@app.route('/api/vendor/check-updates', methods=['GET'])
def check_vendor_updates():
    """Check vendored frontend libraries for available updates."""
    try:
        # Import the check function from scripts/update_vendor.py
        scripts_dir = os.path.join(os.path.dirname(__file__), 'scripts')
        sys.path.insert(0, scripts_dir)
        from update_vendor import check_updates_api
        sys.path.pop(0)

        manifest_path = os.path.join(
            os.path.dirname(__file__), 'static', 'vendor', 'vendor_manifest.json'
        )
        result = check_updates_api(manifest_path)
        return jsonify(result), 200
    except FileNotFoundError:
        return jsonify({'error': 'Vendor manifest not found'}), 404
    except Exception as e:
        return jsonify({'error': f'Update check failed: {str(e)}'}), 500



if __name__ == '__main__':
    # Use Waitress WSGI server in production; fallback to dev server if debug requested
    if os.getenv('FLASK_ENV') == 'development' or os.getenv('DEBUG') == 'true':
        app.run(host="0.0.0.0", port=5000, debug=True)
    else:
        try:
            from waitress import serve
            threads = int(os.getenv('WAITRESS_THREADS', '6'))
            print(f"Starting Spotlight Storage with Waitress WSGI server on port 5000 (threads={threads})...")
            serve(app, host="0.0.0.0", port=5000, threads=threads)
        except ImportError:
            print("Waitress not available, falling back to standard Flask development server...")
            app.run(host="0.0.0.0", port=5000, debug=False)
