import json
from unittest.mock import patch, MagicMock
import pytest
import requests


class TestApiEspTest:
    """
    Integration tests for /api/esp/test connection verification endpoint.
    """

    def test_missing_ip(self, client):
        response = client.post('/api/esp/test', json={})
        assert response.status_code == 400
        data = response.get_json()
        assert data['success'] is False
        assert "required" in data['error'].lower()

    def test_invalid_ip_format(self, client):
        response = client.post('/api/esp/test', json={'ip': '999.999.999.999'})
        assert response.status_code == 400
        data = response.get_json()
        assert data['success'] is False
        assert "not a valid" in data['error'].lower()

    def test_invalid_port_format(self, client):
        response = client.post('/api/esp/test', json={'ip': '192.168.1.50:99999'})
        assert response.status_code == 400
        data = response.get_json()
        assert data['success'] is False

    @patch('app.double_flash_esp')
    @patch('requests.get')
    def test_valid_wled_success(self, mock_get, mock_flash, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "name": "Storage Rack 1",
            "ver": "0.14.0",
            "vid": 2310130,
            "leds": {"count": 144, "pwr": 0, "fps": 42}
        }
        mock_get.return_value = mock_response

        response = client.post('/api/esp/test', json={'ip': '192.168.1.50'})
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is True
        assert data['name'] == 'Storage Rack 1'
        assert data['version'] == '0.14.0'
        assert data['led_count'] == 144
        assert "Storage Rack 1" in data['message']
        mock_get.assert_called_once_with('http://192.168.1.50/json/info', timeout=3.0)

    @patch('app.double_flash_esp')
    @patch('requests.get')
    def test_custom_port_success(self, mock_get, mock_flash, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "name": "Workshop WLED",
            "ver": "0.14.1",
            "leds": {"count": 60}
        }
        mock_get.return_value = mock_response

        response = client.post('/api/esp/test', json={'ip': 'wled.local:8080'})
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is True
        assert data['name'] == 'Workshop WLED'
        mock_get.assert_called_once_with('http://wled.local:8080/json/info', timeout=3.0)

    @patch('requests.get')
    def test_non_wled_json_device(self, mock_get, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "router_model": "AC1900",
            "uptime": 12345
        }
        mock_get.return_value = mock_response

        response = client.post('/api/esp/test', json={'ip': '192.168.1.1'})
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is False
        assert "does not appear to be a wled" in data['error'].lower()

    @patch('requests.get')
    def test_non_json_response(self, mock_get, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.side_effect = json.JSONDecodeError("Expecting value", "<html>", 0)
        mock_get.return_value = mock_response

        response = client.post('/api/esp/test', json={'ip': '192.168.1.10'})
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is False
        assert "valid json" in data['error'].lower()

    @patch('requests.get')
    def test_device_http_error(self, mock_get, client):
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_get.return_value = mock_response

        response = client.post('/api/esp/test', json={'ip': '192.168.1.20'})
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is False
        assert "500" in data['error']

    @patch('requests.get')
    def test_device_timeout(self, mock_get, client):
        mock_get.side_effect = requests.exceptions.ConnectTimeout("Connection timed out")

        response = client.post('/api/esp/test', json={'ip': '192.168.1.99'})
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is False
        assert "timed out" in data['error'].lower()

    @patch('requests.get')
    def test_device_connection_refused(self, mock_get, client):
        mock_get.side_effect = requests.exceptions.ConnectionError("Connection refused")

        response = client.post('/api/esp/test', json={'ip': '192.168.1.99'})
        assert response.status_code == 200
        data = response.get_json()
        assert data['success'] is False
        assert "could not connect" in data['error'].lower()
