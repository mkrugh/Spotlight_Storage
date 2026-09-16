import io
import pytest
import requests
from unittest.mock import MagicMock


class TestImageHandling:
    """
    Integration tests for /upload and /proxy-image endpoints.
    """

    def test_upload_missing_file(self, client):
        response = client.post('/upload')
        assert response.status_code == 400
        assert 'No file part' in response.get_json()['error']

    def test_upload_empty_filename(self, client):
        data = {'file': (io.BytesIO(b''), '')}
        response = client.post('/upload', data=data, content_type='multipart/form-data')
        assert response.status_code == 400
        assert 'No selected file' in response.get_json()['error']

    def test_upload_disallowed_extension(self, client):
        data = {'file': (io.BytesIO(b'malicious content'), 'script.py')}
        response = client.post('/upload', data=data, content_type='multipart/form-data')
        assert response.status_code == 400
        assert 'File type not allowed' in response.get_json()['error']

    def test_upload_valid_image(self, client):
        data = {'file': (io.BytesIO(b'fake png binary data'), 'test_image.png')}
        response = client.post('/upload', data=data, content_type='multipart/form-data')
        assert response.status_code == 200
        assert 'test_image.png' in response.data.decode()

    def test_proxy_image_invalid_url_scheme(self, client):
        response = client.get('/proxy-image?url=ftp://example.com/pic.png')
        assert response.status_code == 400
        assert 'Invalid URL' in response.get_json()['error']

    def test_proxy_image_non_image_content(self, client, monkeypatch):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {'Content-Type': 'text/html'}
        mock_resp.content = b'<html>Not an image</html>'
        monkeypatch.setattr(requests, 'get', lambda *args, **kwargs: mock_resp)

        response = client.get('/proxy-image?url=https://example.com/page')
        assert response.status_code == 400
        assert 'does not point to an image' in response.get_json()['error']

    def test_proxy_image_upstream_failure(self, client, monkeypatch):
        def mock_fail(*args, **kwargs):
            raise requests.RequestException("DNS lookup failed")

        monkeypatch.setattr(requests, 'get', mock_fail)

        response = client.get('/proxy-image?url=https://bad-host.com/pic.jpg')
        assert response.status_code == 502

    def test_proxy_image_success(self, client, monkeypatch):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {'Content-Type': 'image/png'}
        mock_resp.content = b'\x89PNG\r\n\x1a\n'
        monkeypatch.setattr(requests, 'get', lambda *args, **kwargs: mock_resp)

        response = client.get('/proxy-image?url=https://example.com/logo.png')
        assert response.status_code == 200
        assert response.headers['Content-Type'] == 'image/png'
        assert response.data == b'\x89PNG\r\n\x1a\n'
