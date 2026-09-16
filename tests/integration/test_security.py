import io
import json
import pytest
import requests
from unittest.mock import MagicMock
import db


class TestSecurityHardening:
    """
    Automated regression tests for security fixes documented in Active_Run/security_fixes.md.
    """

    def test_ssrf_private_and_loopback_ips_blocked(self, client):
        """SEC-01: Verify that private IP ranges and localhost are blocked by proxy-image."""
        restricted_urls = [
            'http://127.0.0.1:5000/api/settings',
            'http://localhost:5000/api/items',
            'http://10.0.0.1/secret',
            'http://192.168.1.1/admin',
            'http://169.254.169.254/latest/meta-data/',
            'http://0.0.0.0/'
        ]
        for url in restricted_urls:
            response = client.get(f'/proxy-image?url={url}')
            assert response.status_code == 400, f"Expected {url} to be blocked by SSRF filter"
            assert 'Invalid URL or restricted host' in response.get_json()['error']

    def test_svg_image_blocked(self, client, monkeypatch):
        """SEC-03: Verify that SVG images are blocked to prevent script execution."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {'Content-Type': 'image/svg+xml'}
        mock_resp.content = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        monkeypatch.setattr(requests, 'get', lambda *args, **kwargs: mock_resp)

        response = client.get('/proxy-image?url=https://example.com/exploit.svg')
        assert response.status_code == 400
        assert 'does not point to an image' in response.get_json()['error']

    def test_proxy_image_size_cap(self, client, monkeypatch):
        """SEC-01: Verify that oversized image buffers (> 5MB) are rejected."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {'Content-Type': 'image/png', 'Content-Length': str(6 * 1024 * 1024)}
        mock_resp.content = b'A' * (6 * 1024 * 1024)
        monkeypatch.setattr(requests, 'get', lambda *args, **kwargs: mock_resp)

        response = client.get('/proxy-image?url=https://example.com/huge.png')
        assert response.status_code == 400
        assert 'exceeds maximum allowed size' in response.get_json()['error']

    def test_upload_filename_uniqueness_prevents_overwrite(self, client):
        """SEC-04: Verify uploading two files with identical names produces unique files."""
        data1 = {'file': (io.BytesIO(b'content A'), 'board.png')}
        res1 = client.post('/upload', data=data1, content_type='multipart/form-data')
        assert res1.status_code == 200
        url1 = res1.data.decode()

        data2 = {'file': (io.BytesIO(b'content B'), 'board.png')}
        res2 = client.post('/upload', data=data2, content_type='multipart/form-data')
        assert res2.status_code == 200
        url2 = res2.data.decode()

        assert url1 != url2, "Subsequent uploads with the same name must not overwrite"
        assert 'board.png' in url1
        assert 'board.png' in url2

    def test_security_headers_present(self, client):
        """SEC-06: Verify HTTP defense-in-depth headers are injected."""
        response = client.get('/')
        assert response.status_code == 200
        assert response.headers.get('X-Content-Type-Options') == 'nosniff'
        assert response.headers.get('X-Frame-Options') == 'SAMEORIGIN'
        assert response.headers.get('Referrer-Policy') == 'strict-origin-when-cross-origin'

    def test_corrupted_tag_json_handled_defensively(self, client, isolated_db):
        """SEC-08: Verify corrupted/non-JSON tags do not crash /api/tags."""
        db.write_item({'name': 'Item Valid', 'tags': json.dumps(['resistor'])})
        # Directly insert invalid non-JSON tags
        db.write_item({'name': 'Item Corrupt', 'tags': 'legacy, plain, text'})

        response = client.get('/api/tags')
        assert response.status_code == 200
        data = response.get_json()
        assert isinstance(data, list)
        tags_found = [t['tag'] for t in data]
        assert 'resistor' in tags_found
        assert 'legacy' in tags_found

    def test_locate_missing_esp_handled_defensively(self, client, isolated_db):
        """SEC-08: Verify locating an item with nonexistent ESP returns clean 400 instead of 500."""
        item_id = db.write_item({
            'name': 'Orphaned Item',
            'position': '[1]',
            'quantity': 5,
            'ip': '192.168.99.99'  # Not configured in esp table
        })
        response = client.post(f'/api/items/{item_id}', data={'action': 'locate'})
        assert response.status_code == 400
        assert 'ESP device settings not found' in response.get_json()['error']
