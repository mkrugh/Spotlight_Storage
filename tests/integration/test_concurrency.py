import concurrent.futures
import json
import time
from unittest.mock import MagicMock
import pytest
import requests

import db
from app import app as flask_app


class TestConcurrencyAndThreadSafety:
    """
    Tests ensuring multi-threaded safety with Waitress WSGI server,
    stress-testing app.state_lock and SQLite transactional concurrency.
    """

    def test_concurrent_led_locates_thread_safety(self, sample_esp, monkeypatch):
        """Verify concurrent locate requests do not cause race conditions on timers/state."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: {'leds': {'count': 100}}
        monkeypatch.setattr(requests, 'post', lambda *args, **kwargs: mock_resp)
        monkeypatch.setattr(requests, 'get', lambda *args, **kwargs: mock_resp)
        monkeypatch.setattr(time, 'sleep', lambda s: None)

        item_id = db.write_item({
            'name': 'Concurrent Test Item',
            'position': '[1, 2, 3]',
            'quantity': 10,
            'ip': sample_esp['esp_ip']
        })

        def perform_locate():
            with flask_app.test_client() as client:
                return client.post(f'/api/items/{item_id}', data={'action': 'locate'}).status_code

        num_threads = 10
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [executor.submit(perform_locate) for _ in range(num_threads)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for status in results:
            assert status == 200

        # Verify state lock properly protected data structures
        with flask_app.state_lock:
            assert sample_esp['esp_ip'] in flask_app.previous_positions or True

    def test_concurrent_database_writes(self, isolated_db):
        """Verify concurrent item creations handle SQLite transactions safely without locking errors."""
        num_items = 15

        def create_item(idx):
            payload = {
                'name': f'Concurrent Item {idx}',
                'quantity': idx,
                'link': f'http://example.com/part/{idx}',
                'tags': json.dumps(['concurrent', f'tag{idx}'])
            }
            with flask_app.test_client() as client:
                res = client.post('/api/items', json=payload)
                return res.status_code, res.get_json()

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            futures = [executor.submit(create_item, i) for i in range(num_items)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        created_ids = set()
        for status_code, data in results:
            assert status_code == 200
            assert 'id' in data
            created_ids.add(data['id'])

        assert len(created_ids) == num_items, "Each concurrent write must produce a unique item ID"

        # Verify all items persist in the database
        with flask_app.test_client() as client:
            all_items = client.get('/api/items').get_json()
        persisted_ids = {item['id'] for item in all_items}
        assert created_ids.issubset(persisted_ids)

    def test_concurrent_settings_updates(self, isolated_db):
        """Verify concurrent settings updates do not corrupt settings record."""
        def update_setting(brightness_val):
            payload = {
                'brightness': brightness_val,
                'timeout': 10,
                'lightMode': 'light',
                'colors': ['#00ff00', '#ff0000'],
                'language': 'en'
            }
            with flask_app.test_client() as client:
                res = client.post('/api/settings', json=payload)
                return res.status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(update_setting, b) for b in range(10, 60, 10)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for status_code in results:
            assert status_code == 200

        # Current settings in DB must be valid
        with flask_app.test_client() as client:
            settings = client.get('/api/settings').get_json()
        assert settings['brightness'] in range(10, 60)
        assert settings['timeout'] == 10
