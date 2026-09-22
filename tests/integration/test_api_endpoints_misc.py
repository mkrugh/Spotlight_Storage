import json
import pytest
import requests
from unittest.mock import MagicMock

import db


class TestApiEndpointsMisc:
    """
    Integration tests for miscellaneous and utility endpoints:
    /test_lights, /api/translations, /favicon.ico, and index.
    """

    def test_get_index_page(self, client):
        """Verify root page / returns 200 OK and renders index HTML with sorting controls and updated links."""
        response = client.get('/')
        assert response.status_code == 200
        html = response.data.decode('utf-8')
        assert '<html' in html.lower()

        # Sorting controls
        assert 'id="sort-dir-asc"' in html
        assert 'id="sort-dir-desc"' in html
        assert 'id="sort_method"' in html

        # New UI elements
        assert 'id="settings_btn_tooltip"' in html
        assert 'id="test-esp-btn"' in html
        assert 'id="open-map-btn"' in html

        # Updated repository & issues links
        assert 'https://github.com/mkrugh/Spotlight_Storage' in html
        assert 'https://github.com/mkrugh/Spotlight_Storage/issues' in html

        # Deprecated links removed
        assert 'paypal.com' not in html
        assert 'patreon.com' not in html
        assert 'discord.gg' not in html

    def test_get_favicon(self, client):
        """Verify /favicon.ico serves the favicon with correct MIME type."""
        response = client.get('/favicon.ico')
        assert response.status_code == 200
        assert 'image/vnd.microsoft.icon' in response.content_type

    def test_get_translations(self, client):
        """Verify /api/translations discovers and returns available language codes."""
        response = client.get('/api/translations')
        assert response.status_code == 200
        languages = response.get_json()
        assert isinstance(languages, list)
        assert 'en' in languages
        assert 'de' in languages
        assert len(languages) >= 5

    def test_test_lights_success(self, client, sample_esp, monkeypatch):
        """Verify POST /test_lights successfully controls LED segments on configured ESPs."""
        post_calls = []

        def mock_post(url, json=None, timeout=None):
            post_calls.append({'url': url, 'json': json})
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            return mock_resp

        monkeypatch.setattr(requests, 'post', mock_post)
        import time
        monkeypatch.setattr(time, 'sleep', lambda s: None)

        payload = {
            sample_esp['esp_ip']: [1, 2, 3]
        }
        response = client.post('/test_lights', json=payload)
        assert response.status_code == 200
        assert response.get_json() == {'status': 'Lights controlled'}
        assert len(post_calls) >= 1

    def test_test_lights_invalid_payloads(self, client):
        """Verify /test_lights validates positions list and payload shape."""
        # Empty body
        res = client.post('/test_lights', json={})
        assert res.status_code == 400

        # Non-dict body
        res = client.post('/test_lights', json=[1, 2, 3])
        assert res.status_code == 400

        # Empty positions list
        res = client.post('/test_lights', json={'192.168.1.100': []})
        assert res.status_code == 400
        assert 'Invalid positions' in res.get_json()['error']

        # Non-integer positions
        res = client.post('/test_lights', json={'192.168.1.100': ['one', 'two']})
        assert res.status_code == 400
        assert 'Invalid positions' in res.get_json()['error']

    def test_check_vendor_updates_success(self, client, monkeypatch):
        """Verify GET /api/vendor/check-updates returns library status information."""
        import sys
        import os
        scripts_dir = os.path.join(os.path.dirname(__file__), '../../scripts')
        sys.path.insert(0, os.path.abspath(scripts_dir))
        import update_vendor
        sys.path.pop(0)

        # Mock npm lookup to return deterministic versions offline
        def mock_get_npm(pkg):
            if pkg == 'bootstrap':
                return '5.3.3'
            return '1.0.0'

        monkeypatch.setattr(update_vendor, 'get_latest_npm_version', mock_get_npm)

        res = client.get('/api/vendor/check-updates')
        assert res.status_code == 200
        data = res.get_json()
        assert 'libraries' in data
        assert 'has_updates' in data
        assert 'update_command' in data
        assert isinstance(data['libraries'], list)
        names = [lib['name'] for lib in data['libraries']]
        assert 'bootstrap' in names
        assert 'jquery' in names

