import io
import json
import os
import pytest

import db
from app import app as flask_app


class TestPathTraversalSecurity:
    """
    Tests ensuring path traversal attacks cannot access arbitrary files or write
    outside of the designated uploads directory.
    """

    def test_image_download_path_traversal_blocked(self, client):
        """Verify requesting files with path traversal sequences returns 404."""
        traversal_attempts = [
            '/images/../app.py',
            '/images/..%2fapp.py',
            '/images/%2e%2e%2fapp.py',
            '/images/../../data/combined_data.db',
            '/images/sub/../../app.py',
            '/images/....//....//etc/passwd',
        ]
        for path in traversal_attempts:
            response = client.get(path)
            assert response.status_code == 404, f"Expected 404 for traversal path: {path}"

    def test_image_upload_path_traversal_sanitized(self, client):
        """Verify upload filenames containing directory traversal are sanitized."""
        evil_filenames = [
            '../../evil.png',
            '..\\..\\evil.png',
            'nested/../../escape.png',
        ]
        for evil_name in evil_filenames:
            data = {'file': (io.BytesIO(b'\x89PNG\r\n\x1a\nfakeimagecontent'), evil_name)}
            response = client.post('/upload', data=data, content_type='multipart/form-data')
            assert response.status_code == 200, f"Upload should succeed with sanitized name for: {evil_name}"
            saved_url = response.data.decode()

            # Ensure neither '..' nor path separators appear in the saved filename part
            saved_filename = saved_url.split('/images/')[-1]
            assert '..' not in saved_filename
            assert '/' not in saved_filename
            assert '\\' not in saved_filename

            # Ensure the file actually exists inside UPLOAD_FOLDER and nowhere outside
            expected_path = os.path.join(flask_app.config['UPLOAD_FOLDER'], saved_filename)
            assert os.path.exists(expected_path)


class TestAdvancedSSRFSecurity:
    """
    Tests ensuring SSRF protection resists obfuscation techniques, non-standard IP formats,
    IPv6 encodings, and unauthorized schemes.
    """

    def test_alternative_ip_encodings_blocked(self, client):
        """Verify decimal, octal, hex, and shorthand IP representations are rejected."""
        obfuscated_ips = [
            'http://2130706433/',       # Decimal integer for 127.0.0.1
            'http://0177.0.0.1/',       # Octal representation of 127.0.0.1
            'http://0x7f.0.0.1/',       # Hex representation of 127.0.0.1
            'http://127.1/',            # Abbreviated 127.0.0.1
            'http://0x7f000001/',       # Full hex 127.0.0.1
        ]
        for url in obfuscated_ips:
            response = client.get(f'/proxy-image?url={url}')
            assert response.status_code == 400, f"Expected SSRF filter to block obfuscated URL: {url}"
            assert 'Invalid URL or restricted host' in response.get_json()['error']

    def test_ipv6_loopback_and_special_addresses_blocked(self, client):
        """Verify IPv6 loopback, unspecified, and IPv4-mapped loopback addresses are blocked."""
        ipv6_targets = [
            'http://[::1]/',
            'http://[::]/',
            'http://[0:0:0:0:0:0:0:1]/',
            'http://[::ffff:127.0.0.1]/',
            'http://[::ffff:192.168.1.1]/',
            'http://[::ffff:10.0.0.1]/',
        ]
        for url in ipv6_targets:
            response = client.get(f'/proxy-image?url={url}')
            assert response.status_code == 400, f"Expected SSRF filter to block IPv6 URL: {url}"
            assert 'Invalid URL or restricted host' in response.get_json()['error']

    def test_url_with_credentials_blocked(self, client):
        """Verify URLs containing embedded credentials pointing to loopback/private IPs are blocked."""
        credential_urls = [
            'http://admin:secret@127.0.0.1:5000/image.png',
            'http://user:pass@[::1]:8080/image.png',
            'http://user:pass@192.168.1.1/secret.jpg',
        ]
        for url in credential_urls:
            response = client.get(f'/proxy-image?url={url}')
            assert response.status_code == 400, f"Expected SSRF filter to block credentialed URL: {url}"

    def test_non_http_schemes_blocked(self, client):
        """Verify dangerous non-HTTP URI schemes are strictly rejected."""
        dangerous_schemes = [
            'file:///etc/passwd',
            'gopher://127.0.0.1:5000/',
            'dict://127.0.0.1:11211/',
            'ftp://127.0.0.1/pub/img.png',
            'data:image/png;base64,iVBORw0KGgoAAA...',
            'javascript:alert(1)',
        ]
        for url in dangerous_schemes:
            response = client.get(f'/proxy-image?url={url}')
            assert response.status_code == 400, f"Expected non-http scheme to be rejected: {url}"
            error_msg = response.get_json()['error']
            assert ('Invalid URL' in error_msg or 'restricted host' in error_msg)

    def test_internal_domain_suffixes_blocked(self, client):
        """Verify internal network domain extensions are rejected."""
        internal_domains = [
            'http://internal-db.local/image.png',
            'http://router.lan/image.png',
            'http://metadata.internal/image.png',
            'http://gateway.home/image.png',
            'http://backup.localdomain/image.png',
        ]
        for url in internal_domains:
            response = client.get(f'/proxy-image?url={url}')
            assert response.status_code == 400, f"Expected internal domain to be rejected: {url}"


class TestSqlInjectionResiliency:
    """
    Tests verifying that database operations use parameterized queries and resist
    SQL injection attempts across all models and endpoints.
    """

    @pytest.mark.parametrize("injection_payload", [
        "'; DROP TABLE items; --",
        "' OR '1'='1",
        "admin'--",
        "\"' OR 1=1 --",
        "' UNION SELECT 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 --",
        "1; VACUUM; --",
    ])
    def test_item_sql_injection_payloads_safely_handled(self, client, isolated_db, injection_payload):
        """Verify SQL injection payloads in item fields are stored verbatim and cannot alter SQL queries."""
        payload = {
            'name': injection_payload,
            'link': f"http://example.com/test?q={injection_payload}",
            'quantity': 10,
            'tags': json.dumps(['security', injection_payload]),
        }
        res = client.post('/api/items', json=payload)
        assert res.status_code == 200
        created_id = res.get_json()['id']

        # Verify items table is intact and still readable
        all_items = client.get('/api/items').get_json()
        assert any(item['id'] == created_id for item in all_items)

        # Verify payload was stored verbatim without being executed
        single_item = client.get(f'/api/items/{created_id}').get_json()
        assert single_item['name'] == injection_payload
        assert single_item['link'] == f"http://example.com/test?q={injection_payload}"

    def test_esp_sql_injection_payloads_safely_handled(self, client, isolated_db):
        """Verify SQL injection in ESP name/IP fields is stored safely."""
        evil_esp = {
            'name': "Malicious ESP '; DROP TABLE esp; --",
            'esp_ip': "192.168.1.199'; --",
            'rows': 1,
            'cols': 1,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal',
        }
        res = client.post('/api/esp/', json=evil_esp)
        assert res.status_code == 201

        # Verify ESP table remains intact and entry exists
        all_esps = client.get('/api/esp/').get_json()
        assert any(esp['name'] == evil_esp['name'] for esp in all_esps)


class TestInputValidationAndFuzzing:
    """
    Tests ensuring endpoints handle malformed inputs, abnormal payloads, and boundary values cleanly.
    """

    def test_malformed_json_on_items_endpoint(self, client, isolated_db):
        """Verify non-JSON and malformed payloads return 400 Bad Request."""
        # Non-JSON content-type with broken body
        res = client.post('/api/items', data="not json", content_type='application/json')
        assert res.status_code == 400

        # JSON array instead of dict
        res = client.post('/api/items', json=[1, 2, 3])
        assert res.status_code == 400

        # Empty name or whitespace-only name
        res = client.post('/api/items', json={'name': '   ', 'quantity': 1})
        assert res.status_code == 400
        assert 'Name required' in res.get_json()['error']

    def test_malformed_json_on_settings_endpoint(self, client, isolated_db):
        """Verify settings endpoint rejects malformed or missing-field payloads."""
        # Empty dict
        res = client.post('/api/settings', json={})
        assert res.status_code == 400

        # Missing required fields
        res = client.post('/api/settings', json={'brightness': 50})
        assert res.status_code == 400

        # Non-JSON payload
        res = client.post('/api/settings', data="bad_data", content_type='application/json')
        assert res.status_code == 400

    def test_boundary_values_for_quantity(self, client, isolated_db):
        """Verify extreme and negative quantities are handled gracefully without 500 crashes."""
        boundary_cases = [
            {'name': 'Negative Quantity', 'quantity': -9999},
            {'name': 'Huge Quantity', 'quantity': 2147483647},
            {'name': 'Zero Quantity', 'quantity': 0},
            {'name': 'String Quantity', 'quantity': "hundred"},
        ]
        for case in boundary_cases:
            res = client.post('/api/items', json=case)
            assert res.status_code == 200
            item_id = res.get_json()['id']

            # Verify it can be retrieved without crashing
            get_res = client.get(f'/api/items/{item_id}')
            assert get_res.status_code == 200
