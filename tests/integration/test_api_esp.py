import pytest


class TestApiEsp:
    """
    Integration tests for /api/esp/ endpoints.
    """

    def test_get_esp_list_empty(self, client):
        response = client.get('/api/esp/')
        assert response.status_code == 200
        assert response.get_json() == []

    def test_create_esp_success(self, client):
        payload = {
            'name': 'Cabinet A',
            'esp_ip': '192.168.1.180',
            'rows': 6,
            'cols': 4,
            'startTop': 'top',
            'startLeft': 'left',
            'serpentineDirection': 'horizontal'
        }
        response = client.post('/api/esp/', json=payload)
        assert response.status_code == 201
        data = response.get_json()
        assert 'id' in data
        assert data['name'] == 'Cabinet A'

    def test_create_esp_missing_data(self, client):
        response = client.post('/api/esp/', json={})
        assert response.status_code == 400

    def test_get_esp_by_ip(self, client, sample_esp):
        response = client.get(f'/api/esp/{sample_esp["esp_ip"]}')
        assert response.status_code == 200
        assert response.get_json()['name'] == 'Test ESP Matrix'

    def test_get_esp_nonexistent(self, client):
        response = client.get('/api/esp/10.0.0.99')
        assert response.status_code == 404

    def test_update_esp(self, client, sample_esp):
        update_data = {
            'name': 'Renamed Cabinet',
            'esp_ip': sample_esp['esp_ip'],
            'rows': 10,
            'cols': 10,
            'startTop': 'bottom',
            'startLeft': 'right',
            'serpentineDirection': 'vertical'
        }
        response = client.put(f'/api/esp/{sample_esp["id"]}', json=update_data)
        assert response.status_code == 200
        assert response.get_json() == {'success': True}

    def test_delete_esp(self, client, sample_esp):
        response = client.delete(f'/api/esp/{sample_esp["id"]}')
        assert response.status_code == 200
        assert response.get_json() == {'success': True}

    def test_create_and_get_multi_section_esp(self, client):
        sections = [
            {'name': 'Top', 'rows': 4, 'cols': 6, 'start_top': 'top', 'start_left': 'left', 'serpentine_direction': 'horizontal'},
            {'name': 'Bottom', 'rows': 2, 'cols': 3, 'start_top': 'top', 'start_left': 'left', 'serpentine_direction': 'horizontal'}
        ]
        payload = {
            'name': 'Multi-Section Rack',
            'esp_ip': '192.168.1.185',
            'sections': sections
        }
        response = client.post('/api/esp/', json=payload)
        assert response.status_code == 201
        created = response.get_json()
        assert 'id' in created
        assert created['name'] == 'Multi-Section Rack'
        assert created['rows'] == 6
        assert created['cols'] == 6

        # Retrieve and verify sections parsed back
        get_res = client.get('/api/esp/')
        assert get_res.status_code == 200
        all_esps = get_res.get_json()
        matching = next(e for e in all_esps if e['id'] == created['id'])
        assert matching['sections'] is not None
        assert len(matching['sections']) == 2
        assert matching['sections'][0]['cols'] == 6
        assert matching['sections'][1]['cols'] == 3
