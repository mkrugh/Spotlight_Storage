import os
import tempfile
import threading
import pytest
from waitress.server import create_server

import db
from app import app as flask_app


@pytest.fixture
def ui_server(monkeypatch, tmp_path):
    """
    Spins up a lightweight Waitress WSGI server on an ephemeral port,
    running against an isolated temporary SQLite database seeded with
    test items (including positive stock and 0-stock items).
    """
    test_db_path = str(tmp_path / "ui_test_combined_data.db")
    monkeypatch.setattr(db, 'COMBINED_DATABASE', test_db_path)
    monkeypatch.setenv('COMBINED_DATABASE', test_db_path)

    # Initialize tables and seed known items
    db.create_combined_db()

    # Seed Item 1: In-stock resistor
    db.write_item({
        'name': 'Resistor 10k',
        'link': 'https://example.com/resistor',
        'image': '',
        'position': '[1]',
        'quantity': 10,
        'min_quantity': 2,
        'ip': '192.168.1.100',
        'tags': '["resistor", "passive"]'
    })

    # Seed Item 2: Zero-stock capacitor
    db.write_item({
        'name': 'Capacitor 100uF (0-Stock)',
        'link': 'https://example.com/capacitor',
        'image': '',
        'position': '[2]',
        'quantity': 0,
        'min_quantity': 1,
        'ip': '192.168.1.100',
        'tags': '["capacitor", "passive"]'
    })

    # Seed Item 3: In-stock microcontroller
    db.write_item({
        'name': 'ESP32 DevKit',
        'link': 'https://example.com/esp32',
        'image': '',
        'position': '[3]',
        'quantity': 5,
        'min_quantity': 1,
        'ip': '192.168.1.101',
        'tags': '["esp32", "microcontroller"]'
    })

    flask_app.config['TESTING'] = True
    server = create_server(flask_app, host='127.0.0.1', port=0)
    port = server.effective_port
    server_thread = threading.Thread(target=server.run, daemon=True)
    server_thread.start()

    base_url = f"http://127.0.0.1:{port}"
    yield base_url

    server.close()


@pytest.fixture
def ui_page(page, ui_server):
    """
    Navigates the Playwright page to the running UI test server and waits for the navbar.
    """
    page.goto(ui_server)
    page.wait_for_selector('#open-builds-btn', state='visible')
    return page
