import json
import pytest
import requests
from unittest.mock import patch, MagicMock


class TestWledController:
    """
    Integration tests for WLED hardware communication and locate functionality.
    """

    def test_locate_item_success(self, client, sample_esp, monkeypatch):
        # Create item linked to sample_esp
        item_res = client.post('/api/items', json={
            'name': 'Capacitor 100uF',
            'position': '[1]',
            'quantity': 10,
            'ip': sample_esp['esp_ip']
        })
        item_id = item_res.get_json()['id']

        recorded_requests = []

        def mock_post(url, json=None, timeout=2.0):
            recorded_requests.append({'url': url, 'json': json})
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            return mock_resp

        def mock_get(url, timeout=2):
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {'leds': {'count': 30}}
            return mock_resp

        monkeypatch.setattr(requests, 'post', mock_post)
        monkeypatch.setattr(requests, 'get', mock_get)

        # Trigger locate action
        response = client.post(f'/api/items/{item_id}', data={'action': 'locate'})
        assert response.status_code == 200
        assert response.get_json() == {'success': True}

        # Verify requests were sent to the ESP state endpoint
        state_posts = [r for r in recorded_requests if '/json/state' in r['url']]
        assert len(state_posts) >= 1

    def test_locate_item_invalid_action(self, client, sample_esp):
        item_res = client.post('/api/items', json={'name': 'Item', 'ip': sample_esp['esp_ip']})
        item_id = item_res.get_json()['id']

        response = client.post(f'/api/items/{item_id}', data={'action': 'unknown_action'})
        assert response.status_code == 400

    def test_locate_item_network_failure_handled(self, client, sample_esp, monkeypatch):
        """Verify server does not crash if ESP cannot be reached."""
        item_res = client.post('/api/items', json={
            'name': 'Inductor',
            'position': '[2]',
            'quantity': 5,
            'ip': sample_esp['esp_ip']
        })
        item_id = item_res.get_json()['id']

        def mock_request_fail(*args, **kwargs):
            raise requests.RequestException("Connection timed out")

        monkeypatch.setattr(requests, 'post', mock_request_fail)
        monkeypatch.setattr(requests, 'get', mock_request_fail)

        # Locate should handle network failure gracefully and return 200 success
        response = client.post(f'/api/items/{item_id}', data={'action': 'locate'})
        assert response.status_code == 200

    def test_global_led_endpoints(self, client, sample_esp, monkeypatch):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {'leds': {'count': 20}}
        monkeypatch.setattr(requests, 'post', lambda *args, **kwargs: mock_resp)
        monkeypatch.setattr(requests, 'get', lambda *args, **kwargs: mock_resp)

        # Test /led/on
        on_res = client.get('/led/on')
        assert on_res.status_code == 200

        # Test /led/off
        off_res = client.get('/led/off')
        assert off_res.status_code == 200

        # Test /led/party
        party_res = client.get('/led/party')
        assert party_res.status_code == 200
