import pytest


class TestApiSettings:
    """
    Integration tests for /api/settings endpoints.
    """

    def test_get_settings(self, client):
        response = client.get('/api/settings')
        assert response.status_code == 200
        data = response.get_json()
        assert 'brightness' in data
        assert 'timeout' in data
        assert 'lightMode' in data

    def test_post_settings(self, client):
        payload = {
            'brightness': 80,
            'timeout': 15,
            'lightMode': 'dark',
            'colors': ['#112233', '#445566'],
            'language': 'fr'
        }
        post_res = client.post('/api/settings', json=payload)
        assert post_res.status_code == 200
        assert post_res.get_json() == {'success': True}

        # Verify updated values persisted
        get_res = client.get('/api/settings')
        data = get_res.get_json()
        assert data['brightness'] == 80
        assert data['timeout'] == 15
        assert data['lightMode'] == 'dark'
        assert data['language'] == 'fr'
