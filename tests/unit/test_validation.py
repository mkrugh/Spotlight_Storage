import pytest
from app import is_valid_url_or_ip, ALLOWED_IMAGE_EXTENSIONS


class TestValidation:
    """
    Tests for validation helpers in app.py.
    """

    def test_valid_ipv4(self):
        assert is_valid_url_or_ip("192.168.1.50") is True
        assert is_valid_url_or_ip("10.0.0.1") is True
        assert is_valid_url_or_ip("172.16.0.254") is True

    def test_valid_hostnames(self):
        assert is_valid_url_or_ip("esp32.local") is True
        assert is_valid_url_or_ip("wled-storage.lan") is True
        assert is_valid_url_or_ip("my-esp.home") is True

    def test_invalid_strings(self):
        assert is_valid_url_or_ip("not an ip or url") is False
        assert is_valid_url_or_ip("!!!") is False

    def test_allowed_image_extensions(self):
        assert "png" in ALLOWED_IMAGE_EXTENSIONS
        assert "jpg" in ALLOWED_IMAGE_EXTENSIONS
        assert "jpeg" in ALLOWED_IMAGE_EXTENSIONS
        assert "gif" in ALLOWED_IMAGE_EXTENSIONS
        assert "webp" in ALLOWED_IMAGE_EXTENSIONS

    def test_disallowed_image_extensions(self):
        dangerous_extensions = ["exe", "py", "sh", "bat", "svg", "html", "js", "php"]
        for ext in dangerous_extensions:
            assert ext not in ALLOWED_IMAGE_EXTENSIONS
