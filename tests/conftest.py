import os
import sys
import tempfile
import pytest

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import db
from app import app as flask_app


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch, tmp_path):
    """
    Ensure every test runs against an isolated, clean temporary SQLite database.
    Prevents any modification of production data/combined_data.db.
    """
    test_db_path = str(tmp_path / "test_combined_data.db")
    monkeypatch.setattr(db, 'COMBINED_DATABASE', test_db_path)
    monkeypatch.setenv('COMBINED_DATABASE', test_db_path)

    # Initialize tables in the temporary database
    db.create_combined_db()

    yield test_db_path


@pytest.fixture
def client(isolated_db, tmp_path):
    """
    Flask test client with an isolated temporary uploads folder.
    """
    upload_dir = str(tmp_path / "test_images")
    os.makedirs(upload_dir, exist_ok=True)

    flask_app.config['TESTING'] = True
    flask_app.config['UPLOAD_FOLDER'] = upload_dir

    # Reset any active in-memory state on app
    flask_app.previous_positions = {}
    flask_app.off_timers = {}

    with flask_app.test_client() as test_client:
        yield test_client

    # Clean up any lingering timers
    for timer in flask_app.off_timers.values():
        if timer:
            timer.cancel()
    flask_app.off_timers.clear()


@pytest.fixture
def sample_esp(isolated_db):
    """Helper fixture to insert a standard test ESP configuration."""
    esp_data = {
        'name': 'Test ESP Matrix',
        'esp_ip': '192.168.1.200',
        'rows': 4,
        'cols': 5,
        'startTop': 'top',
        'startLeft': 'left',
        'serpentineDirection': 'horizontal'
    }
    esp_id = db.write_esp_settings(esp_data)
    esp_data['id'] = esp_id
    return esp_data
